import { useEffect, useState, type FormEvent } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import LiveMap from './LiveMap'

type Participant = {
  id?: string
  name: string
  motorType: string
  gps: string
  locationName: string
  departureGps?: string
  departureLocationName?: string
  battery: string
  status: string
}

type RoutePoint = {
  id?: string
  name: string
  lat: string
  lng: string
  status: string
}

type Destination = {
  name: string
  lat: string
  lng: string
}

const participantsCollection = collection(db, 'participants')
const routePointsCollection = collection(db, 'routePoints')
const tourSettingsDocument = doc(db, 'tourSettings', 'main')

const initialParticipants: Participant[] = [
  { name: 'Ayu', motorType: 'Yamaha NMax', gps: '-7.5123, 110.8415', locationName: 'Kawasan Kromoredjo', departureGps: '-7.5123, 110.8415', departureLocationName: 'Kawasan Kromoredjo', battery: '92%', status: 'On route' },
  { name: 'Rizky', motorType: 'Honda PCX', gps: '-7.5191, 110.8468', locationName: 'Pos 2', departureGps: '-7.5191, 110.8468', departureLocationName: 'Kawasan Kromoredjo', battery: '84%', status: 'Checking point' },
  { name: 'Dina', motorType: 'Vario 125', gps: '-7.5249, 110.8554', locationName: 'Checkpoint', departureGps: '-7.5249, 110.8554', departureLocationName: 'Kawasan Kromoredjo', battery: '76%', status: 'Delay 3 min' },
]

const initialRoutePoints: RoutePoint[] = [
  { name: 'Pos 1', lat: '-7.512', lng: '110.841', status: 'OK' },
  { name: 'Checkpoint', lat: '-7.518', lng: '110.848', status: 'Awas' },
  { name: 'Pos 2', lat: '-7.523', lng: '110.858', status: 'OK' },
  { name: 'Finish', lat: '-7.531', lng: '110.865', status: 'Sampai' },
]

const initialDestination: Destination = {
  name: 'Kawasan Kromoredjo',
  lat: '-7.531',
  lng: '110.865',
}

const geocodeLocation = async (query: string) => {
  const trimmed = query.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/\s*@\s*/g, ' ').replace(/\s+/g, ' ')
  const normalizedKey = normalized.toLowerCase()

  if (normalizedKey.includes('reddoorz resort') && normalizedKey.includes('tridaya') && normalizedKey.includes('cisarua')) {
    return {
      lat: '-6.6695627',
      lng: '106.9292697',
      name: 'RedDoorz Resort @ Tridaya Cisarua Puncak',
    }
  }

  const queries = Array.from(new Set([
    trimmed,
    normalized,
    `${normalized}, Cisarua, Puncak, Indonesia`,
    `${normalized}, Bogor, Jawa Barat, Indonesia`,
  ]))

  for (const searchQuery of queries) {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('q', searchQuery)
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('limit', '5')
      url.searchParams.set('countrycodes', 'id')
      url.searchParams.set('accept-language', 'id')

      const response = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) continue

      const data = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>
      const first = data[0]

      if (first) {
        return {
          lat: first.lat,
          lng: first.lon,
          name: first.display_name ?? trimmed,
        }
      }
    } catch {
      // Try the next query variation when this request cannot be resolved.
    }
  }

  try {
    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', normalized)
    url.searchParams.set('limit', '5')

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    })

    if (response.ok) {
        const data = (await response.json()) as {
          features?: Array<{
            geometry?: { coordinates?: [number, number] }
            properties?: { name?: string; city?: string; country?: string }
          }>
        }
        const first = data.features?.[0]
      const coordinates = first?.geometry?.coordinates

      if (coordinates && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1])) {
        const locationLabel = [first.properties?.name, first.properties?.city, first.properties?.country]
          .filter(Boolean)
          .join(', ')

        return {
          lat: String(coordinates[1]),
          lng: String(coordinates[0]),
          name: locationLabel || trimmed,
        }
      }
    }
  } catch {
    // The UI will show the not-found message when both public geocoders fail.
  }

  return null
}

const navItems = [
  { id: 'home', label: 'Home' },
  { id: 'tour', label: 'Tour' },
  { id: 'peserta', label: 'Peserta' },
  { id: 'galeri', label: 'Galeri' },
] as const

