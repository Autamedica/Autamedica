import type { CreateAppointmentInput } from '@/lib/patients/types/appointment'

export interface DoctorLicensePill {
  country: 'AR' | 'BR' | 'UY'
  label: string
  jurisdiction?: string | null
}

export interface DoctorOption {
  id: string
  specialty: string | null
  consultation_fee: number | null
  first_name: string | null
  last_name: string | null
  has_availability?: boolean
  active_plan?: string | null
  label: string
  license_number?: string | null
  avatar_url?: string | null
  overall_score?: number
  rank_position?: number | null
  has_prescription_digital?: boolean
  license_pills?: DoctorLicensePill[]
}

export interface SlotData {
  doctor_id: string
  date: string
  start_time: string
  end_time: string
  duration_minutes: number
  location: string | null
  is_available: boolean
}

export interface CreateAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateAppointmentInput) => Promise<void>
}
