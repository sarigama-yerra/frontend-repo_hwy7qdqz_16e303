import React from 'react'
import Spline from '@splinetool/react-spline'

export default function Hero() {
  return (
    <section className="relative w-full h-[48vh] md:h-[58vh] lg:h-[64vh] overflow-hidden">
      <Spline scene="https://prod.spline.design/g5OaHmrKTDxRI7Ig/scene.splinecode" style={{ width: '100%', height: '100%' }} />
      {/* Dark gradient overlay for readability - pointer events disabled so 3D stays interactive */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-900/20 to-transparent" />
      <div className="pointer-events-none absolute inset-0 flex items-end pb-8 md:pb-10 lg:pb-12">
        <div className="max-w-6xl mx-auto px-4 w-full">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white drop-shadow-sm">SafeRoutes</h1>
          <p className="mt-2 md:mt-3 text-slate-200 max-w-xl">A safety-first navigation prototype that balances speed, visibility, and comfort. Mocked data. Realistic roads. No tracking.</p>
        </div>
      </div>
    </section>
  )
}
