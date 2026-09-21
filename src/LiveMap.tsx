import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { divIcon } from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Coordinate = [number, number]

type MapParticipant = {
  name: string
  motorType: string
  gps: string
  locationName: string
  departureGps?: string
  departureLocationName?: string
  battery: string
  status: string
  assignedCheckpoint?: string
  assignedCheckpoints?: string[]
}

type MapRoutePoint = {
  name: string
  lat: string
  lng: string
  status: string
}

type MapDestination = {
  name: string
  lat: string
  lng: string
}

type LiveMapProps = {
  participants: MapParticipant[]
  routePoints: MapRoutePoint[]
  destination: MapDestination
}

const participantColors = [
  { border: '#be123c', fill: '#fb7185' },
  { border: '#0369a1', fill: '#38bdf8' },
  { border: '#047857', fill: '#34d399' },
  { border: '#a16207', fill: '#facc15' },
  { border: '#7e22ce', fill: '#c084fc' },
  { border: '#c2410c', fill: '#fb923c' },
]

const getParticipantColor = (name: string) => {
  const colorIndex = [...name].reduce((total, character) => total + character.charCodeAt(0), 0) % participantColors.length
  return participantColors[colorIndex]
}

const getLocationIcon = (color: string) => divIcon({
  className: 'map-triangle-icon',
  html: `<span style="display:block;width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid ${color};filter:drop-shadow(0 1px 2px rgba(15,23,42,.75));"></span>`,
  iconSize: [20, 18],
  iconAnchor: [10, 9],
  popupAnchor: [0, -9],
})

const getDestinationIcon = () => divIcon({
  className: 'map-diamond-icon',
  html: '<span style="display:block;width:15px;height:15px;background:#a78bfa;border:3px solid #6d28d9;transform:rotate(45deg);filter:drop-shadow(0 1px 2px rgba(15,23,42,.75));"></span>',
  iconSize: [21, 21],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
})

const getParticipantIcon = (name: string) => {
  const color = getParticipantColor(name)
  return divIcon({
    className: 'map-participant-icon',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${color.fill};border:3px solid ${color.border};color:#0f172a;font-size:10px;font-weight:800;box-shadow:0 2px 5px rgba(15,23,42,.7);">${name.slice(0, 1).toUpperCase()}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

const parseCoordinatePair = (value: string) => {
  const [lat, lng] = value.split(',').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) ? ([lat, lng] as Coordinate) : null
}

const distanceInMeters = (first: Coordinate, second: Coordinate) => {
  const earthRadius = 6371000
  const latitudeDifference = (second[0] - first[0]) * Math.PI / 180
  const longitudeDifference = (second[1] - first[1]) * Math.PI / 180
  const latitude = first[0] * Math.PI / 180
  const secondLatitude = second[0] * Math.PI / 180
  const value = Math.sin(latitudeDifference / 2) ** 2 + Math.cos(latitude) * Math.cos(secondLatitude) * Math.sin(longitudeDifference / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function FitMapBounds({ points }: { points: Coordinate[] }) {
  const map = useMap()

  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30] })
    } else if (points.length === 1) {
      map.setView(points[0], 14)
    }
  }, [map, points])

  return null
}

