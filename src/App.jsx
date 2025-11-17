import React from 'react'
import Layout from './components/Layout'
import Hero from './components/Hero'
import MapView from './components/MapView'

function App() {
  return (
    <Layout>
      <Hero />
      <main className="max-w-6xl mx-auto px-4 -mt-10 relative z-10">
        <section id="map" className="bg-white rounded-2xl shadow-xl ring-1 ring-black/5 p-4 md:p-6">
          <div className="flex flex-col lg:flex-row items-start gap-6">
            <div className="w-full">
              <MapView />
            </div>
          </div>
        </section>
      </main>
    </Layout>
  )
}

export default App
