import React from 'react'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-bold tracking-tight">SafeRoutes</div>
          <nav className="text-sm text-slate-300 flex items-center gap-4">
            <a href="#map" className="hover:text-white">Map</a>
            <a href="#journal" className="hover:text-white">Journal</a>
            <a href="#about" className="hover:text-white">About</a>
          </nav>
        </div>
      </header>
      {children}
      <footer id="about" className="border-t border-white/10 py-10 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-slate-400 text-sm">
          Mocked data. For demo purposes only.
        </div>
      </footer>
    </div>
  )
}
