/**
 * Adapter: doctors table access for patient-facing queries.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { IDoctorsRepository } from '@/lib/patients/ports/doctors.port'
import type { DoctorLicensePill } from '@/components/patients/appointments/appointment-modal.types'

type Db = SupabaseClient<Database>

export interface DoctorSummary {
  id: string
  specialty: string | null
  consultation_fee: number | null
  first_name: string | null
  last_name: string | null
  has_availability: boolean
  active_plan: string | null
  label: string
  license_number: string | null
  avatar_url: string | null
  overall_score: number
  rank_position: number | null
  has_prescription_digital: boolean
  license_pills: DoctorLicensePill[]
}

interface DoctorRow {
  id: string
  specialty: string | null
  consultation_fee: number | null
  license_number: string | null
  license_type: string | null
  enrollment_jurisdiction: string | null
  uf_brazil: string | null
  signature_image_url: string | null
  stamp_image_url: string | null
  profile: {
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  } | null
  doctor_ranking_metrics: {
    overall_score: number | null
    rank_position: number | null
  } | {
    overall_score: number | null
    rank_position: number | null
  }[] | null
  doctor_licenses?: Array<{
    license_number: string
    license_type: string
    province?: string | null
    uf_brazil?: string | null
    status?: string | null
  }> | null
}

export function buildDoctorLicensePills(row: Pick<DoctorRow,
  'license_number' | 'license_type' | 'uf_brazil' | 'enrollment_jurisdiction' | 'doctor_licenses'
>, country: 'AR' | 'BR'): DoctorLicensePill[] {
  const pills: DoctorLicensePill[] = []
  const seen = new Set<string>()
  const add = (type: string | null, number: string | null, jurisdiction?: string | null) => {
    if (!number?.trim() || /^PENDING/i.test(number.trim())) return
    if (country === 'BR' && (type !== 'CRM' || !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(jurisdiction ?? ''))) return
    if (country === 'AR' && type !== 'MN' && type !== 'MP') return
    const key = `${type}:${jurisdiction ?? ''}:${number}`
    if (seen.has(key)) return
    seen.add(key)
    const suffix = jurisdiction ? ` · ${jurisdiction}` : ''
    pills.push({ country, label: `${country === 'BR' ? '🇧🇷' : '🇦🇷'} ${type} ${number}${suffix}`, jurisdiction })
  }
  add(row.license_type, row.license_number,
    country === 'BR' ? row.uf_brazil : row.enrollment_jurisdiction)
  for (const license of row.doctor_licenses ?? []) {
    if (license.status !== 'active') continue
    add(license.license_type, license.license_number,
      country === 'BR' ? license.uf_brazil : license.province)
  }
  return pills
}

export function createDoctorsAdapter(supabase: Db): IDoctorsRepository {
  return {
    async listActive(country: 'AR' | 'BR'): Promise<DoctorSummary[]> {
      const { data, error } = await supabase
        .from('doctors')
        .select(`
          id, 
          specialty, 
          consultation_fee, 
          license_number, 
          license_type,
          enrollment_jurisdiction,
          uf_brazil,
          signature_image_url, 
          stamp_image_url, 
          profile:profiles!doctors_user_id_fkey(first_name, last_name, avatar_url), 
          doctor_ranking_metrics(overall_score, rank_position),
          doctor_licenses(license_number, license_type, province, uf_brazil, status)
        `)
        .eq('active', true)
        .eq('care_country', country)

      if (error) {
        logger.error('[doctorsRepo] listActive failed', error)
        throw error
      }

      const doctorRows = (data ?? []) as unknown as DoctorRow[]
      const doctorIds = doctorRows.map((doctor) => doctor.id)

      let doctorsWithAvailability = new Set<string>()
      if (doctorIds.length > 0) {
        const { data: availabilityRows, error: availabilityError } = await supabase
          .from('doctor_availability')
          .select('doctor_id, start_time, end_time')
          .in('doctor_id', doctorIds)
          .eq('is_active', true)

        if (availabilityError) {
          logger.error('[doctorsRepo] listActive availability lookup failed', availabilityError)
          throw availabilityError
        }

        // Group availability by doctor and exclude fake 24/7 defaults
        const availByDoctor = new Map<string, Array<{ start_time: string; end_time: string }>>()
        for (const row of availabilityRows ?? []) {
          const list = availByDoctor.get(row.doctor_id) ?? []
          list.push({ start_time: row.start_time, end_time: row.end_time })
          availByDoctor.set(row.doctor_id, list)
        }

        availByDoctor.forEach((slots, doctorId) => {
          // Detect fake 24/7 preset: all slots are 00:00-23:59
          const isFakePreset = slots.length >= 7 && slots.every(
            (s) => s.start_time === '00:00:00' && s.end_time === '23:59:00',
          )
          if (!isFakePreset && slots.length > 0) {
            doctorsWithAvailability.add(doctorId)
          }
        })
      }

      // Query active subscriptions to highlight premium plans (including trial subscriptions)
      const doctorPlans = new Map<string, string>()
      if (doctorIds.length > 0) {
        const { data: subscriptionRows, error: subscriptionError } = await supabase
          .from('doctor_subscriptions')
          .select('doctor_id, plan:subscription_plans(slug)')
          .in('doctor_id', doctorIds)
          .in('status', ['active', 'trialing'])

        if (subscriptionError) {
          logger.warn('[doctorsRepo] listActive subscription lookup failed', subscriptionError)
        } else {
          for (const row of subscriptionRows ?? []) {
            const planSlug = Array.isArray(row.plan)
              ? row.plan[0]?.slug
              : row.plan?.slug;
            if (planSlug) {
              doctorPlans.set(row.doctor_id, planSlug)
            }
          }
        }
      }

      const doctors = doctorRows
        .map((row) => {
          const firstName = row.profile?.first_name ?? ''
          const lastName = row.profile?.last_name ?? ''
          const fullName = [firstName, lastName].filter(Boolean).join(' ')
          const hasAvailability = doctorsWithAvailability.has(row.id)
          const activePlan = doctorPlans.get(row.id) ?? null
          const hasPrescriptionDigital = !!(row.signature_image_url && row.stamp_image_url)
          const licensePills = buildDoctorLicensePills(row, country)

          const metrics = Array.isArray(row.doctor_ranking_metrics)
            ? row.doctor_ranking_metrics[0]
            : row.doctor_ranking_metrics

          const overallScore = metrics?.overall_score ? Number(metrics.overall_score) : 0
          const rankPosition = metrics?.rank_position ? Number(metrics.rank_position) : null

          return {
            id: row.id,
            specialty: row.specialty,
            consultation_fee: row.consultation_fee ?? null,
            first_name: row.profile?.first_name ?? null,
            last_name: row.profile?.last_name ?? null,
            has_availability: hasAvailability,
            active_plan: activePlan,
            label: fullName ? `Dr. ${fullName}` : 'Profesional disponible',
            license_number: row.license_number ?? null,
            avatar_url: row.profile?.avatar_url ?? null,
            overall_score: overallScore,
            rank_position: rankPosition,
            has_prescription_digital: hasPrescriptionDigital,
            license_pills: licensePills,
          }
        })

      return doctors
        .sort((a, b) => a.label.localeCompare(b.label, 'es'))
    },
  }
}

