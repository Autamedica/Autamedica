/* eslint-disable */
// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { MapPin, Users, Star, DollarSign, Clock } from 'lucide-react'
import { MarketplaceJobOffer, MarketplaceDoctor, Coordinates, ARGENTINE_CITIES } from '@/types/marketplace'

interface MarkerData {
  id: string
  type: 'job' | 'doctor'
  position: Coordinates
  data: MarketplaceJobOffer | MarketplaceDoctor
}

interface InteractiveMapProps {
  jobs: MarketplaceJobOffer[]
  doctors: MarketplaceDoctor[]
  selectedItem?: string
  onItemSelect: (item: MarketplaceJobOffer | MarketplaceDoctor) => void
  filters?: {
    specialty?: string
    location?: string
    urgent?: boolean
  }
}

export function InteractiveMap({ jobs, doctors, selectedItem, onItemSelect, filters }: InteractiveMapProps) {
  const [mapCenter, setMapCenter] = useState<Coordinates>(ARGENTINE_CITIES['Ciudad Autónoma de Buenos Aires'])
  const [zoomLevel, setZoomLevel] = useState(6)
  const [markers, setMarkers] = useState<MarkerData[]>([])
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null)

  useEffect(() => {
    const jobMarkers: MarkerData[] = jobs.map(job => ({
      id: job.id,
      type: 'job',
      position: job.location.coordinates,
      data: job
    }))

    const doctorMarkers: MarkerData[] = doctors.map(doctor => ({
      id: doctor.id,
      type: 'doctor',
      position: doctor.location.coordinates,
      data: doctor
    }))

    setMarkers([...jobMarkers, ...doctorMarkers])
  }, [jobs, doctors])

  const getMarkerColor = (marker: MarkerData) => {
    if (marker.type === 'job') {
      const job = marker.data as MarketplaceJobOffer
      if (job.urgent) return 'bg-red-500'
      return 'bg-blue-500'
    } else {
      const doctor = marker.data as MarketplaceDoctor
      if (doctor.isUrgentAvailable) return 'bg-emerald-500'
      if (doctor.isOnline) return 'bg-green-500'
      return 'bg-gray-400'
    }
  }

  const getMarkerSize = (marker: MarkerData) => {
    if (marker.type === 'job') {
      const job = marker.data as MarketplaceJobOffer
      if (job.urgent) return 'w-6 h-6'
      return 'w-4 h-4'
    } else {
      const doctor = marker.data as MarketplaceDoctor
      if (doctor.isUrgentAvailable) return 'w-6 h-6'
      return 'w-4 h-4'
    }
  }

  const formatSalary = (job: MarketplaceJobOffer) => {
    const { min, max, currency, period } = job.salary
    return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}/${period}`
  }

  const formatHourlyRate = (doctor: MarketplaceDoctor) => {
    const { amount, currency } = doctor.hourlyRate
    return `${currency} ${amount.toLocaleString()}/hora`
  }

  // Conversión de coordenadas reales a píxeles del mapa (simulado)
  const coordsToPixels = (coords: Coordinates) => {
    const mapWidth = 800
    const mapHeight = 600

    // Bounds aproximados de Argentina
    const bounds = {
      north: -21.8,
      south: -55.0,
      east: -53.6,
      west: -73.5
    }

    const x = ((coords.lng - bounds.west) / (bounds.east - bounds.west)) * mapWidth
    const y = ((bounds.north - coords.lat) / (bounds.north - bounds.south)) * mapHeight

    return { x: Math.max(0, Math.min(mapWidth, x)), y: Math.max(0, Math.min(mapHeight, y)) }
  }

  const handleMarkerClick = (marker: MarkerData) => {
    onItemSelect(marker.data)
  }

  const handleCityClick = (cityName: keyof typeof ARGENTINE_CITIES) => {
    setMapCenter(ARGENTINE_CITIES[cityName])
    setZoomLevel(8)
  }

  return (
    <div className="relative w-full h-[600px] bg-neutral-50 rounded-lg overflow-hidden border border-gray-200">
      {/* Mapa de fondo simulado */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-neutral-50">
        {/* Grid de fondo */}
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={`h-${i}`} className="absolute w-full h-px bg-gray-300" style={{ top: `${i * 5}%` }} />
          ))}
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={`v-${i}`} className="absolute h-full w-px bg-gray-300" style={{ left: `${i * 5}%` }} />
          ))}
        </div>

        {/* Silueta de Argentina simplificada */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 600">
          <path
            d="M400,100 L450,120 L480,150 L500,200 L520,250 L510,300 L480,350 L450,400 L420,450 L400,500 L380,450 L350,400 L320,350 L300,300 L310,250 L330,200 L350,150 L380,120 Z"
            fill="rgba(209, 213, 219, 0.4)"
            stroke="rgba(156, 163, 175, 0.6)"
            strokeWidth="2"
          />
        </svg>

        {/* Ciudades principales */}
        {Object.entries(ARGENTINE_CITIES).map(([cityName, coords]) => {
          const pixels = coordsToPixels(coords)
          const isCapital = cityName === 'Ciudad Autónoma de Buenos Aires'

          return (
            <button
              key={cityName}
              onClick={() => handleCityClick(cityName as keyof typeof ARGENTINE_CITIES)}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${pixels.x}px`, top: `${pixels.y}px` }}
            >
              <div className={`${isCapital ? 'w-3 h-3' : 'w-2 h-2'} ${isCapital ? 'bg-amber-500' : 'bg-gray-500'} rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-150`} />
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 bg-white text-gray-900 text-xs px-2 py-1 rounded shadow-lg border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {cityName}
              </div>
            </button>
          )
        })}

        {/* Marcadores de trabajos y médicos */}
        {markers.map((marker) => {
          const pixels = coordsToPixels(marker.position)
          const isSelected = selectedItem === marker.id
          const isHovered = hoveredMarker === marker.id

          return (
            <button
              key={marker.id}
              onClick={() => handleMarkerClick(marker)}
              onMouseEnter={() => setHoveredMarker(marker.id)}
              onMouseLeave={() => setHoveredMarker(null)}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10"
              style={{ left: `${pixels.x}px`, top: `${pixels.y}px` }}
            >
              <div className={`
                ${getMarkerSize(marker)}
                ${getMarkerColor(marker)}
                rounded-full border-2 border-white shadow-lg transition-all duration-200
                ${isSelected ? 'scale-150 ring-2 ring-blue-500' : ''}
                ${isHovered ? 'scale-125' : ''}
                hover:scale-125
              `}>
                {marker.type === 'job' ? (
                  <MapPin className="w-full h-full text-white p-0.5" />
                ) : (
                  <Users className="w-full h-full text-white p-0.5" />
                )}
              </div>

              {/* Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-white border border-gray-200 text-gray-900 p-3 rounded-lg shadow-lg z-20 w-64">
                  {marker.type === 'job' ? (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">{(marker.data as MarketplaceJobOffer).title}</h4>
                      <p className="text-xs text-gray-500">{(marker.data as MarketplaceJobOffer).company}</p>
                      <div className="flex items-center gap-1 text-xs">
                        <MapPin className="w-3 h-3" />
                        {(marker.data as MarketplaceJobOffer).location.city}
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <DollarSign className="w-3 h-3" />
                        {formatSalary(marker.data as MarketplaceJobOffer)}
                      </div>
                      {(marker.data as MarketplaceJobOffer).urgent && (
                        <span className="inline-block bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                          URGENTE
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">{(marker.data as MarketplaceDoctor).name}</h4>
                      <p className="text-xs text-gray-500">{(marker.data as MarketplaceDoctor).specialties.join(', ')}</p>
                      <div className="flex items-center gap-1 text-xs">
                        <MapPin className="w-3 h-3" />
                        {(marker.data as MarketplaceDoctor).location.city}
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Star className="w-3 h-3 text-amber-500" />
                        {(marker.data as MarketplaceDoctor).rating}
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <DollarSign className="w-3 h-3" />
                        {formatHourlyRate(marker.data as MarketplaceDoctor)}
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="w-3 h-3" />
                        {(marker.data as MarketplaceDoctor).experience} años exp.
                      </div>
                      {(marker.data as MarketplaceDoctor).isOnline && (
                        <span className="inline-block bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                          En línea
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Controles del mapa */}
      <div className="absolute top-4 right-4 space-y-2">
        <button
          onClick={() => setZoomLevel(Math.min(10, zoomLevel + 1))}
          className="block w-8 h-8 bg-white hover:bg-gray-100 border border-gray-200 rounded text-gray-900 font-bold"
        >
          +
        </button>
        <button
          onClick={() => setZoomLevel(Math.max(4, zoomLevel - 1))}
          className="block w-8 h-8 bg-white hover:bg-gray-100 border border-gray-200 rounded text-gray-900 font-bold"
        >
          -
        </button>
      </div>

      {/* Leyenda */}
      <div className="absolute bottom-4 left-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
        <h4 className="text-gray-900 font-medium text-sm mb-2">Leyenda</h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-gray-700">Trabajos urgentes</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-gray-700">Trabajos disponibles</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
            <span className="text-gray-700">Médicos disponibles urgente</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-gray-700">Médicos en línea</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
            <span className="text-gray-700">Ciudades principales</span>
          </div>
        </div>
      </div>

      {/* Estadísticas del mapa */}
      <div className="absolute top-4 left-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-gray-500">Trabajos:</span>
            <p className="text-gray-900 font-semibold">{jobs.length}</p>
          </div>
          <div>
            <span className="text-gray-500">Urgentes:</span>
            <p className="text-red-600 font-semibold">{jobs.filter(j => j.urgent).length}</p>
          </div>
          <div>
            <span className="text-gray-500">Médicos:</span>
            <p className="text-gray-900 font-semibold">{doctors.length}</p>
          </div>
          <div>
            <span className="text-gray-500">En línea:</span>
            <p className="text-green-600 font-semibold">{doctors.filter(d => d.isOnline).length}</p>
          </div>
        </div>
      </div>
    </div>
  )
}