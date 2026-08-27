import { useEffect, useRef, useState } from 'react'
import { createRenderer } from './renderer'

export function TransmissionCanvas({ intensity }: { intensity: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createRenderer({ canvas })
    renderer.ready?.catch?.((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message || 'The transmission renderer could not start.')
    })
    return () => renderer.dispose()
  }, [])

  return <div className="canvas-shell transmission-shell">
    {error ? <div className="gpu-error"><span>GPU offline</span><p>{error}</p></div> : <canvas ref={canvasRef} style={{ opacity: intensity }} aria-label="Interactive glass transmission demo. Drag to orbit and scroll to zoom." />}
  </div>
}
