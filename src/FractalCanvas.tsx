import { useEffect, useRef, useState } from 'react'
import { getSharedGpuDevice } from './gpuDevice'
import fractalSource from './fractal/source/fractal.wgsl?raw'

const vertex = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}
@vertex fn vs(@builtin(vertex_index) i: u32) -> VertexOutput {
  var positions = array<vec2f, 3>(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  var output: VertexOutput;
  output.position = vec4f(positions[i], 0., 1.);
  output.uv = positions[i] * vec2f(.5, -.5) + vec2f(.5);
  return output;
}`

const shader = `${vertex}\n${fractalSource}`

export function FractalCanvas({ zoom, paused, onZoomChange }: { zoom: number; paused: boolean; onZoomChange: (value: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const zoomRef = useRef(zoom)
  const pausedRef = useRef(paused)
  const orbitRef = useRef({ yaw: .58, pitch: .24 })
  const [error, setError] = useState('')

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    let disposed = false
    let activePointer: number | null = null
    let lastX = 0
    let lastY = 0
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

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
      const compilation = await module.getCompilationInfo()
      const shaderErrors = compilation.messages.filter((message: { type: string }) => message.type === 'error')
      if (shaderErrors.length) throw new Error(shaderErrors.map((message: { lineNum: number; message: string }) => `Shader line ${message.lineNum}: ${message.message}`).join('\n'))
      const pipeline = device.createRenderPipeline({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs_main', targets: [{ format }] } })
      const uniform = device.createBuffer({ size: 32, usage: 0x40 | 0x08 })
      const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] })
      let lastFrame = performance.now()
      let elapsed = 0
      const draw = () => {
        if (disposed) return
        const dpr = Math.min(devicePixelRatio, 1.6)
        const width = Math.max(1, Math.floor(canvas!.clientWidth*dpr))
        const height = Math.max(1, Math.floor(canvas!.clientHeight*dpr))
        if (canvas!.width !== width || canvas!.height !== height) { canvas!.width = width; canvas!.height = height }
        const now = performance.now()
        if (!pausedRef.current && !reduceMotion) elapsed += Math.min(now - lastFrame, 50) / 1000
        lastFrame = now
        const { yaw, pitch } = orbitRef.current
        device.queue.writeBuffer(uniform, 0, new Float32Array([width, height, yaw, pitch, zoomRef.current, elapsed, 0, 0]))
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
