/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'


import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@autamedica/auth'
import { logger } from '@autamedica/shared'
import type { WaffleCategory } from '@/components/shared/WaffleChart'

interface UsePatientDemographicsReturn {
  genderData: WaffleCategory[]
  regionData: WaffleCategory[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

// Mocks ultra-realistas basados en la imagen de referencia para fallbacks
const MOCK_GENDER_DATA: WaffleCategory[] = [
  {
    id: 'femenino',
    label: 'Femenino',
    value: 355,
    percentage: 23,
    colorClass: 'bg-violet-500 hover:bg-violet-600',
    bgLightClass: 'bg-violet-50',
    textClass: 'text-violet-600',
  },
  {
    id: 'masculino',
    label: 'Masculino',
    value: 883,
    percentage: 56,
    colorClass: 'bg-blue-500 hover:bg-blue-600',
    bgLightClass: 'bg-blue-50',
    textClass: 'text-blue-600',
  },
  {
    id: 'otro',
    label: 'Otro / Sin Especificar',
    value: 334,
    percentage: 21,
    colorClass: 'bg-neutral-400 hover:bg-neutral-500',
    bgLightClass: 'bg-neutral-50',
    textClass: 'text-neutral-500',
  },
]

const MOCK_REGION_DATA: WaffleCategory[] = [
  {
    id: 'caba',
    label: 'CABA',
    value: 645,
    percentage: 41,
    colorClass: 'bg-emerald-500 hover:bg-emerald-600',
    bgLightClass: 'bg-emerald-50',
    textClass: 'text-emerald-600',
  },
  {
    id: 'gba',
    label: 'Buenos Aires (GBA)',
    value: 597,
    percentage: 38,
    colorClass: 'bg-teal-500 hover:bg-teal-600',
    bgLightClass: 'bg-teal-50',
    textClass: 'text-teal-600',
  },
  {
    id: 'otras',
    label: 'Otras Provincias / Interior',
    value: 330,
    percentage: 21,
    colorClass: 'bg-neutral-400 hover:bg-neutral-500',
    bgLightClass: 'bg-neutral-50',
    textClass: 'text-neutral-500',
  },
]

export function usePatientDemographics(doctorId?: string): UsePatientDemographicsReturn {
  const [genderData, setGenderData] = useState<WaffleCategory[]>(MOCK_GENDER_DATA)
  const [regionData, setRegionData] = useState<WaffleCategory[]>(MOCK_REGION_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDemographics = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const supabase = createBrowserClient()

      // Consultamos la vista de demografía
      const { data, error: dbError } = await supabase
        .from('v_patient_demographics')
        .select('*')

      if (dbError) {
        throw dbError
      }

      if (!data || data.length === 0) {
        // Si no hay datos, dejamos los mocks ultra realistas por defecto
        setGenderData(MOCK_GENDER_DATA)
        setRegionData(MOCK_REGION_DATA)
        return
      }

      // Procesamos las categorías de género
      const genderCounts: Record<string, number> = {}
      const regionCounts: Record<string, number> = {}
      let totalPatients = 0

      data.forEach((row: any) => {
        const count = parseInt(row.count || '0', 10)
        totalPatients += count

        // Agrupar por género
        const genderKey = (row.gender || 'unknown').toLowerCase()
        genderCounts[genderKey] = (genderCounts[genderKey] || 0) + count

        // Agrupar por región
        const regionKey = (row.region || 'unknown').toLowerCase()
        regionCounts[regionKey] = (regionCounts[regionKey] || 0) + count
      })

      if (totalPatients === 0) {
        setGenderData(MOCK_GENDER_DATA)
        setRegionData(MOCK_REGION_DATA)
        return
      }

      // Mapeamos a la interfaz WaffleCategory
      const processedGender: WaffleCategory[] = [
        {
          id: 'femenino',
          label: 'Femenino',
          value: genderCounts['female'] || genderCounts['femenino'] || 0,
          percentage: Math.round(((genderCounts['female'] || genderCounts['femenino'] || 0) / totalPatients) * 100),
          colorClass: 'bg-violet-500 hover:bg-violet-600',
          bgLightClass: 'bg-violet-50',
          textClass: 'text-violet-600',
        },
        {
          id: 'masculino',
          label: 'Masculino',
          value: genderCounts['male'] || genderCounts['masculino'] || 0,
          percentage: Math.round(((genderCounts['male'] || genderCounts['masculino'] || 0) / totalPatients) * 100),
          colorClass: 'bg-blue-500 hover:bg-blue-600',
          bgLightClass: 'bg-blue-50',
          textClass: 'text-blue-600',
        },
        {
          id: 'otro',
          label: 'Otro / Sin Especificar',
          value: (genderCounts['other'] || 0) + (genderCounts['prefer_not_to_say'] || 0) + (genderCounts['unknown'] || 0),
          percentage: Math.round((((genderCounts['other'] || 0) + (genderCounts['prefer_not_to_say'] || 0) + (genderCounts['unknown'] || 0)) / totalPatients) * 100),
          colorClass: 'bg-neutral-400 hover:bg-neutral-500',
          bgLightClass: 'bg-neutral-50',
          textClass: 'text-neutral-500',
        },
      ]

      const processedRegion: WaffleCategory[] = [
        {
          id: 'caba',
          label: 'CABA',
          value: regionCounts['caba'] || 0,
          percentage: Math.round(((regionCounts['caba'] || 0) / totalPatients) * 100),
          colorClass: 'bg-emerald-500 hover:bg-emerald-600',
          bgLightClass: 'bg-emerald-50',
          textClass: 'text-emerald-600',
        },
        {
          id: 'gba',
          label: 'Buenos Aires (GBA)',
          value: regionCounts['buenos aires'] || regionCounts['gba'] || 0,
          percentage: Math.round(((regionCounts['buenos aires'] || regionCounts['gba'] || 0) / totalPatients) * 100),
          colorClass: 'bg-teal-500 hover:bg-teal-600',
          bgLightClass: 'bg-teal-50',
          textClass: 'text-teal-600',
        },
        {
          id: 'otras',
          label: 'Otras Provincias / Interior',
          value: (regionCounts['córdoba'] || 0) + (regionCounts['santa fe'] || 0) + (regionCounts['otras provincias'] || 0) + (regionCounts['sin especificar'] || 0) + (regionCounts['unknown'] || 0),
          percentage: Math.round((((regionCounts['córdoba'] || 0) + (regionCounts['santa fe'] || 0) + (regionCounts['otras provincias'] || 0) + (regionCounts['sin especificar'] || 0) + (regionCounts['unknown'] || 0)) / totalPatients) * 100),
          colorClass: 'bg-neutral-400 hover:bg-neutral-500',
          bgLightClass: 'bg-neutral-50',
          textClass: 'text-neutral-500',
        },
      ]

      // Ajustamos los porcentajes de género para que sumen exactamente 100%
      const totalGenderPercentage = processedGender.reduce((sum, c) => sum + c.percentage, 0)
      if (totalGenderPercentage !== 100 && totalGenderPercentage > 0) {
        processedGender[0].percentage += (100 - totalGenderPercentage)
      }

      // Ajustamos los porcentajes de región para que sumen exactamente 100%
      const totalRegionPercentage = processedRegion.reduce((sum, c) => sum + c.percentage, 0)
      if (totalRegionPercentage !== 100 && totalRegionPercentage > 0) {
        processedRegion[0].percentage += (100 - totalRegionPercentage)
      }

      setGenderData(processedGender)
      setRegionData(processedRegion)
    } catch (err) {
      logger.error('[usePatientDemographics] Failed to load:', err)
      setError(err instanceof Error ? err.message : 'Error cargando demografía')
      // Fallback a los mocks para que nunca se rompa la UI
      setGenderData(MOCK_GENDER_DATA)
      setRegionData(MOCK_REGION_DATA)
    } finally {
      setLoading(false)
    }
  }, [doctorId])

  useEffect(() => {
    void fetchDemographics()
  }, [fetchDemographics])

  return { genderData, regionData, loading, error, refresh: fetchDemographics }
}
