import { useEffect, useRef, useState } from 'react'
import { getSharedGpuDevice } from './gpuDevice'

const shader = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  yaw: f32,
  pitch: f32,
  zoom: f32,
  time: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

const V0 = vec3f(0.0, 1.0, 0.0);
const V1 = vec3f(0.942809, -0.333333, 0.0);
const V2 = vec3f(-0.471405, -0.333333, 0.816497);
const V3 = vec3f(-0.471405, -0.333333, -0.816497);

fn closestVertex(p: vec3f) -> vec3f {
  var v = V0;
  var score = dot(p, V0);
  if (dot(p, V1) > score) { score = dot(p, V1); v = V1; }
  if (dot(p, V2) > score) { score = dot(p, V2); v = V2; }
  if (dot(p, V3) > score) { v = V3; }
  return v;
}

fn distanceField(point: vec3f) -> f32 {
  var p = point;
  for (var i = 0; i < 9; i++) { p = p * 2.0 - closestVertex(p); }
  let d = max(max(dot(-V0, p), dot(-V1, p)), max(dot(-V2, p), dot(-V3, p))) - 0.333333;
  return d / 512.0;
}

fn normalAt(p: vec3f, e: f32) -> vec3f {
  let a = vec3f(1.0, -1.0, -1.0);
  let b = vec3f(-1.0, -1.0, 1.0);
  let c = vec3f(-1.0, 1.0, -1.0);
  let d = vec3f(1.0, 1.0, 1.0);
  return normalize(a * distanceField(p + a*e) + b * distanceField(p + b*e) + c * distanceField(p + c*e) + d * distanceField(p + d*e));
}

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(p[i], 0., 1.);
}

@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  var screen = frag.xy / u.resolution * 2.0 - 1.0;
  screen.y = -screen.y;
  screen.x *= u.resolution.x / max(u.resolution.y, 1.0);

  let cycle = fract(u.zoom);
  let scale = exp2(-cycle);
  let branch = vec3f(-0.471405, -0.333333, 0.816497);
  let target = branch * (1.0 - scale);
  let distance = 3.15 * scale;
  let cp = cos(u.pitch); let sp = sin(u.pitch);
  let cy = cos(u.yaw); let sy = sin(u.yaw);
  let ro = target + vec3f(distance*sy*cp, distance*sp, distance*cy*cp);
  let forward = normalize(target - ro);
  let right = normalize(cross(forward, vec3f(0., 1., 0.)));
  let up = cross(right, forward);
  let rd = normalize(forward + (right*screen.x + up*screen.y) * 0.325 * scale);

  var t = 0.0;
  var hit = false;
  var glow = 0.0;
  var eps = 0.00002 * scale;
  for (var step = 0; step < 120; step++) {
    let d = distanceField(ro + rd*t);
    eps = max(0.000002, 0.00015 * scale + t*0.00008);
    glow += exp(-abs(d) / max(eps*7.0, 0.00001)) * 0.008;
    if (d < eps) { hit = true; break; }
    t += max(d*0.72, eps*0.4);
    if (t > 6.0*scale) { break; }
  }

  var color = vec3f(glow * 0.2);
  if (hit) {
    let p = ro + rd*t;
    let n = normalAt(p, eps*2.0);
    let light = normalize(vec3f(-0.55, 0.78, 0.30));
    let diffuse = max(dot(n, light), 0.0);
    let rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    color = vec3f(0.07 + diffuse*1.48 + rim*0.24);
  }
  color = color / (color + vec3f(0.72));
  color = pow(color, vec3f(1.0/2.2));
  return vec4f(color, 1.0);
}`

export function FractalCanvas({ zoom, onZoomChange }: { zoom: number; onZoomChange: (value: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const zoomRef = useRef(zoom)
  const orbitRef = useRef({ yaw: .58, pitch: .24 })
  const [error, setError] = useState('')

  useEffect(() => { zoomRef.current = zoom }, [zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    let disposed = false
    let activePointer: number | null = null
    let lastX = 0
    let lastY = 0

    const pointerDown = (event: PointerEvent) => {
      activePointer = event.pointerId
      lastX = event.clientX
      lastY = event.clientY
      canvas.setPointerCapture(event.pointerId)
    }
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return
      orbitRef.current.yaw -= (event.clientX - lastX) * .006
      orbitRef.current.pitch = Math.max(-1.15, Math.min(1.15, orbitRef.current.pitch + (event.clientY - lastY) * .006))
      lastX = event.clientX
      lastY = event.clientY
    }
    const pointerUp = (event: PointerEvent) => { if (event.pointerId === activePointer) activePointer = null }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      onZoomChange(zoomRef.current + event.deltaY * -.0015)
    }
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('pointercancel', pointerUp)
    canvas.addEventListener('wheel', wheel, { passive: false })

    async function start() {
      if (!navigator.gpu) throw new Error('WebGPU is unavailable. Open this page in a current Chrome, Edge, or Safari browser.')
      const device: any = await getSharedGpuDevice()
      const context: any = canvas!.getContext('webgpu')
      const format = navigator.gpu.getPreferredCanvasFormat()
      context.configure({ device, format, alphaMode: 'opaque' })
      const module = device.createShaderModule({ code: shader })
      const pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }] } })
      const uniform = device.createBuffer({ size: 32, usage: 0x40 | 0x08 })
      const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] })
      const started = performance.now()
      const draw = () => {
        if (disposed) return
        const dpr = Math.min(devicePixelRatio, 1.6)
        const width = Math.max(1, Math.floor(canvas!.clientWidth*dpr))
        const height = Math.max(1, Math.floor(canvas!.clientHeight*dpr))
        if (canvas!.width !== width || canvas!.height !== height) { canvas!.width = width; canvas!.height = height }
        const { yaw, pitch } = orbitRef.current
        device.queue.writeBuffer(uniform, 0, new Float32Array([width, height, yaw, pitch, zoomRef.current, (performance.now()-started)/1000, 0, 0]))
        const encoder = device.createCommandEncoder()
        const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r:0, g:0, b:0, a:1 } }] })
        pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end()
        device.queue.submit([encoder.finish()])
        frame = requestAnimationFrame(draw)
      }
      draw()
    }
    start().catch((reason) => setError(reason instanceof Error ? reason.message : 'The renderer could not start.'))
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointercancel', pointerUp)
      canvas.removeEventListener('wheel', wheel)
    }
  }, [onZoomChange])

  return error ? <div className="error"><strong>GPU offline</strong><span>{error}</span></div> : <canvas ref={canvasRef} aria-label="Interactive infinitely zooming Sierpinski tetrahedron" />
}
