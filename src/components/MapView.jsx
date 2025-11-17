import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  CircleMarker,
  useMap,
  useMapEvents,
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
  streets: [
    {
      id: 'A',
      name: 'Aurora Ave',
      segments: [
        {
          id: 'A1',
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
          id: 'A2',
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
          id: 'B1',
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
          id: 'B2',
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
          id: 'C1',
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
          id: 'C2',
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

function buildPath(segments) {
  const path = []
  segments.forEach((seg, idx) => {
    seg.coords.forEach((pt, i) => {
      if (idx > 0 && i === 0) return
      path.push(pt)
    })
  })
  return path
}

function pathDistance(path) {
  let total = 0
  for (let i = 0; i < path.length - 1; i++) total += haversineDistance(path[i], path[i + 1])
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
  const map = useMap()
  useEffect(() => {
    if (!path || path.length < 2) return
    const decorators = []
    const icon = L.divIcon({
      html: '<div style="transform: translate(-50%, -50%); color:#111; font-size:16px">➤</div>',
      className: 'lane-arrow',
    })

    for (let i = 0; i < path.length - 1; i += 3) {
      const mid = path[i]
      const marker = L.marker(mid, { icon, interactive: false, opacity: 0.7 })
      marker.addTo(map)
      decorators.push(marker)
    }

    return () => decorators.forEach((m) => m.remove())
  }, [path, map])
  return null
}

function RouteJournal({ steps, total, etaMin, profile, safetyAvg }) {
  return (
    <div className="h-full overflow-y-auto space-y-3" id="journal">
      <div className="p-3 rounded-md bg-slate-900/60 text-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm uppercase tracking-wider text-slate-400">{profile.label} Route</div>
            <div className="text-xl font-semibold">{(total / 1000).toFixed(2)} km • {Math.round(etaMin)} min</div>
            <div className="text-xs text-emerald-300">Avg safety {Math.round(safetyAvg)} / 100</div>
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

function FloatingManeuver({ nextPoint, label }) {
  const map = useMap()
  const [pos, setPos] = useState(null)
  useEffect(() => {
    if (!nextPoint) return
    const update = () => {
      const p = map.latLngToContainerPoint(L.latLng(nextPoint))
      setPos({ left: p.x, top: p.y })
    }
    update()
    const onMove = () => update()
    map.on('move zoom', onMove)
    return () => {
      map.off('move', onMove)
      map.off('zoom', onMove)
    }
  }, [map, nextPoint])
  if (!nextPoint || !pos) return null
  return (
    <div className="absolute z-[600]" style={{ left: pos.left, top: pos.top }}>
      <div className="-translate-x-1/2 -translate-y-full bg-slate-900 text-white text-xs px-2 py-1 rounded shadow">
        {label}
      </div>
    </div>
  )
}

function useSpeech() {
  const speak = useCallback((text) => {
    try {
      const synth = window.speechSynthesis
      if (!synth) return
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 1
      synth.cancel()
      synth.speak(utter)
    } catch (e) {
      // noop for environments without speech
    }
  }, [])
  return { speak }
}

export default function MapView() {
  const [start] = useState([37.7745, -122.423])
  const [end] = useState([37.7782, -122.4095])
  const [profileKey, setProfileKey] = useState('balanced')

  // Live conditions: per-segment dynamic modifiers (speed, safety, crowd)
  const [conditions, setConditions] = useState(() => {
    const obj = {}
    roadNetwork.streets.forEach((st) =>
      st.segments.forEach((seg) => {
        obj[seg.id] = { speedFactor: 1, safetyAdj: 0, crowd: 0.3 }
      })
    )
    return obj
  })

  // User preferences
  const [prefs, setPrefs] = useState({ avoidBusy: 0.4, preferLit: 0.6, comfort: 0.6 })
  const [horizon, setHorizon] = useState(15) // minutes

  // "GPS" simulated progress along active route
  const [progress, setProgress] = useState({ idx: 0, t: 0 }) // path index
  const [simOn, setSimOn] = useState(true)

  // Previous route for comparisons
  const [prevRoute, setPrevRoute] = useState(null)
  const [suggestion, setSuggestion] = useState(null)
  const [showCompare, setShowCompare] = useState(false)

  const { speak } = useSpeech()

  // Prepare route candidates (fixed segment sequences that follow roads exactly)
  const baseCandidates = useMemo(() => {
    const A = roadNetwork.streets.find((s) => s.id === 'A')
    const B = roadNetwork.streets.find((s) => s.id === 'B')
    const C = roadNetwork.streets.find((s) => s.id === 'C')

    // Attach parent street name for convenience
    const withName = (seg, name) => ({ ...seg, name })

    const fastestSegs = [withName(C.segments[0], 'Cobalt Blvd'), withName(C.segments[1], 'Cobalt Blvd'), withName(A.segments[1], 'Aurora Ave')]
    const safestSegs = [withName(B.segments[0], 'Beacon St'), withName(B.segments[1], 'Beacon St')]
    const balancedSegs = [withName(A.segments[0], 'Aurora Ave'), withName(B.segments[0], 'Beacon St'), withName(B.segments[1], 'Beacon St')]
    const nightSegs = [withName(A.segments[0], 'Aurora Ave'), withName(A.segments[1], 'Aurora Ave')]
    const femaleSegs = [withName(B.segments[0], 'Beacon St'), withName(A.segments[1], 'Aurora Ave')]

    return [
      { key: 'fastest', segs: fastestSegs },
      { key: 'safest', segs: safestSegs },
      { key: 'balanced', segs: balancedSegs },
      { key: 'night', segs: nightSegs },
      { key: 'female', segs: femaleSegs },
    ]
  }, [])

  // Mock AI predictor: returns predicted multipliers for each segment in next horizon mins
  const predict = useCallback((segId, horizonMin) => {
    // Deterministic-ish pseudo prediction using segId hash
    const seed = segId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const phase = (Math.sin((Date.now() / 100000 + seed) % Math.PI) + 1) / 2
    const congestion = 0.9 + 0.3 * phase * (horizonMin / 30) // 0.9..1.2
    const risk = -5 + 15 * phase * (horizonMin / 30) // -5..+10
    const lightingPenalty = segId.startsWith('C') ? 8 : segId.startsWith('A') ? 2 : 0
    return { speedFactor: 1 / congestion, safetyAdj: risk - lightingPenalty }
  }, [])

  // Score and compute metrics for a candidate considering current conditions, AI prediction, and prefs
  const evaluate = useCallback((candidate) => {
    const segs = candidate.segs
    // Build path
    const path = buildPath(segs)

    // Aggregate metrics
    let totalMeters = 0
    let totalTimeH = 0
    let safetySum = 0
    let crowdSum = 0

    const steps = segs.map((s, i) => {
      const dist = pathDistance(s.coords)
      totalMeters += dist

      const cond = conditions[s.id] || { speedFactor: 1, safetyAdj: 0, crowd: 0.3 }
      const pred = predict(s.id, horizon)

      const effSpeed = Math.max(5, s.speed * cond.speedFactor * pred.speedFactor) // km/h
      const timeH = (dist / 1000) / effSpeed
      totalTimeH += timeH

      const effSafety = Math.max(0, Math.min(100, s.safety + cond.safetyAdj + pred.safetyAdj))
      safetySum += effSafety * dist

      const crowd = cond.crowd
      crowdSum += crowd * dist

      return {
        instruction: i === 0 ? `Head onto ${s.name}` : `Continue along ${s.name}`,
        street: s.name,
        distance: dist,
        safety: effSafety,
        note: effSafety >= 75 ? 'Well-lit area with cameras' : effSafety <= 45 ? 'Low visibility, avoid late hours' : undefined,
      }
    })

    const avgSafety = safetySum / Math.max(totalMeters, 1)
    const avgCrowd = crowdSum / Math.max(totalMeters, 1)

    // Preference weighting
    // Higher score is better: penalize time and crowd, reward safety
    const timeMin = totalTimeH * 60
    const score = (avgSafety / 100) * (0.5 + prefs.preferLit * 0.5) -
                  (timeMin / 30) * (0.5 + (1 - prefs.comfort) * 0.5) -
                  avgCrowd * prefs.avoidBusy * 0.8

    const colored = segs.map((s) => {
      const cond = conditions[s.id] || { safetyAdj: 0 }
      const pred = predict(s.id, horizon)
      const eff = Math.max(0, Math.min(100, s.safety + cond.safetyAdj + pred.safetyAdj))
      return { coords: s.coords, color: routeSafetyColor(eff) }
    })

    return {
      key: candidate.key,
      segs,
      path,
      total: totalMeters,
      etaMin: timeMin,
      steps,
      colored,
      avgSafety,
      avgCrowd,
      score,
    }
  }, [conditions, horizon, prefs, predict])

  // Compute all candidates
  const routes = useMemo(() => {
    const r = {}
    baseCandidates.forEach((c) => {
      r[c.key] = evaluate(c)
    })
    return r
  }, [baseCandidates, evaluate])

  const active = routes[profileKey]
  const profile = routeOptions.find((r) => r.key === profileKey) || { label: 'Route' }

  // Simulate live conditions update every 6 seconds
  useEffect(() => {
    const iv = setInterval(() => {
      setConditions((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((id) => {
          const jitter = (n) => Math.max(0.7, Math.min(1.3, (next[id].speedFactor + (Math.random() - 0.5) * 0.1)))
          const crowd = Math.max(0, Math.min(1, next[id].crowd + (Math.random() - 0.5) * 0.1))
          const safetyAdj = Math.max(-20, Math.min(20, next[id].safetyAdj + (Math.random() - 0.5) * 2))
          next[id] = { speedFactor: jitter(), crowd, safetyAdj }
        })
        return next
      })
    }, 6000)
    return () => clearInterval(iv)
  }, [])

  // Detect if a better route exists -> suggest change
  useEffect(() => {
    const best = Object.values(routes).reduce((a, b) => (a.score > b.score ? a : b))
    if (!active || !best) return
    if (best.key !== active.key) {
      // compute deltas
      const timeSaved = Math.max(0, active.etaMin - best.etaMin)
      const safetyGain = Math.max(0, best.avgSafety - active.avgSafety)
      setSuggestion({ best, timeSaved, safetyGain })
    } else {
      setSuggestion(null)
    }
  }, [routes, active])

  // Simulate movement along active route
  const progressRef = useRef(progress)
  useEffect(() => { progressRef.current = progress }, [progress])
  useEffect(() => {
    if (!simOn || !active || active.path.length < 2) return
    let raf
    const step = () => {
      const cur = progressRef.current
      // advance based on an approximate speed derived from ETA
      const points = active.path
      const totalTimeMs = active.etaMin * 60 * 1000
      const dt = 250 // ms per frame
      const idxInc = Math.max(1, Math.round((points.length / (totalTimeMs / dt))))
      const nextIdx = Math.min(points.length - 1, cur.idx + idxInc)
      setProgress({ idx: nextIdx, t: Date.now() })
      raf = setTimeout(step, dt)
    }
    raf = setTimeout(step, 300)
    return () => clearTimeout(raf)
  }, [active, simOn])

  // Determine upcoming maneuver at segment boundary
  const maneuvers = useMemo(() => {
    const arr = []
    baseCandidates.find((c) => c.key === active.key)?.segs.forEach((s, i, list) => {
      if (i < list.length - 1) {
        const nextStart = list[i + 1].coords[0]
        arr.push({ point: nextStart, label: `Then continue to ${list[i + 1].name}` })
      }
    })
    return arr
  }, [active, baseCandidates])

  const currentManeuver = useMemo(() => {
    if (!active) return null
    const idx = progress.idx
    // find closest maneuver point ahead
    let best = null
    maneuvers.forEach((m) => {
      // approximate by index distance on path
      const nearestIndex = active.path.findIndex((p) => p[0] === m.point[0] && p[1] === m.point[1])
      if (nearestIndex > idx && (best === null || nearestIndex < best.nearestIndex)) best = { ...m, nearestIndex }
    })
    return best
  }, [maneuvers, progress.idx, active])

  // Voice when approaching maneuver
  const voicedRef = useRef({})
  useEffect(() => {
    if (!currentManeuver || !active) return
    const distanceAhead = (function () {
      let d = 0
      for (let i = progress.idx; i < Math.min(currentManeuver.nearestIndex, active.path.length - 1); i++) {
        d += haversineDistance(active.path[i], active.path[i + 1])
      }
      return d
    })()
    if (distanceAhead < 80 && !voicedRef.current[currentManeuver.nearestIndex]) {
      speak(currentManeuver.label)
      voicedRef.current[currentManeuver.nearestIndex] = true
    }
  }, [currentManeuver, progress.idx, active, speak])

  const acceptSuggestion = () => {
    if (!suggestion) return
    setPrevRoute(active)
    setProfileKey(suggestion.best.key)
    setShowCompare(true)
    setSuggestion(null)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
      <div className="relative h-[560px] lg:h-[680px] rounded-xl overflow-hidden shadow ring-1 ring-slate-200">
        <MapContainer center={[37.7755, -122.418]} zoom={14} scrollWheelZoom className="h-full w-full">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />

          <Marker position={start}>
            <Popup>Start</Popup>
          </Marker>
          <Marker position={end}>
            <Popup>Destination</Popup>
          </Marker>

          {/* Old route comparison overlay */}
          {showCompare && prevRoute && (
            <Polyline positions={prevRoute.path} pathOptions={{ color: '#94a3b8', weight: 4, opacity: 0.8, dashArray: '6 6' }} />
          )}

          {/* Draw per-segment safety colored polylines for active route */}
          {active.colored.map((c, idx) => (
            <Polyline key={idx} positions={c.coords} pathOptions={{ color: c.color, weight: 6, opacity: 0.95 }} />
          ))}

          {/* Render all intersections with traffic signals */}
          <TrafficSignalsLayer intersections={roadNetwork.intersections} />

          {/* Lane guidance hints */}
          <LaneGuidance path={active.path} />

          {/* Fit bounds to active route */}
          <FitBounds path={active.path} />

          {/* Simulated user position */}
          <Marker position={active.path[Math.min(progress.idx, active.path.length - 1)]}>
            <Popup>You are here (simulated)</Popup>
          </Marker>

          {/* Floating maneuver callout anchored to next turn */}
          {currentManeuver && (
            <FloatingManeuver nextPoint={currentManeuver.point} label={currentManeuver.label} />
          )}
        </MapContainer>

        {/* Route selector overlay */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-[700]">
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

        {/* Live alert suggestions */}
        {suggestion && (
          <div className="absolute top-3 right-3 z-[700] max-w-xs">
            <div className="bg-white/95 border border-slate-200 rounded-lg shadow p-3">
              <div className="text-sm font-semibold">Conditions changed</div>
              <div className="text-xs text-slate-600 mt-1">We found a better route.</div>
              <div className="flex items-center justify-between text-sm mt-2">
                <div className="pr-3 border-r">
                  <div className="text-slate-500">Time saved</div>
                  <div className="font-semibold">{Math.max(0, Math.round(suggestion.timeSaved))} min</div>
                </div>
                <div className="pl-3">
                  <div className="text-slate-500">Safety +</div>
                  <div className="font-semibold">{Math.round((suggestion.safetyGain / Math.max(active.avgSafety, 1)) * 100)}%</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={acceptSuggestion} className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-sm">Switch</button>
                <button onClick={() => setShowCompare((s) => !s)} className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-sm border">
                  {showCompare ? 'Hide compare' : 'Compare'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-[700] bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-3 text-sm text-slate-700 shadow">
          <div className="font-semibold mb-1">Legend</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-emerald-500 inline-block" /> High safety</div>
            <div className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-amber-500 inline-block" /> Medium</div>
            <div className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm bg-red-500 inline-block" /> Low</div>
            <div className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Signal</div>
          </div>
        </div>

        {/* Preferences panel */}
        <div className="absolute bottom-3 right-3 z-[700] bg-white/95 backdrop-blur border border-slate-200 rounded-lg p-3 text-sm text-slate-700 shadow w-[260px]">
          <div className="font-semibold mb-2">Preferences</div>
          <label className="block text-xs text-slate-500">Avoid busy roads: {(prefs.avoidBusy*100).toFixed(0)}%</label>
          <input type="range" min="0" max="1" step="0.05" value={prefs.avoidBusy} onChange={(e)=>setPrefs((p)=>({ ...p, avoidBusy: parseFloat(e.target.value) }))} className="w-full" />
          <label className="block text-xs text-slate-500 mt-2">Prefer well-lit streets: {(prefs.preferLit*100).toFixed(0)}%</label>
          <input type="range" min="0" max="1" step="0.05" value={prefs.preferLit} onChange={(e)=>setPrefs((p)=>({ ...p, preferLit: parseFloat(e.target.value) }))} className="w-full" />
          <label className="block text-xs text-slate-500 mt-2">Comfort level</label>
          <div className="flex items-center gap-2">
            <input type="range" min="0" max="1" step="0.25" value={prefs.comfort} onChange={(e)=>setPrefs((p)=>({ ...p, comfort: parseFloat(e.target.value) }))} className="w-full" />
            <span className="text-xs w-14 text-right">{prefs.comfort < 0.34 ? 'Low' : prefs.comfort < 0.67 ? 'Medium' : 'High'}</span>
          </div>
          <label className="block text-xs text-slate-500 mt-3">Predict next (min): {horizon}</label>
          <input type="range" min="5" max="30" step="5" value={horizon} onChange={(e)=>setHorizon(parseInt(e.target.value))} className="w-full" />
          <div className="flex items-center justify-between mt-2">
            <button className={`text-xs px-2 py-1 rounded border ${simOn ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'}`} onClick={()=>setSimOn((v)=>!v)}>
              {simOn ? 'Sim ON' : 'Sim OFF'}
            </button>
            <button className="text-xs px-2 py-1 rounded border" onClick={()=>setShowCompare((s)=>!s)}>{showCompare ? 'Hide compare' : 'Show compare'}</button>
          </div>
        </div>
      </div>

      {/* Route journal side panel */}
      <div className="h-[560px] lg:h-[680px] rounded-xl overflow-hidden bg-gradient-to-b from-slate-50 to-white border border-slate-200 shadow p-4">
        <RouteJournal steps={active.steps} total={active.total} etaMin={active.etaMin} profile={profile} safetyAvg={active.avgSafety} />
      </div>
    </div>
  )
}
