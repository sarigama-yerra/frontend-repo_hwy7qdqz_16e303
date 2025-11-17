import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  CircleMarker,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icons for Leaflet in Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import icon2xUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl: icon2xUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

// Mocked road network with realistic curved segments (polyline chunks per street)
// Each segment contains: coordinates, street name, speed (km/h), safety score 0-100
const roadNetwork = {
  // Simple grid-like but with curves
  streets: [
    {
      id: 'A',
      name: 'Aurora Ave',
      segments: [
        {
          coords: [
            [37.776, -122.424],
            [37.7765, -122.421],
            [37.7768, -122.4185],
            [37.7772, -122.416],
          ],
          speed: 40,
          safety: 62,
          signals: [[37.7765, -122.421], [37.7772, -122.416]],
          lanes: 2,
        },
        {
          coords: [
            [37.7772, -122.416],
            [37.7783, -122.4135],
            [37.779, -122.4115],
          ],
          speed: 40,
          safety: 55,
          signals: [[37.7783, -122.4135]],
          lanes: 2,
        },
      ],
    },
    {
      id: 'B',
      name: 'Beacon St',
      segments: [
        {
          coords: [
            [37.7745, -122.419],
            [37.7752, -122.417],
            [37.776, -122.4145],
          ],
          speed: 30,
          safety: 80,
          signals: [[37.7752, -122.417]],
          lanes: 1,
        },
        {
          coords: [
            [37.776, -122.4145],
            [37.777, -122.412],
            [37.7778, -122.41],
          ],
          speed: 30,
          safety: 78,
          signals: [[37.777, -122.412]],
          lanes: 1,
        },
      ],
    },
    {
      id: 'C',
      name: 'Cobalt Blvd',
      segments: [
        {
          coords: [
            [37.7735, -122.4235],
            [37.773, -122.421],
            [37.7725, -122.418],
          ],
          speed: 50,
          safety: 45,
          signals: [[37.773, -122.421]],
          lanes: 3,
        },
        {
          coords: [
            [37.7725, -122.418],
            [37.772, -122.4155],
            [37.7715, -122.413],
          ],
          speed: 50,
          safety: 42,
          signals: [[37.772, -122.4155]],
          lanes: 3,
        },
      ],
    },
  ],
  intersections: [
    { id: 'I1', coord: [37.7765, -122.421] },
    { id: 'I2', coord: [37.7772, -122.416] },
    { id: 'I3', coord: [37.7752, -122.417] },
    { id: 'I4', coord: [37.776, -122.4145] },
    { id: 'I5', coord: [37.773, -122.421] },
    { id: 'I6', coord: [37.772, -122.4155] },
  ],
}

// Mock route definitions that snap to the road network by referencing segments.
// Each route uses ordered segments to ensure realistic curvy polylines following roads.
const routeOptions = [
  { key: 'fastest', label: 'Fastest', color: '#0ea5e9' },
  { key: 'safest', label: 'Safest', color: '#10b981' },
  { key: 'balanced', label: 'Balanced', color: '#f59e0b' },
  { key: 'night', label: 'Night-Safe', color: '#6366f1' },
  { key: 'female', label: 'Female-Friendly', color: '#ec4899' },
]

// Helper: compute haversine distance in meters
function haversineDistance(a, b) {
  const R = 6371e3
  const [lat1, lon1] = a
  const [lat2, lon2] = b
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const la1 = toRad(lat1)
  const la2 = toRad(lat2)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h =
    sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLon * sinDLon
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return R * c
}

// Build a route path by concatenating segment coords
function buildPath(segments) {
  const path = []
  segments.forEach((seg, idx) => {
    seg.coords.forEach((pt, i) => {
      // Avoid duplicate point when joining
      if (idx > 0 && i === 0) return
      path.push(pt)
    })
  })
  return path
}

function estimateDistanceMeters(path) {
  let total = 0
  for (let i = 0; i < path.length - 1; i++) {
    total += haversineDistance(path[i], path[i + 1])
  }
  return total
}

function routeSafetyColor(score) {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#84cc16'
  if (score >= 40) return '#f59e0b'
  if (score >= 20) return '#f97316'
  return '#ef4444'
}

function TrafficSignalsLayer({ intersections }) {
  return intersections.map((ix) => (
    <CircleMarker
      key={ix.id}
      center={ix.coord}
      radius={5}
      pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.9 }}
    >
      <Popup>
        <div className="text-sm">
          <div className="font-semibold">Traffic Signal</div>
          <div>ID: {ix.id}</div>
        </div>
      </Popup>
    </CircleMarker>
  ))
}