export default function LiveMap({ participants, routePoints, destination }: LiveMapProps) {
  const routeCoordinates = routePoints
    .map((point) => parseCoordinatePair(`${point.lat},${point.lng}`))
    .filter((point): point is Coordinate => point !== null)
  const participantCoordinates = participants
    .map((participant) => parseCoordinatePair(participant.gps) ?? parseCoordinatePair(participant.departureGps ?? ''))
    .filter((point): point is Coordinate => point !== null)
  const departureCoordinates = participants
    .map((participant) => parseCoordinatePair(participant.departureGps ?? ''))
    .filter((point): point is Coordinate => point !== null)
  const destinationCoordinate = parseCoordinatePair(`${destination.lat},${destination.lng}`)
  const checkpointCoordinates = new Map(
    routePoints.map((point) => [point.name, parseCoordinatePair(`${point.lat},${point.lng}`)]),
  )
  const participantCheckpointPaths = participants.flatMap((participant) => {
    const start = parseCoordinatePair(participant.gps) ?? parseCoordinatePair(participant.departureGps ?? '')
    if (!start) return []

    const checkpointName = participant.assignedCheckpoint ?? participant.assignedCheckpoints?.[0]

    return checkpointName ? (() => {
      const checkpoint = checkpointCoordinates.get(checkpointName)
      return checkpoint ? [{ participant, positions: [start, checkpoint] as Coordinate[] }] : []
    })() : []
  })
  const finalRouteStart = routeCoordinates[routeCoordinates.length - 1]
  const allCoordinates = [
    ...routeCoordinates,
    ...participantCoordinates,
    ...departureCoordinates,
    ...(destinationCoordinate ? [destinationCoordinate] : []),
  ]
  const defaultCenter: Coordinate = destinationCoordinate ?? routeCoordinates[0] ?? [-7.52, 110.85]

  const getArrivedParticipantNames = (point: MapRoutePoint) => {
    const pointCoordinate = parseCoordinatePair(`${point.lat},${point.lng}`)
    if (!pointCoordinate) return []

    return participants
      .filter((participant) => participant.assignedCheckpoint === point.name || participant.assignedCheckpoints?.[0] === point.name)
      .filter((participant) => {
        const participantCoordinate = parseCoordinatePair(participant.gps)
        return participantCoordinate && distanceInMeters(pointCoordinate, participantCoordinate) <= 100
      })
      .map((participant) => participant.name)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-400/30">
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-slate-200/30 bg-white px-3 py-2 text-xs text-slate-700">
        <span className="font-semibold">Anggota:</span>
        {participants.map((participant) => {
          const color = getParticipantColor(participant.name)

          return (
            <span key={`legend-${participant.name}`} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color.fill, border: `2px solid ${color.border}` }} />
              {participant.name}
            </span>
          )
        })}
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent border-b-amber-500" />Lokasi / titik awal</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 border-2 border-violet-700 bg-violet-400" />Tujuan</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 border-t-2 border-dashed border-slate-700" />Jalur ke checkpoint</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 border-t-2 border-dotted border-violet-700" />Jalur tujuan akhir</span>
      </div>
      <MapContainer center={defaultCenter} zoom={13} scrollWheelZoom className="h-80 w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMapBounds points={allCoordinates} />

        {routeCoordinates.length > 1 && (
          <Polyline positions={routeCoordinates} pathOptions={{ color: '#0891b2', weight: 5, opacity: 0.85 }} />
        )}

        {participantCheckpointPaths.map(({ participant, positions }, index) => {
          const color = getParticipantColor(participant.name)

          return (
            <Polyline
              key={`${participant.name}-checkpoint-path-${index}`}
              positions={positions}
              pathOptions={{ color: color.border, weight: 3, opacity: 0.8, dashArray: '6 8' }}
            />
          )
        })}

        {destinationCoordinate && finalRouteStart && (
          <Polyline
            positions={[finalRouteStart, destinationCoordinate]}
            pathOptions={{ color: '#7c3aed', weight: 5, opacity: 0.9, dashArray: '2 7' }}
          />
        )}

        {routePoints.map((point, index) => {
          const coordinate = parseCoordinatePair(`${point.lat},${point.lng}`)
          if (!coordinate) return null

          return (
            <Marker key={`${point.name}-${index}`} position={coordinate} icon={getLocationIcon('#f59e0b')}>
              <Popup>
                <strong>{point.name}</strong><br />
                {getArrivedParticipantNames(point).length > 0 && (
                  <>Sampai: {getArrivedParticipantNames(point).join(', ')}</>
                )}
              </Popup>
            </Marker>
          )
        })}

        {participants.map((participant, index) => {
          const currentCoordinate = parseCoordinatePair(participant.gps)
          const coordinate = currentCoordinate ?? parseCoordinatePair(participant.departureGps ?? '')
          if (!coordinate) return null

          return (
            <Marker key={`${participant.name}-${index}`} position={coordinate} icon={getParticipantIcon(participant.name)}>
              <Popup>{participant.name} · {currentCoordinate ? participant.locationName : `Titik awal: ${participant.departureLocationName ?? 'Alamat awal'}`} · {participant.battery}</Popup>
            </Marker>
          )
        })}

        {participants.map((participant, index) => {
          const currentCoordinate = parseCoordinatePair(participant.gps)
          const coordinate = parseCoordinatePair(participant.departureGps ?? '')
          if (!coordinate || !currentCoordinate) return null

          return (
            <Marker key={`${participant.name}-departure-${index}`} position={coordinate} icon={getLocationIcon('#f59e0b')}>
              <Popup>Titik awal {participant.name}: {participant.departureLocationName ?? 'Alamat awal'}</Popup>
            </Marker>
          )
        })}

        {destinationCoordinate && (
          <Marker position={destinationCoordinate} icon={getDestinationIcon()}>
            <Popup>Tujuan: {destination.name}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}
