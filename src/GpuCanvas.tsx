import { useEffect, useRef, useState } from 'react'
import { getSharedGpuDevice } from './gpuDevice'

const vertex = /* wgsl */ `
@vertex fn main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(p[i], 0., 1.);
}`

import { aurora } from './scenes/aurora'
import { ink } from './scenes/ink'
import { orbit } from './scenes/orbit'
import { cells } from './scenes/cells'
import { gravity } from './scenes/gravity'
import { prism } from './scenes/prism'
import { torus } from './scenes/torus'
import { city } from './scenes/city'

const functions = { aurora, ink, orbit, cells, gravity, prism, torus, city } as const

export type Scene = keyof typeof functions

export function GpuCanvas({ scene, intensity }: { scene: Scene; intensity: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let frame = 0
    let stopped = false
    let removePointerListener = () => {}
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const canvas = ref.current
    if (!canvas) return

    async function start() {
      const gpu = navigator.gpu
      if (!gpu) { setError('WebGPU is not available in this browser.'); return }
      const device: any = await getSharedGpuDevice()
      const context: any = canvas!.getContext('webgpu')
      const format = gpu.getPreferredCanvasFormat()
      context.configure({ device, format, alphaMode: 'opaque' })
      const shader = device.createShaderModule({ code: `${vertex}
struct U { data: vec4f, pointer: vec4f }
@group(0) @binding(0) var<uniform> u: U;
@fragment fn frag(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let size = u.data.yz;
  let aspect = size.x / size.y;
  var p = (pos.xy / size) * 2. - 1.;
  p.x *= aspect;
  let t = u.data.x;
  let mouse = (u.pointer.xy * 2. - 1.) * vec2f(aspect, -1.);
  var col = vec3f(0.);
  ${functions[scene]}
  col *= u.pointer.z;
  col = pow(max(col, vec3f(0.)), vec3f(.82));
  return vec4f(col, 1.);
}` })
      const pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module: shader, entryPoint: 'main' }, fragment: { module: shader, entryPoint: 'frag', targets: [{ format }] }, primitive: { topology: 'triangle-list' } })
      const uniform = device.createBuffer({ size: 32, usage: 0x40 | 0x08 })
      const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] })
      const pointer = { x: .5, y: .5 }
      let redraw = () => {}
      const move = (e: PointerEvent) => {
        const r = canvas!.getBoundingClientRect()
        pointer.x = (e.clientX-r.left)/r.width
        pointer.y = (e.clientY-r.top)/r.height
        if (reduceMotion) redraw()
      }
      canvas!.addEventListener('pointermove', move)
      const started = performance.now()
      const draw = () => {
        if (stopped) return
        const dpr = Math.min(devicePixelRatio, 2)
        const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr)); const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr))
        if (canvas!.width !== w || canvas!.height !== h) { canvas!.width = w; canvas!.height = h }
        const data = new Float32Array([(performance.now()-started)/1000, w, h, 0, pointer.x, pointer.y, intensity, 0])
        device.queue.writeBuffer(uniform, 0, data)
        const encoder = device.createCommandEncoder(); const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: {r:0,g:0,b:0,a:1} }] })
        pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.draw(3); pass.end(); device.queue.submit([encoder.finish()])
        if (!reduceMotion) frame = requestAnimationFrame(draw)
      }
      redraw = draw
      draw()
      return () => canvas!.removeEventListener('pointermove', move)
    }
    start().then(cleanup => {
      if (cleanup) {
        if (stopped) cleanup()
        else removePointerListener = cleanup
      }
    }).catch(() => setError('The GPU demo could not start.'))
    return () => { stopped = true; cancelAnimationFrame(frame); removePointerListener() }
  }, [scene, intensity])

  return <div className="canvas-shell">{error ? <div className="gpu-error"><span>GPU offline</span><p>{error}</p></div> : <canvas ref={ref} aria-label={`${scene} interactive WebGPU demo`} />}</div>
}
