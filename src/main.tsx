import React, { useCallback, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ArrowLeft, ArrowRight, ArrowUpRight, CodeIcon, Maximize2, Pause, Play, RotateCcw } from 'lucide-react'
import { FractalCanvas } from './FractalCanvas'
import { GpuCanvas, type Scene } from './GpuCanvas'
import { TransmissionCanvas } from './transmission/TransmissionCanvas'
import './styles.css'

type DemoScene = Scene | 'fractal'
type Demo = { scene: DemoScene; name: string; description: string; detail: string }

const demos: Demo[] = [
  { scene: 'aurora', name: 'Aurora Field', description: 'Layered sine fields bend two ribbons of light across a dark sky.', detail: 'Fragment shader · Signed distance fields' },
  { scene: 'ink', name: 'Living Ink', description: 'A black fluid seal folds, breathes, and catches a violet edge.', detail: 'Polar coordinates · Procedural grain' },
  { scene: 'orbit', name: 'Orbit Choir', description: 'Five resonant rings phase around a white-hot center of gravity.', detail: 'Additive light · Analytic curves' },
  { scene: 'cells', name: 'Electric Colony', description: 'A field of soft cells pulses between cobalt and hot pink.', detail: 'Tile functions · Color interpolation' },
  { scene: 'gravity', name: 'Gravity Paper', description: 'Move your pointer to pull a precise grid into a luminous well.', detail: 'Pointer uniforms · Spatial distortion' },
  { scene: 'prism', name: 'Glass Monolith', description: 'Paint light and glass across a refractive cube, or switch tools to orbit the scene.', detail: 'Multi-pass transmission · Drawable light · Fresnel · Dispersion' },
  { scene: 'torus', name: 'Signal Torus', description: 'A striped energy ring turns across all three axes. Point to steer its tilt.', detail: '3-axis rotation · Polar shading' },
  { scene: 'city', name: 'Night Blocks', description: 'An endless procedural city rises from hashed blocks and lit windows.', detail: '3D raymarching · Procedural architecture' },
  { scene: 'fractal', name: 'Infinite Fractal', description: 'A raymarched Sierpiński tetrahedron that keeps opening as you zoom.', detail: 'Raymarching · Recursive distance field · Infinite zoom' },
]

function DemoRenderer({ scene, intensity = 1, fullscreen = false }: { scene: DemoScene; intensity?: number; fullscreen?: boolean }) {
  const [zoom, setZoom] = useState(0)
  const changeZoom = useCallback((value: number) => setZoom(value), [])

  useEffect(() => {
    if (scene !== 'fractal') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '+' || event.key === '=' || event.key === 'ArrowUp') setZoom(value => value + .12)
      if (event.key === '-' || event.key === '_' || event.key === 'ArrowDown') setZoom(value => value - .12)
      if (event.key === '0') setZoom(0)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [scene])

  if (scene === 'prism') return <TransmissionCanvas intensity={intensity} />
  if (scene === 'fractal') return <div className={`fractal-shell${fullscreen ? ' fullscreen' : ''}`}>
    <FractalCanvas zoom={zoom} onZoomChange={changeZoom} />
    <div className="fractal-controls">
      <span>Drag to orbit · + / − to zoom · 0 to reset</span>
      <button onClick={() => setZoom(value => value - .12)} aria-label="Zoom out">−</button>
      <button onClick={() => setZoom(0)} aria-label="Reset zoom">0</button>
      <button onClick={() => setZoom(value => value + .12)} aria-label="Zoom in">+</button>
    </div>
  </div>
  return <GpuCanvas scene={scene} intensity={intensity} />
}

function getDemoIndex() {
  const slug = window.location.hash.slice(1)
  const index = demos.findIndex(demo => demo.scene === slug)
  return index >= 0 ? index : 0
}

