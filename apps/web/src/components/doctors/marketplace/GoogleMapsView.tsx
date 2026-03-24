'use client'

import type { DoctorWithProfile } from '@autamedica/types'
import { APIProvider, AdvancedMarker, InfoWindow, Map } from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'
import { useCallback, useState } from 'react'

interface DoctorMarker {
  doctor: DoctorWithProfile
  lat: number
  lng: number
}

interface GoogleMapsViewProps {
  doctors: DoctorWithProfile[]
  apiKey: string
}

const ARGENTINA_CENTER = { lat: -34.6, lng: -58.4 }
const DEFAULT_ZOOM = 5

function getDoctorName(doctor: DoctorWithProfile): string {
  const profile = doctor.profile as { first_name?: string; last_name?: string } | null
  if (!profile) return 'Profesional'
  const parts = [profile.first_name, profile.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Profesional'
}

export function GoogleMapsView({ doctors, apiKey }: GoogleMapsViewProps) {
  const [selectedMarker, setSelectedMarker] = useState<DoctorMarker | null>(null)

  const markers: DoctorMarker[] = doctors
    .filter(d => {
      const meta = d as unknown as Record<string, unknown>
      return typeof meta.latitude === 'number' && typeof meta.longitude === 'number'
        && meta.latitude !== 0 && meta.longitude !== 0
    })
    .map(d => {
      const meta = d as unknown as Record<string, unknown>
      return {
        doctor: d,
        lat: meta.latitude as number,
        lng: meta.longitude as number,
      }
    })

  const handleMarkerClick = useCallback((marker: DoctorMarker) => {
    setSelectedMarker(marker)
  }, [])

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-am-surface-200 bg-am-surface-50">
        <div className="text-center p-8">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-am-surface-400" />
          <p className="text-sm text-am-surface-500">
            Configure <code className="rounded bg-am-surface-100 px-1.5 py-0.5 text-xs">PUBLIC_GOOGLE_MAPS_API_KEY</code> para habilitar el mapa
          </p>
        </div>
      </div>
    )
  }

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={ARGENTINA_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        mapId="autamedica-coverage"
        className="h-full w-full rounded-xl"
        gestureHandling="greedy"
        disableDefaultUI={false}
      >
        {markers.map(m => (
          <AdvancedMarker
            key={m.doctor.id}
            position={{ lat: m.lat, lng: m.lng }}
            onClick={() => handleMarkerClick(m)}
          />
        ))}

        {selectedMarker && (
          <InfoWindow
            position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
            onCloseClick={() => setSelectedMarker(null)}
          >
            <div className="min-w-[160px] p-1">
              <p className="font-medium text-sm text-gray-900">
                {getDoctorName(selectedMarker.doctor)}
              </p>
              {selectedMarker.doctor.specialty && (
                <p className="text-xs text-gray-500 mt-0.5">{selectedMarker.doctor.specialty}</p>
              )}
              {selectedMarker.doctor.years_experience != null && selectedMarker.doctor.years_experience > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedMarker.doctor.years_experience} años de experiencia
                </p>
              )}
            </div>
          </InfoWindow>
        )}
      </Map>
    </APIProvider>
  )
}
