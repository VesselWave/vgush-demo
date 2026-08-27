import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ArrowUpRight, CodeIcon, Pause, Play, RotateCcw } from 'lucide-react'
import { GpuCanvas, type Scene } from './GpuCanvas'
import { TransmissionCanvas } from './transmission/TransmissionCanvas'
import './styles.css'

const demos: { scene: Scene; name: string; description: string; detail: string }[] = [
  { scene: 'aurora', name: 'Aurora Field', description: 'Layered sine fields bend two ribbons of light across a dark sky.', detail: 'Fragment shader · Signed distance fields' },
  { scene: 'ink', name: 'Living Ink', description: 'A black fluid seal folds, breathes, and catches a violet edge.', detail: 'Polar coordinates · Procedural grain' },
  { scene: 'orbit', name: 'Orbit Choir', description: 'Five resonant rings phase around a white-hot center of gravity.', detail: 'Additive light · Analytic curves' },
  { scene: 'cells', name: 'Electric Colony', description: 'A field of soft cells pulses between cobalt and hot pink.', detail: 'Tile functions · Color interpolation' },
  { scene: 'gravity', name: 'Gravity Paper', description: 'Move your pointer to pull a precise grid into a luminous well.', detail: 'Pointer uniforms · Spatial distortion' },
  { scene: 'prism', name: 'Glass Monolith', description: 'Drag to orbit a glass cube that refracts a separately rendered scene through a blurred texture pyramid.', detail: 'Multi-pass transmission · Fresnel · Dispersion' },
  { scene: 'torus', name: 'Signal Torus', description: 'A striped energy ring turns across all three axes. Point to steer its tilt.', detail: '3-axis rotation · Polar shading' },
  { scene: 'city', name: 'Night Blocks', description: 'An endless procedural city rises from hashed blocks and lit windows.', detail: '3D raymarching · Procedural architecture' },
]

function App() {
  const [running, setRunning] = useState(true)
  const [key, setKey] = useState(0)

  return <>
    <header>
      <a className="brand" href="#top" aria-label="GPU Studio home"><span className="mark" />GPU Studio</a>
      <nav aria-label="Main navigation">
        <a href="#experiments">Experiments</a>
        <a href="https://vgpu.sh/docs" target="_blank" rel="noreferrer">vgpu docs <ArrowUpRight size={13} /></a>
      </nav>
      <a className="github" href="https://github.com" aria-label="Source code"><CodeIcon size={17} /></a>
    </header>

    <main id="top">
      <section className="hero">
        <h1>Eight small worlds,<br />drawn by your GPU.</h1>
        <p>Original WebGPU experiments running live in the browser. No video, no image swaps. Move your pointer and watch the shader respond.</p>
        <div className="hero-actions">
          <a className="primary" href="#experiments">Explore the work <span>↓</span></a>
          <button onClick={() => setRunning(!running)}>{running ? <Pause size={14} /> : <Play size={14} />}{running ? 'Pause light' : 'Resume light'}</button>
        </div>
      </section>

      <section className="gallery" id="experiments" aria-label="WebGPU experiments">
        {demos.map((demo, index) => <article className={`demo demo-${index + 1}`} key={`${demo.scene}-${key}`}>
          {demo.scene === 'prism'
            ? <TransmissionCanvas intensity={running ? 1 : .25} />
            : <GpuCanvas scene={demo.scene} intensity={running ? 1 : .25} />}
          <div className="demo-copy">
            <div><span className="index">{String(index + 1).padStart(2, '0')}</span><h2>{demo.name}</h2></div>
            <p>{demo.description}</p>
            <span className="tech">{demo.detail}</span>
          </div>
        </article>)}
      </section>

      <section className="closer">
        <div><h2>One triangle.<br />Millions of pixels.</h2><p>Each scene is a single full-screen triangle. The fragment shader decides the color of every pixel on every frame.</p></div>
        <button onClick={() => setKey(k => k + 1)}><RotateCcw size={15} /> Restart all shaders</button>
      </section>
    </main>

    <footer><a className="brand" href="#top"><span className="mark" />GPU Studio</a><p>Eight original studies for the modern browser.</p><a href="https://vgpu.sh/docs" target="_blank" rel="noreferrer">Read the vgpu docs <ArrowUpRight size={13} /></a></footer>
  </>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
