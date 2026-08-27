import { useEffect, useRef, useState } from 'react'
import { getSharedGpuDevice } from '../gpuDevice'

const shader = /* wgsl */ `
struct Uniforms { size: vec2f, pointer: vec2f, previous: vec2f, state: vec2f }
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var source: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> VertexOutput {
  var p = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  var output: VertexOutput;
  output.position = vec4f(p[i], 0., 1.);
  output.uv = p[i] * vec2f(.5, -.5) + .5;
  return output;
}

fn segmentDistance(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), .0001), 0., 1.);
  return length(pa - ba * h);
}

fn triangleMask(p: vec2f) -> f32 {
  let q = p - vec2f(.5, .52);
  let d = max(abs(q.x) * .866 + q.y * .5, -q.y) - .105;
  return 1. - smoothstep(-.003, .003, d);
}

@fragment fn radianceMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let px = 1. / u.size;
  let old = textureSampleLevel(source, linearSampler, uv, 0.);
  var bounced = vec3f(0.);
  let dirs = array<vec2f, 8>(vec2f(1.,0.), vec2f(-1.,0.), vec2f(0.,1.), vec2f(0.,-1.), vec2f(.707,.707), vec2f(-.707,.707), vec2f(.707,-.707), vec2f(-.707,-.707));
  for (var i = 0; i < 8; i++) {
    bounced += textureSampleLevel(source, linearSampler, uv + dirs[i] * px * 2.2, 0.).rgb;
  }
  bounced *= .123;

  let grid = min(abs(fract(uv.x * u.size.x / 42.) - .5), abs(fract(uv.y * u.size.y / 42.) - .5));
  let albedo = mix(.975, .72, 1. - smoothstep(.015, .045, grid));
  var light = max(old.rgb * .9985, bounced * vec3f(.998, .992, .98) * albedo);

  let aspect = u.size.x / u.size.y;
  let p = vec2f(uv.x * aspect, uv.y);
  let a = vec2f(u.previous.x * aspect, u.previous.y);
  let b = vec2f(u.pointer.x * aspect, u.pointer.y);
  let stroke = (1. - smoothstep(.008, .018, segmentDistance(p, a, b))) * u.state.x;
  let hue = .5 + .5 * cos(6.28318 * (u.state.y * .083 + vec3f(0., .33, .67)));
  light = max(light, hue * 3.8 * stroke);

  let triangle = triangleMask(uv);
  light = max(light, vec3f(3.8, 3.2, 2.4) * triangle);
  return vec4f(light, 1.);
}

@fragment fn presentMain(@location(0) uv: vec2f) -> @location(0) vec4f {
  let radiance = textureSampleLevel(source, linearSampler, uv, 0.).rgb;
  let grid = min(abs(fract(uv.x * u.size.x / 42.) - .5), abs(fract(uv.y * u.size.y / 42.) - .5));
  let surface = mix(vec3f(.025), vec3f(.075), 1. - smoothstep(.015, .045, grid));
  let mapped = 1. - exp(-(surface + radiance * .72));
  let srgb = pow(max(mapped, vec3f(0.)), vec3f(1. / 2.2));
  return vec4f(srgb, 1.);
}`

export function RadianceCanvas({ intensity }: { intensity: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let stopped = false
    let frame = 0
    const cleanups: (() => void)[] = []

    async function start() {
      if (!navigator.gpu) { setError('WebGPU is not available in this browser.'); return }
      const device: any = await getSharedGpuDevice()
      if (stopped) return
      const context: any = canvas!.getContext('webgpu')
      const format = navigator.gpu.getPreferredCanvasFormat()
      context.configure({ device, format, alphaMode: 'opaque' })
      const module = device.createShaderModule({ code: shader })
      const radiancePipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vertexMain' }, fragment: { module, entryPoint: 'radianceMain', targets: [{ format: 'rgba16float' }] } })
      const presentPipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vertexMain' }, fragment: { module, entryPoint: 'presentMain', targets: [{ format }] } })
      const uniform = device.createBuffer({ size: 32, usage: 0x40 | 0x08 })
      const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' })
      let textures: any[] = []
      let views: any[] = []
      let width = 0, height = 0, ping = 0, stroke = 0
      let pointer = [.5, .5], drawing = false
      const segments: { from: number[]; to: number[]; stroke: number }[] = []

      const resize = () => {
        const dpr = Math.min(devicePixelRatio, 1.35)
        const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr))
        const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr))
        if (w === width && h === height) return
        width = w; height = h; canvas!.width = w; canvas!.height = h
        textures.forEach(texture => texture.destroy())
        textures = [0, 1].map(() => device.createTexture({ size: [w, h], format: 'rgba16float', usage: 0x10 | 0x04 }))
        views = textures.map(texture => texture.createView())
        ping = 0
      }
      const position = (event: PointerEvent) => {
        const rect = canvas!.getBoundingClientRect()
        return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height]
      }
      const down = (event: PointerEvent) => { if (!event.isPrimary) return; drawing = true; stroke++; pointer = position(event); segments.push({ from: pointer, to: pointer, stroke }); canvas!.setPointerCapture(event.pointerId) }
      const move = (event: PointerEvent) => { if (!drawing) return; const next = position(event); segments.push({ from: pointer, to: next, stroke }); pointer = next }
      const up = (event: PointerEvent) => { drawing = false; if (canvas!.hasPointerCapture(event.pointerId)) canvas!.releasePointerCapture(event.pointerId) }
      canvas!.addEventListener('pointerdown', down); canvas!.addEventListener('pointermove', move); canvas!.addEventListener('pointerup', up); canvas!.addEventListener('pointercancel', up)
      cleanups.push(() => { canvas!.removeEventListener('pointerdown', down); canvas!.removeEventListener('pointermove', move); canvas!.removeEventListener('pointerup', up); canvas!.removeEventListener('pointercancel', up) })

      const draw = () => {
        if (stopped) return
        resize()
        const segment = segments.shift()
        const from = segment?.from ?? pointer
        const to = segment?.to ?? pointer
        const data = new Float32Array([width, height, to[0], to[1], from[0], from[1], segment ? intensity : 0, segment?.stroke ?? stroke])
        device.queue.writeBuffer(uniform, 0, data)
        const encoder = device.createCommandEncoder()
        for (let passIndex = 0; passIndex < 5; passIndex++) {
          const output = 1 - ping
          const bind = device.createBindGroup({ layout: radiancePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: views[ping] }, { binding: 2, resource: sampler }] })
          const pass = encoder.beginRenderPass({ colorAttachments: [{ view: views[output], clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] })
          pass.setPipeline(radiancePipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end(); ping = output
        }
        const presentBind = device.createBindGroup({ layout: presentPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: views[ping] }, { binding: 2, resource: sampler }] })
        const present = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] })
        present.setPipeline(presentPipeline); present.setBindGroup(0, presentBind); present.draw(3); present.end()
        device.queue.submit([encoder.finish()])
        frame = requestAnimationFrame(draw)
      }
      draw()
      cleanups.push(() => textures.forEach(texture => texture.destroy()))
    }

    start().catch(() => setError('The radiance demo could not start.'))
    return () => { stopped = true; cancelAnimationFrame(frame); cleanups.forEach(cleanup => cleanup()) }
  }, [intensity])

  return <div className="canvas-shell radiance-shell">{error ? <div className="gpu-error"><span>GPU offline</span><p>{error}</p></div> : <><canvas ref={ref} aria-label="Draw light into the radiance field" /><span className="draw-hint">draw light</span></>}</div>
}