function Gallery() {
  const [running, setRunning] = useState(true)
  const [key, setKey] = useState(0)
  const [activeDemo, setActiveDemo] = useState(getDemoIndex)

  const selectDemo = (index: number) => {
    const nextIndex = (index + demos.length) % demos.length
    setActiveDemo(nextIndex)
    window.location.hash = demos[nextIndex].scene
    window.requestAnimationFrame(() => document.getElementById('experiments')?.scrollIntoView())
  }

  useEffect(() => {
    const syncHash = () => {
      setActiveDemo(getDemoIndex())
      window.requestAnimationFrame(() => document.getElementById('experiments')?.scrollIntoView())
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || demos[activeDemo].scene === 'fractal') return
      if (event.key === 'ArrowLeft') selectDemo(activeDemo - 1)
      if (event.key === 'ArrowRight') selectDemo(activeDemo + 1)
    }
    window.addEventListener('hashchange', syncHash)
    window.addEventListener('keydown', handleKeyDown)
    return () => { window.removeEventListener('hashchange', syncHash); window.removeEventListener('keydown', handleKeyDown) }
  }, [activeDemo])

  const demo = demos[activeDemo]
  return <>
    <header>
      <a className="brand" href="#top" aria-label="GPU Studio home"><span className="mark" />GPU Studio</a>
      <nav aria-label="Main navigation"><a href="#experiments">Experiments</a><a href="https://vgpu.sh/docs" target="_blank" rel="noreferrer">vgpu docs <ArrowUpRight size={13} /></a></nav>
      <a className="github" href="https://github.com" aria-label="Source code"><CodeIcon size={17} /></a>
    </header>
    <main id="top">
      <section className="hero">
        <h1>Nine small worlds,<br />drawn by your GPU.</h1>
        <p>Original WebGPU experiments running live in the browser. No video, no image swaps. Move your pointer and watch the shader respond.</p>
        <div className="hero-actions">
          <a className="primary" href={`#${demos[0].scene}`} onClick={(event) => { event.preventDefault(); selectDemo(0) }}>Explore the work <span>↓</span></a>
          <button onClick={() => setRunning(!running)}>{running ? <Pause size={14} /> : <Play size={14} />}{running ? 'Pause light' : 'Resume light'}</button>
        </div>
      </section>
      <section className="gallery" id="experiments" aria-label="WebGPU experiments">
        <div className="gallery-bar">
          <p><span>{String(activeDemo + 1).padStart(2, '0')}</span> / {String(demos.length).padStart(2, '0')}</p>
          <div className="gallery-links" aria-label="Choose an experiment">{demos.map((item, index) => <a href={`#${item.scene}`} onClick={(event) => { event.preventDefault(); selectDemo(index) }} className={index === activeDemo ? 'active' : ''} aria-label={`View ${item.name}`} aria-current={index === activeDemo ? 'true' : undefined} key={item.scene}>{String(index + 1).padStart(2, '0')}</a>)}</div>
          <div className="gallery-arrows"><button onClick={() => document.getElementById(demo.scene)?.requestFullscreen()} aria-label={`Open ${demo.name} fullscreen`}><Maximize2 size={16} /></button><button onClick={() => selectDemo(activeDemo - 1)} aria-label="Previous experiment"><ArrowLeft size={17} /></button><button onClick={() => selectDemo(activeDemo + 1)} aria-label="Next experiment"><ArrowRight size={17} /></button></div>
        </div>
        <article className="demo active-demo" id={demo.scene} key={`${demo.scene}-${key}`}>
          <DemoRenderer scene={demo.scene} intensity={running ? 1 : .25} />
          <div className="demo-copy"><div><span className="index">{String(activeDemo + 1).padStart(2, '0')}</span><h2>{demo.name}</h2></div><p>{demo.description}</p><span className="tech">{demo.detail}</span></div>
        </article>
      </section>
      <section className="closer"><div><h2>One triangle.<br />Millions of pixels.</h2><p>Each scene is a single full-screen triangle. The fragment shader decides the color of every pixel on every frame.</p></div><button onClick={() => setKey(k => k + 1)}><RotateCcw size={15} /> Restart all shaders</button></section>
    </main>
    <footer><a className="brand" href="#top"><span className="mark" />GPU Studio</a><p>Nine GPU studies for the modern browser.</p><a href="https://vgpu.sh/docs" target="_blank" rel="noreferrer">Read the vgpu docs <ArrowUpRight size={13} /></a></footer>
  </>
}

function DevDemoPage() {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('scene')
  const initial = demos.some(demo => demo.scene === requested) ? requested as DemoScene : demos[0].scene
  const [scene, setScene] = useState<DemoScene>(initial)
  const choose = (next: DemoScene) => {
    setScene(next)
    window.history.replaceState(null, '', `/__demo?scene=${next}`)
  }
  return <main className="dev-demo-page">
    <DemoRenderer key={scene} scene={scene} fullscreen />
    <label className="dev-demo-picker">Demo<select value={scene} onChange={event => choose(event.target.value as DemoScene)}>{demos.map(demo => <option value={demo.scene} key={demo.scene}>{demo.name}</option>)}</select></label>
  </main>
}

const isDevDemo = import.meta.env.DEV && window.location.pathname === '/__demo'
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{isDevDemo ? <DevDemoPage /> : <Gallery />}</React.StrictMode>)
