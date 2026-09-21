import { useEffect } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
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

const parseCoordinatePair = (value: string) => {
  const [lat, lng] = value.split(',').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) ? ([lat, lng] as Coordinate) : null
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
    .map((participant) => parseCoordinatePair(participant.gps))
    .filter((point): point is Coordinate => point !== null)
  const departureCoordinates = participants
    .map((participant) => parseCoordinatePair(participant.departureGps ?? ''))
    .filter((point): point is Coordinate => point !== null)
  const destinationCoordinate = parseCoordinatePair(`${destination.lat},${destination.lng}`)
  const allCoordinates = [
    ...routeCoordinates,
    ...participantCoordinates,
    ...departureCoordinates,
    ...(destinationCoordinate ? [destinationCoordinate] : []),
  ]
  const defaultCenter: Coordinate = destinationCoordinate ?? routeCoordinates[0] ?? [-7.52, 110.85]

  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-400/30">
      <MapContainer center={defaultCenter} zoom={13} scrollWheelZoom className="h-80 w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMapBounds points={allCoordinates} />

        {routeCoordinates.length > 1 && (
          <Polyline positions={routeCoordinates} pathOptions={{ color: '#0891b2', weight: 5, opacity: 0.85 }} />
        )}

        {routePoints.map((point, index) => {
          const coordinate = parseCoordinatePair(`${point.lat},${point.lng}`)
          if (!coordinate) return null

          return (
            <CircleMarker key={`${point.name}-${index}`} center={coordinate} radius={8} pathOptions={{ color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 1 }}>
              <Popup>{point.name} · {point.status}</Popup>
            </CircleMarker>
          )
        })}

        {participants.map((participant, index) => {
          const coordinate = parseCoordinatePair(participant.gps)
          if (!coordinate) return null

          return (
            <CircleMarker key={`${participant.name}-${index}`} center={coordinate} radius={7} pathOptions={{ color: '#0369a1', fillColor: '#22d3ee', fillOpacity: 1 }}>
              <Popup>{participant.name} · {participant.locationName} · {participant.battery}</Popup>
            </CircleMarker>
          )
        })}

        {participants.map((participant, index) => {
          const coordinate = parseCoordinatePair(participant.departureGps ?? '')
          if (!coordinate) return null

          return (
            <CircleMarker key={`${participant.name}-departure-${index}`} center={coordinate} radius={6} pathOptions={{ color: '#92400e', fillColor: '#f59e0b', fillOpacity: 0.9 }}>
              <Popup>Titik awal {participant.name}: {participant.departureLocationName ?? 'Alamat awal'}</Popup>
            </CircleMarker>
          )
        })}

        {destinationCoordinate && (
          <CircleMarker center={destinationCoordinate} radius={10} pathOptions={{ color: '#7c3aed', fillColor: '#a78bfa', fillOpacity: 1 }}>
            <Popup>Tujuan: {destination.name}</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  )
}