function FitBounds({ path }) {
  const map = useMap()
  useEffect(() => {
    if (path && path.length > 0) {
      const bounds = L.latLngBounds(path)
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [path, map])
  return null
}

function LaneGuidance({ path }) {
  // Render subtle arrows along the path to simulate lane guidance
  const map = useMap()
  useEffect(() => {
    if (!path || path.length < 2) return
    const decorators = []
    const icon = L.divIcon({
      html: '<div style="transform: translate(-50%, -50%) rotate(0deg); color:#111;">➤</div>',
      className: 'lane-arrow',
    })

    for (let i = 0; i < path.length - 1; i += 3) {
      const mid = path[i]
      const marker = L.marker(mid, { icon, interactive: false, opacity: 0.6 })
      marker.addTo(map)
      decorators.push(marker)
    }

    return () => decorators.forEach((m) => m.remove())
  }, [path, map])
  return null
}

function RouteJournal({ steps, total, etaMin, profile }) {
  return (
    <div className="h-full overflow-y-auto space-y-3">
      <div className="p-3 rounded-md bg-slate-900/60 text-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm uppercase tracking-wider text-slate-400">{profile.label} Route</div>
            <div className="text-xl font-semibold">{(total / 1000).toFixed(2)} km • {Math.round(etaMin)} min</div>
          </div>
          <div className="text-xs text-slate-400">Mocked</div>
        </div>
      </div>
      {steps.map((s, idx) => (
        <div key={idx} className="p-3 rounded-md bg-white/80 backdrop-blur shadow border border-slate-200">
          <div className="flex items-center justify-between">
            <div className="font-medium">{s.instruction}</div>
            <div className="text-sm text-slate-500">{(s.distance/1000).toFixed(2)} km</div>
          </div>
          <div className="text-sm text-slate-600">{s.street}</div>
          {s.note && <div className="text-xs mt-1 text-amber-600">{s.note}</div>}
        </div>
      ))}
    </div>
  )
}

export default function MapView() {
  const [start] = useState([37.7745, -122.423])
  const [end] = useState([37.7782, -122.4095])
  const [profileKey, setProfileKey] = useState('balanced')

  // Build route candidates by selecting different segment sets
  const routes = useMemo(() => {
    const A = roadNetwork.streets.find((s) => s.id === 'A')
    const B = roadNetwork.streets.find((s) => s.id === 'B')
    const C = roadNetwork.streets.find((s) => s.id === 'C')

    const fastestSegs = [C.segments[0], C.segments[1], A.segments[1]]
    const safestSegs = [B.segments[0], B.segments[1]]
    const balancedSegs = [A.segments[0], B.segments[0], B.segments[1]]
    const nightSegs = [A.segments[0], A.segments[1]]
    const femaleSegs = [B.segments[0], A.segments[1]]

    const catalog = {
      fastest: fastestSegs,
      safest: safestSegs,
      balanced: balancedSegs,
      night: nightSegs,
      female: femaleSegs,
    }

    const make = (key) => {
      const segs = catalog[key]
      const path = buildPath(segs)
      const total = estimateDistanceMeters(path)
      // Mock ETA using average of segment speeds and penalties
      const avgSpeedKmh =
        segs.reduce((acc, s) => acc + s.speed, 0) / Math.max(segs.length, 1)
      const etaHours = total / 1000 / Math.max(avgSpeedKmh, 1)
      const penalty = key === 'safest' ? 1.15 : key === 'night' ? 1.1 : key === 'female' ? 1.12 : 1
      const etaMin = (etaHours * 60) * penalty

      // Steps based on segment changes
      const steps = segs.map((s, i) => ({
        instruction:
          i === 0
            ? 'Head onto ' + (s.name || 'current road')
            : 'Continue along ' + (s.name || 'the road'),
        street: s.name || 'Unnamed',
        distance: estimateDistanceMeters(s.coords),
        note:
          s.safety >= 75
            ? 'Well-lit area with cameras'
            : s.safety <= 45
            ? 'Low visibility, avoid late hours'
            : undefined,
      }))

      // Safety segments for per-segment color
      const colored = segs.map((s) => ({ coords: s.coords, color: routeSafetyColor(s.safety) }))

      return { key, segs, path, total, etaMin, steps, colored }
    }

    const routesObj = {
      fastest: make('fastest'),
      safest: make('safest'),
      balanced: make('balanced'),
      night: make('night'),
      female: make('female'),
    }

    return routesObj
  }, [])

  const profile = routeOptions.find((r) => r.key === profileKey)
  const active = routes[profileKey]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
      <div className="relative h-[520px] lg:h-[640px] rounded-xl overflow-hidden shadow ring-1 ring-slate-200">
        <MapContainer center={[37.7755, -122.418]} zoom={14} scrollWheelZoom className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />

          <Marker position={start}>
            <Popup>Start</Popup>
          </Marker>
          <Marker position={end}>
            <Popup>Destination</Popup>
          </Marker>

          {/* Draw per-segment safety colored polylines for active route */}
          {active.colored.map((c, idx) => (
            <Polyline key={idx} positions={c.coords} pathOptions={{ color: c.color, weight: 6, opacity: 0.9 }} />
          ))}

          {/* Render all intersections with traffic signals */}
          <TrafficSignalsLayer intersections={roadNetwork.intersections} />

          {/* Lane guidance hints */}
          <LaneGuidance path={active.path} />

          {/* Fit bounds to active route */}
          <FitBounds path={active.path} />
        </MapContainer>

        {/* Route selector overlay */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-[500]">
          {routeOptions.map((r) => (
            <button
              key={r.key}
              onClick={() => setProfileKey(r.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium shadow backdrop-blur border ${
                profileKey === r.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white/90 text-slate-700 border-slate-200 hover:bg-white'
              }`}
              style={{ outlineColor: r.color }}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: r.color }} />
              {r.label}
            </button>
          ))}
        </div>

        {/* Warnings/legend overlay */}
        <div className="absolute bottom-3 left-3 z-[500] bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-3 text-sm text-slate-700 shadow">
          <div className="font-semibold mb-1">Legend</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-emerald-500 inline-block" /> High safety</div>
            <div className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-amber-500 inline-block" /> Medium</div>
            <div className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-red-500 inline-block" /> Low</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Signal</div>
          </div>
        </div>
      </div>

      {/* Route journal side panel */}
      <div className="h-[520px] lg:h-[640px] rounded-xl overflow-hidden bg-gradient-to-b from-slate-50 to-white border border-slate-200 shadow p-4">
        <RouteJournal steps={active.steps} total={active.total} etaMin={active.etaMin} profile={profile} />
      </div>
    </div>
  )
}