function StatusBadge({ value }: { value: string }) {
  const palette = {
    'On route': 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30',
    'Checking point': 'bg-amber-500/15 text-amber-200 border-amber-400/30',
    'Delay 3 min': 'bg-rose-500/15 text-rose-200 border-rose-400/30',
    OK: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    Awas: 'bg-yellow-500/15 text-yellow-200 border-yellow-400/30',
    Sampai: 'bg-violet-500/15 text-violet-200 border-violet-400/30',
  } as const

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${palette[value as keyof typeof palette] ?? 'bg-slate-500/15 text-slate-200 border-slate-400/30'}`}>
      {value}
    </span>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<(typeof navItems)[number]['id']>('home')
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>(initialRoutePoints)
  const [destination, setDestination] = useState<Destination>(initialDestination)
  const [destinationSearch, setDestinationSearch] = useState(initialDestination.name)
  const [locationStatus, setLocationStatus] = useState('')
  const [isLookingUpLocation, setIsLookingUpLocation] = useState(false)
  const [newParticipant, setNewParticipant] = useState({
    name: '',
    motorType: '',
    gps: '',
    locationName: '',
    battery: '100%',
  })
  const [newRoutePoint, setNewRoutePoint] = useState({
    name: '',
    lat: '',
    lng: '',
    status: 'OK',
  })

  useEffect(() => {
    const unsubscribeParticipants = onSnapshot(participantsCollection, async (snapshot) => {
      if (snapshot.empty) {
        const batch = writeBatch(db)
        initialParticipants.forEach((participant, index) => {
          batch.set(doc(participantsCollection, `participant-${index + 1}`), participant)
        })
        await batch.commit()
        return
      }

      setParticipants(snapshot.docs.map((participant) => ({
        id: participant.id,
        ...participant.data(),
      } as Participant)))
    })

    const unsubscribeRoutePoints = onSnapshot(routePointsCollection, async (snapshot) => {
      if (snapshot.empty) {
        const batch = writeBatch(db)
        initialRoutePoints.forEach((point, index) => {
          batch.set(doc(routePointsCollection, `route-${index + 1}`), point)
        })
        await batch.commit()
        return
      }

      setRoutePoints(snapshot.docs.map((point) => ({
        id: point.id,
        ...point.data(),
      } as RoutePoint)))
    })

    const unsubscribeDestination = onSnapshot(tourSettingsDocument, async (snapshot) => {
      if (!snapshot.exists()) {
        await setDoc(tourSettingsDocument, initialDestination)
        return
      }

      const savedDestination = snapshot.data() as Destination
      setDestination(savedDestination)
      setDestinationSearch(savedDestination.name)
    })

    return () => {
      unsubscribeParticipants()
      unsubscribeRoutePoints()
      unsubscribeDestination()
    }
  }, [])

  const stats = [
    { label: 'Rute aktif', value: routePoints.length.toString().padStart(2, '0'), hint: 'Tour berjalan' },
    { label: 'GPS online', value: `${Math.min(99, Math.max(80, participants.length * 15))}%`, hint: 'Koneksi stabil' },
    { label: 'Peserta', value: `${participants.length}`, hint: 'Dalam mobil' },
  ]

  const getBatteryLevel = async () => {
    const browserNavigator = navigator as Navigator & {
      battery?: { level?: number }
      webkitBattery?: { level?: number }
      getBattery?: () => Promise<{ level?: number }>
    }

    const battery = browserNavigator.battery
      ?? browserNavigator.webkitBattery
      ?? (browserNavigator.getBattery ? await browserNavigator.getBattery() : null)

    if (!battery) {
      return 'Tidak tersedia'
    }

    if (typeof battery.level !== 'number') {
      return 'Tidak tersedia'
    }

    const level = Math.round(battery.level * 100)
    return `${level}%`
  }

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      return { gps: '', locationName: 'Lokasi tidak tersedia' }
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      return { gps: '', locationName: 'GPS membutuhkan koneksi HTTPS' }
    }

    return new Promise<{ gps: string; locationName: string }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude.toFixed(5)
          const lng = position.coords.longitude.toFixed(5)
          const geoResult = await geocodeLocation(`${lat}, ${lng}`)

          resolve({
            gps: `${lat}, ${lng}`,
            locationName: geoResult?.name ?? 'Lokasi saat ini',
          })
        },
        (error) => {
          const message = error.code === error.PERMISSION_DENIED
            ? 'Izin lokasi ditolak'
            : error.code === error.TIMEOUT
              ? 'Lokasi belum ditemukan'
              : 'Lokasi tidak tersedia'
          resolve({ gps: '', locationName: message })
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  const addParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = newParticipant.name.trim()
    const motorType = newParticipant.motorType.trim()

    if (!name || !motorType) return

    const currentLocation = await getCurrentLocation()
    const battery = await getBatteryLevel()

    await setDoc(doc(participantsCollection), {
      name,
      motorType,
      gps: currentLocation.gps || 'Tidak tersedia',
      locationName: currentLocation.locationName || 'Lokasi saat ini',
      departureGps: currentLocation.gps || 'Tidak tersedia',
      departureLocationName: currentLocation.locationName || 'Lokasi awal tidak tersedia',
      battery,
      status: 'On route',
    })

    setNewParticipant({ name: '', motorType: '', gps: '', locationName: '', battery: '100%' })
  }

  const removeParticipant = async (index: number) => {
    const participant = participants[index]
    if (participant?.id) {
      await deleteDoc(doc(participantsCollection, participant.id))
    }
  }

  const addRoutePoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = newRoutePoint.name.trim()

    if (!name) return

    const resolved = await geocodeLocation(name)

    if (!resolved) {
      setLocationStatus('Titik rute tidak ditemukan. Coba ketik nama lokasi yang lebih jelas.')
      return
    }

    await setDoc(doc(routePointsCollection), {
      name: resolved.name,
      lat: resolved.lat,
      lng: resolved.lng,
      status: newRoutePoint.status || 'OK',
    })

    setNewRoutePoint({ name: '', lat: '', lng: '', status: 'OK' })
    setLocationStatus('Titik rute berhasil ditambahkan.')
  }

  const resolveDestination = async () => {
    const resolved = await geocodeLocation(destinationSearch)
    if (!resolved) {
      setLocationStatus('Lokasi tidak ditemukan. Coba ketik nama tempat yang lebih spesifik.')
      return
    }

    const nextDestination = {
      name: resolved.name,
      lat: resolved.lat,
      lng: resolved.lng,
    }

    await setDoc(tourSettingsDocument, nextDestination)
    setDestination(nextDestination)
    setDestinationSearch(resolved.name)
    setLocationStatus('Lokasi berhasil ditemukan.')
  }

  const resolveRoutePoint = async () => {
    const resolved = await geocodeLocation(newRoutePoint.name)
    if (!resolved) {
      setLocationStatus('Titik rute tidak ditemukan. Coba ketik nama lokasi yang lebih jelas.')
      return
    }

    setNewRoutePoint((current) => ({
      ...current,
      name: resolved.name,
      lat: resolved.lat,
      lng: resolved.lng,
    }))
    setLocationStatus('Koordinat titik rute berhasil diisi otomatis.')
  }

  const openMap = () => {
    setActiveTab('tour')

    window.setTimeout(() => {
      document.getElementById('tour-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  const removeRoutePoint = async (index: number) => {
    const routePoint = routePoints[index]
    if (routePoint?.id) {
      await deleteDoc(doc(routePointsCollection, routePoint.id))
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 shadow-[0_0_30px_rgba(14,165,233,0.15)] backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 text-base font-black text-slate-950 shadow-lg shadow-cyan-500/20">
              GPS
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Tracking</p>
              <h1 className="text-lg font-bold text-white">Kromoredjo Touring</h1>
            </div>
          </div>

          <button className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:bg-cyan-400/20">
            Live
          </button>
        </header>

        <main className="space-y-6">
          {activeTab === 'home' && (
            <>
              <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <div className="rounded-[28px] border border-cyan-400/20 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl shadow-cyan-500/10">
                  <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Monitoring perjalanan</p>
                  <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">
                    GPS touring aktif untuk mengawasi seluruh rombongan.
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                    Pantau posisi, kecepatan, checkpoint, dan status peserta secara real-time agar perjalanan aman dan terkoordinasi.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={openMap} className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
                      Lihat Map
                    </button>
                    <button className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                      Kirim Peringatan
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-slate-900/75 p-5">
                  <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Tujuan touring</p>
                    <p className="mt-2 text-lg font-semibold text-white">{destination.name}</p>
                    <p className="mt-1 text-xs text-slate-300">{destination.lat}, {destination.lng}</p>
                  </div>

                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-slate-300">Status rute</p>
                    <StatusBadge value="OK" />
                  </div>

                  <div className="space-y-3">
                    {routePoints.map((point) => (
                      <div key={`${point.name}-${point.lat}-${point.lng}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div>
                          <p className="text-sm font-medium text-white">{point.name}</p>
                          <p className="text-[11px] text-slate-400">{point.lat}, {point.lng}</p>
                        </div>
                        <StatusBadge value={point.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                {stats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 backdrop-blur-xl">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{stat.label}</p>
                    <p className="mt-3 text-3xl font-black text-white">{stat.value}</p>
                    <p className="mt-1 text-xs text-cyan-300">{stat.hint}</p>
                  </div>
                ))}
              </section>
            </>
          )}

          {activeTab === 'tour' && (
            <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
              <div id="tour-map" className="rounded-[28px] border border-white/10 bg-slate-900/75 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-xl font-bold">Detail tour</h3>
                  <StatusBadge value="On route" />
                </div>

                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setIsLookingUpLocation(true)
                    const resolved = await geocodeLocation(destinationSearch)
                    setIsLookingUpLocation(false)

                    if (!resolved) {
                      setLocationStatus('Lokasi tujuan tidak ditemukan. Coba ketik nama tempat yang lebih spesifik.')
                      return
                    }

                    const nextDestination = {
                      name: resolved.name,
                      lat: resolved.lat,
                      lng: resolved.lng,
                    }

                    await setDoc(tourSettingsDocument, nextDestination)
                    setDestination(nextDestination)
                    setDestinationSearch(resolved.name)
                    setLocationStatus('Lokasi tujuan berhasil ditentukan.')
                  }}
                  className="mb-6 space-y-3 rounded-2xl border border-cyan-400/20 bg-slate-950/60 p-4"
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">Lokasi tujuan</p>
                  <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                    <input
                      value={destinationSearch}
                      onChange={(event) => setDestinationSearch(event.target.value)}
                      placeholder="Contoh: Puncak Pass, Kromoredjo, dll"
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
                    />
                    <button type="submit" disabled={isLookingUpLocation} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60">
                      {isLookingUpLocation ? 'Mencari...' : 'Cari lokasi'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextDestination = {
                          name: destinationSearch,
                          lat: destination.lat,
                          lng: destination.lng,
                        }

                        await setDoc(tourSettingsDocument, nextDestination)
                        setDestination(nextDestination)
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      Simpan
                    </button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3 text-xs text-slate-300">
                    <p className="font-semibold text-cyan-200">Koordinat hasil:</p>
                    <p className="mt-1">{destination.name} — {destination.lat}, {destination.lng}</p>
                  </div>

                  {locationStatus && (
                    <p className="text-xs text-cyan-200">{locationStatus}</p>
                  )}
                </form>

                <form onSubmit={addRoutePoint} className="mb-6 space-y-3 rounded-2xl border border-cyan-400/20 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">Tambah titik rute</p>
                    <button
                      type="button"
                      onClick={resolveRoutePoint}
                      className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-200 hover:bg-cyan-400/20"
                    >
                      Cari lokasi
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={newRoutePoint.name}
                      onChange={(event) => setNewRoutePoint((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Contoh: Pos 1, Checkpoint, Puncak Pass"
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
                    />
                    <select
                      value={newRoutePoint.status}
                      onChange={(event) => setNewRoutePoint((current) => ({ ...current, status: event.target.value }))}
                      className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white"
                    >
                      <option value="OK">OK</option>
                      <option value="Awas">Awas</option>
                      <option value="Sampai">Sampai</option>
                    </select>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3 text-xs text-slate-300">
                    <p className="font-semibold text-cyan-200">Koordinat otomatis:</p>
                    <p className="mt-1">{newRoutePoint.lat || 'Belum ditemukan'}{newRoutePoint.lat ? `, ${newRoutePoint.lng}` : ''}</p>
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                      + Tambah titik
                    </button>
                  </div>
                </form>

                <div className="space-y-3">
                  {routePoints.map((point, index) => (
                    <div key={`${point.name}-${point.lat}-${point.lng}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                      <div>
                        <p className="text-sm font-medium text-white">{point.name}</p>
                        <p className="text-[11px] text-slate-400">{point.lat}, {point.lng}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <StatusBadge value={point.status} />
                        <button onClick={() => removeRoutePoint(index)} className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-200 hover:bg-rose-500/20">
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-slate-900/75 p-5">
                <h3 className="text-xl font-bold">Peta real-time</h3>
                <div className="mt-4 h-80 rounded-2xl border border-dashed border-cyan-400/30 bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.15),_transparent_35%),linear-gradient(135deg,#020617,#111827)] p-4">
                  <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/5 bg-slate-950/50">
                    {routePoints.map((point, index) => (
                      <div
                        key={`${point.name}-dot-${index}`}
                        className="absolute h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.9)]"
                        style={{
                          left: `${12 + index * 18}%`,
                          top: `${18 + (index % 3) * 22}%`,
                        }}
                      />
                    ))}
                    <svg viewBox="0 0 300 220" className="h-full w-full opacity-70">
                      <path d="M20 160 C90 120, 120 100, 170 130 S250 140, 290 80" fill="none" stroke="rgba(34,211,238,0.6)" strokeWidth="4" strokeDasharray="8 8" />
                    </svg>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'peserta' && (
            <section className="rounded-[28px] border border-white/10 bg-slate-900/75 p-5">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-xl font-bold">Peserta touring</h3>
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                  {participants.length} aktif
                </span>
              </div>

              <form onSubmit={addParticipant} className="mb-6 grid gap-3 rounded-2xl border border-cyan-400/20 bg-slate-950/60 p-4 md:grid-cols-4">
                <input
                  value={newParticipant.name}
                  onChange={(event) => setNewParticipant((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nama"
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
                />
                <input
                  value={newParticipant.motorType}
                  onChange={(event) => setNewParticipant((current) => ({ ...current, motorType: event.target.value }))}
                  placeholder="Motor / Tipe"
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"
                />
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2.5 text-xs text-cyan-200">
                  GPS & baterai otomatis dari perangkat
                </div>
                <button type="submit" className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                  + Tambah
                </button>
              </form>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {participants.map((person, index) => (
                  <div key={`${person.name}-${person.motorType}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold text-white">{person.name}</p>
                        <p className="text-xs text-slate-400">{person.motorType}</p>
                      </div>
                      <StatusBadge value={person.status} />
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-300">
                      <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-amber-100">
                        Titik awal: {person.departureLocationName ?? 'Belum tersimpan'}
                      </p>
                      <p>Lokasi: {person.locationName}</p>
                      <p>GPS: {person.gps}</p>
                      <p>Baterai: {person.battery}</p>
                    </div>

                    <button onClick={() => removeParticipant(index)} className="mt-4 w-full rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-rose-200 hover:bg-rose-500/20">
                      Hapus peserta
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'galeri' && (
            <section className="rounded-[28px] border border-white/10 bg-slate-900/75 p-5">
              <h3 className="text-xl font-bold">Galeri perjalanan</h3>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {[
                  'Spot sunrise',
                  'Checkpoint puncak',
                  'Kebersamaan rombongan',
                ].map((title, index) => (
                  <div key={title} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
                    <div className={`h-44 bg-gradient-to-br ${index === 0 ? 'from-cyan-500/40 via-sky-500/20 to-slate-900' : index === 1 ? 'from-violet-500/40 via-indigo-500/20 to-slate-900' : 'from-emerald-500/40 via-cyan-500/20 to-slate-900'}`} />
                    <div className="p-4">
                      <p className="font-semibold text-white">{title}</p>
                      <p className="mt-1 text-sm text-slate-400">Dokumentasi tracking tour terbaru</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>

        <nav className="fixed bottom-3 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-full border border-cyan-400/20 bg-slate-900/80 p-2 shadow-2xl shadow-cyan-500/10 backdrop-blur-2xl">
          <div className="grid grid-cols-4 gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${activeTab === item.id ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}

export default App
