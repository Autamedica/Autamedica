/**
 * Port: Alerts Repository
 *
 * Interfaz abstracta para acceso a alertas de pacientes.
 * La implementación concreta (Supabase adapter) vive en apps/web.
 * Tests pueden usar mock adapters.
 */

import type { Database } from '../supabase/database.types'

export type AlertEntity = Database['public']['Tables']['patient_alerts']['Row']

export interface IAlertsRepository {
  getForPatients(patientIds: string[]): Promise<AlertEntity[]>
}
