import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Eraser, Gem, MousePointer2, Sparkles } from 'lucide-react'
import { createRenderer } from './renderer'
import { createPaintStore, hexToLinear } from './paint-store'

type Tool = 'move' | 'light' | 'glass'
const MAX_PAINT_SEGMENTS = 128
const colors = ['#ff4fc3', '#69ddff', '#ffd66b', '#b8ff8a']

export function TransmissionCanvas({ intensity }: { intensity: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)
  const paintStoreRef = useRef(createPaintStore())
  const [error, setError] = useState('')
  const [tool, setTool] = useState<Tool>('move')
  const [color, setColor] = useState(colors[0])
  const [size, setSize] = useState(18)
  const [clearVersion, setClearVersion] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const paintCanvas = paintRef.current
    if (!canvas || !paintCanvas) return
    const renderer = createRenderer({ canvas, paintStore: paintStoreRef.current })
    renderer.ready?.catch?.((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message || 'The transmission renderer could not start.')
    })
    return () => renderer.dispose()
  }, [])

  useEffect(() => {
    const canvas = paintRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    let drawing = false
    let pointerId = -1
    let last = { x: 0, y: 0 }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio, 2)
      const width = Math.max(1, Math.floor(rect.width * dpr))
      const height = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width === width && canvas.height === height) return
      const snapshot = document.createElement('canvas')
      snapshot.width = canvas.width
      snapshot.height = canvas.height
      snapshot.getContext('2d')?.drawImage(canvas, 0, 0)
      canvas.width = width
      canvas.height = height
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, rect.width, rect.height)
    }
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const placeCursor = (event: PointerEvent) => {
      const next = point(event)
      const store = paintStoreRef.current
      store.cursor = [next.x / Math.max(1, canvas.clientWidth), next.y / Math.max(1, canvas.clientHeight)]
      store.cursorColor = hexToLinear(color)
      store.cursorRadius = size / Math.max(1, canvas.clientHeight) * .52
      store.cursorMaterial = tool === 'glass' ? 1 : 0
      store.cursorVisible = tool !== 'move'
      store.version++
      return next
    }
    const stroke = (from: typeof last, to: typeof last) => {
      const store = paintStoreRef.current
      store.segments.push({
        from: [from.x / Math.max(1, canvas.clientWidth), from.y / Math.max(1, canvas.clientHeight)],
        to: [to.x / Math.max(1, canvas.clientWidth), to.y / Math.max(1, canvas.clientHeight)],
        color: hexToLinear(color),
        radius: size / Math.max(1, canvas.clientHeight) * .52,
        material: tool === 'glass' ? 1 : 0,
      })
      const material = tool === 'glass' ? 1 : 0
      let materialCount = store.segments.filter(segment => segment.material === material).length
      while (materialCount > MAX_PAINT_SEGMENTS) {
        const oldest = store.segments.findIndex(segment => segment.material === material)
        if (oldest < 0) break
        store.segments.splice(oldest, 1)
        materialCount--
      }
      store.version++
      context.save()
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.lineWidth = size
      context.strokeStyle = color
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      if (tool === 'light') {
        context.globalCompositeOperation = 'screen'
        context.shadowColor = color
        context.shadowBlur = size * 1.8
        context.globalAlpha = .82
        context.stroke()
        context.shadowBlur = size * .45
        context.lineWidth = Math.max(2, size * .28)
        context.globalAlpha = .95
        context.stroke()
      } else {
        context.globalCompositeOperation = 'screen'
        context.globalAlpha = .2
        context.shadowColor = '#d9f7ff'
        context.shadowBlur = size
        context.lineWidth = size * 1.5
        context.stroke()
        context.globalAlpha = .68
        context.shadowBlur = 2
        context.strokeStyle = color
        context.lineWidth = Math.max(3, size * .42)
        context.stroke()
        context.globalAlpha = .9
        context.strokeStyle = '#ffffff'
        context.lineWidth = 1
        context.translate(0, -size * .16)
        context.stroke()
      }
      context.restore()
    }
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || tool === 'move') return
      drawing = true
      pointerId = event.pointerId
      last = placeCursor(event)
      canvas.setPointerCapture(pointerId)
      stroke(last, last)
    }
    const move = (event: PointerEvent) => {
      const next = placeCursor(event)
      if (!drawing || event.pointerId !== pointerId) return
      // Pointer events can be far apart during a fast drag. Split long moves so
      // each GPU capsule covers a bounded distance and the segment budget remains
      // tied to rendered geometry rather than the browser's event frequency.
      const distance = Math.hypot(next.x - last.x, next.y - last.y)
      if (distance < Math.max(2, size * .22)) return
      const from = last
      const steps = Math.ceil(distance / Math.max(4, size * .5))
      for (let step = 1; step <= steps; step++) {
        const to = {
          x: from.x + (next.x - from.x) * step / steps,
          y: from.y + (next.y - from.y) * step / steps,
        }
        stroke(last, to)
        last = to
      }
    }
    const end = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return
      drawing = false
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
      pointerId = -1
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', end)
    const leave = () => {
      paintStoreRef.current.cursorVisible = false
      paintStoreRef.current.version++
    }
    canvas.addEventListener('pointercancel', end)
    canvas.addEventListener('pointerleave', leave)
    return () => {
      observer.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', end)
      canvas.removeEventListener('pointercancel', end)
      canvas.removeEventListener('pointerleave', leave)
    }
  }, [tool, color, size])

  useEffect(() => {
    const canvas = paintRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    paintStoreRef.current.segments.length = 0
    paintStoreRef.current.version++
  }, [clearVersion])

  return <div className="canvas-shell transmission-shell">
    {error ? <div className="gpu-error"><span>GPU offline</span><p>{error}</p></div> : <>
      <canvas ref={canvasRef} style={{ opacity: intensity }} aria-label="Interactive glass transmission demo. Move the camera or choose a paint tool." />
      <canvas ref={paintRef} className={`monolith-paint monolith-paint-${tool}`} aria-label={`${tool} tool layer`} />
      <div className="monolith-tools" role="toolbar" aria-label="Glass Monolith tools">
        <div className="tool-group" aria-label="Choose a tool">
          <button className={`tool-button ${tool === 'move' ? 'active' : ''}`} onClick={() => setTool('move')} aria-pressed={tool === 'move'} title="Move camera"><MousePointer2 size={15} /> Move</button>
          <button className={`tool-button ${tool === 'light' ? 'active' : ''}`} onClick={() => setTool('light')} aria-pressed={tool === 'light'} title="Paint light"><Sparkles size={15} /> Light</button>
          <button className={`tool-button ${tool === 'glass' ? 'active' : ''}`} onClick={() => setTool('glass')} aria-pressed={tool === 'glass'} title="Paint glass"><Gem size={15} /> Glass</button>
        </div>
        <span className="tool-divider" />
        <div className="paint-colors" aria-label="Paint color">{colors.map(value => <button key={value} className={color === value ? 'active' : ''} style={{ '--swatch': value } as CSSProperties} onClick={() => setColor(value)} aria-label={`Use ${value}`} aria-pressed={color === value} />)}</div>
        <input aria-label="Brush size" type="range" min="6" max="42" value={size} onChange={event => setSize(Number(event.target.value))} />
        <button className="clear-tool" onClick={() => setClearVersion(value => value + 1)} title="Clear drawing"><Eraser size={15} /><span className="tool-label">Clear</span></button>
      </div>
      <span className="monolith-hint">{tool === 'move' ? 'drag to rotate · scroll to zoom' : `drag to paint ${tool}`}</span>
    </>}
  </div>
}
