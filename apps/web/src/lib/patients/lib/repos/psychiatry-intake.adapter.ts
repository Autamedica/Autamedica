import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger, toCamel, toSnake } from '@autamedica/shared'
import type {
  PsychiatryIntakePhase,
  PsychiatryIntakeRecord,
  PsychiatryIntakeSection,
  PsychiatryIntakeSectionRecord,
} from '@/lib/patients/types/psychiatry-intake'

type Db = SupabaseClient<Database>

export function createPsychiatryIntakeAdapter(supabase: Db) {
  return {
    async findByPatient(patientId: string): Promise<PsychiatryIntakeRecord | null> {
      const { data, error } = await supabase
        .from('psychiatry_intakes' as never)
        .select('*')
        .eq('patient_id', patientId)
        .is('deleted_at', null)
        .maybeSingle()

      if (error) {
        logger.error('[psychiatryIntakeRepo] findByPatient failed', error)
        throw error
      }

      return toCamel<PsychiatryIntakeRecord | null>(data)
    },

    async ensure(patientId: string): Promise<PsychiatryIntakeRecord> {
      const existing = await this.findByPatient(patientId)
      if (existing) return existing

      const { data, error } = await supabase
        .from('psychiatry_intakes' as never)
        .insert({
          patient_id: patientId,
          status: 'in_progress',
          last_phase: 'wizard_intake',
          treatment_context: 'tdah_stimulants',
        } as never)
        .select('*')
        .single()

      if (error) {
        logger.error('[psychiatryIntakeRepo] ensure insert failed', error)
        throw error
      }

      return toCamel<PsychiatryIntakeRecord>(data)
    },

    async updateMeta(
      intakeId: string,
      updates: Record<string, unknown>,
    ): Promise<PsychiatryIntakeRecord> {
      const { data, error } = await supabase
        .from('psychiatry_intakes' as never)
        .update(toSnake(updates) as never)
        .eq('id', intakeId)
        .select('*')
        .single()

      if (error) {
        logger.error('[psychiatryIntakeRepo] updateMeta failed', error)
        throw error
      }

      return toCamel<PsychiatryIntakeRecord>(data)
    },

    async updateProgress(intakeId: string, completionPercentage: number, completedSections: string[]): Promise<void> {
      const { error } = await supabase
        .from('psychiatry_intakes' as never)
        .update({
          completion_percentage: completionPercentage,
          sections_status: { completed: completedSections },
        } as never)
        .eq('id', intakeId)

      if (error) {
        logger.error('[psychiatryIntakeRepo] updateProgress failed', error)
        throw error
      }
    },

    async getSections(intakeId: string): Promise<PsychiatryIntakeSectionRecord[]> {
      const { data, error } = await supabase
        .from('psychiatry_intake_sections' as never)
        .select('*')
        .eq('intake_id', intakeId)
        .order('updated_at', { ascending: true })

      if (error) {
        logger.error('[psychiatryIntakeRepo] getSections failed', error)
        throw error
      }

      return toCamel<PsychiatryIntakeSectionRecord[]>(data ?? [])
    },

    async clearSections(intakeId: string): Promise<void> {
      const { error } = await supabase
        .from('psychiatry_intake_sections' as never)
        .delete()
        .eq('intake_id', intakeId)

      if (error) {
        logger.error('[psychiatryIntakeRepo] clearSections failed', error)
        throw error
      }
    },

    async upsertSection(
      intakeId: string,
      section: PsychiatryIntakeSection,
      phase: Exclude<PsychiatryIntakePhase, 'completed'>,
      incomingData: Record<string, unknown>,
      completed: boolean,
    ): Promise<PsychiatryIntakeSectionRecord> {
      // 1. Unificación forzada a snake_case para evitar duplicidad Camel/Snake en JSONB
      const canonicalData = toSnake(incomingData) as Record<string, unknown>

      // 2. Sanitización de Prompt Leakage (Bot greetings/noise)
      const botPatterns = [
        /hola, soy el asistente de autamedica/gi,
        /contame, ¿en qué puedo ayudarte\?/gi,
        /¿hay algo más en lo que pueda ayudarte\?/gi,
        /muchas gracias\. saldos/gi,
        /hola, soy el asistente de autamedica\. contame, ¿en qué puedo ayudarte\?/gi
      ]

      for (const key in canonicalData) {
        if (typeof canonicalData[key] === 'string') {
          let cleaned = canonicalData[key] as string
          for (const pattern of botPatterns) {
            cleaned = cleaned.replace(pattern, '').trim()
          }
          canonicalData[key] = cleaned
        }
      }

      // 3. Regla de Integridad: No-Degradación de datos (Preservación de Voz)
      // Buscamos si ya existe la sección para comparar
      const { data: existingSection } = await supabase
        .from('psychiatry_intake_sections' as never)
        .select('data')
        .eq('intake_id', intakeId)
        .eq('section', section)
        .maybeSingle()

      if (existingSection) {
        const oldData = (existingSection as { data: Record<string, unknown> }).data
        for (const key in canonicalData) {
          const newVal = canonicalData[key]
          const oldVal = oldData[key]

          // Si el valor viejo era un texto largo y el nuevo es "no", "nada" o vacío, preservamos el viejo.
          if (
            typeof oldVal === 'string' && 
            oldVal.length > 20 && 
            (newVal === 'no' || newVal === 'nada' || newVal === '' || newVal === null)
          ) {
            logger.info(`[IntakeIntegrity] Preservando dato rico en ${section}.${key} frente a sobreescritura pobre.`)
            canonicalData[key] = oldVal
          }
        }
      }

      const { data: result, error } = await supabase
        .from('psychiatry_intake_sections' as never)
        .upsert({
          intake_id: intakeId,
          section,
          phase,
          data: canonicalData,
          completed,
          completed_at: completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as never, {
          onConflict: 'intake_id,section',
        })
        .select('*')
        .single()

      if (error) {
        logger.error('[psychiatryIntakeRepo] upsertSection failed', error)
        throw error
      }

      return toCamel<PsychiatryIntakeSectionRecord>(result)
    },
  }
}
