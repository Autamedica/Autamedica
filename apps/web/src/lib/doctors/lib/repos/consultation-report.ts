/**
 * Repository: consultation report DB queries.
 * Covers transcripts, anamnesis, anamnesis_extractions, and medical_records.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@autamedica/types'

type AdminClient = SupabaseClient

interface SectionRecord {
  section: string
  data: Json
  completed: boolean | null
  updated_at: string | null
}

export interface AnamnesisWithSections {
  id: string
  status: string
  privacy_accepted: boolean | null
}

interface ExistingRecord {
  id: string
  doctor_id: string
  content: Record<string, unknown>
}

export const consultationReportRepo = {
  async getTranscriptionText(admin: AdminClient, roomId: string): Promise<string> {
    const { data } = await admin
      .from('consultation_transcripts')
      .select('full_text, word_count')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return (data as { full_text: string; word_count: number } | null)?.full_text ?? ''
  },

  async getAnamnesis(
    admin: AdminClient,
    patientId: string,
  ): Promise<AnamnesisWithSections | null> {
    const { data } = await admin
      .from('anamnesis')
      .select('id, status, privacy_accepted')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle()

    return data as AnamnesisWithSections | null
  },

  async getAnamnesisSections(
    admin: AdminClient,
    anamnesisId: string,
  ): Promise<SectionRecord[]> {
    const { data } = await admin
      .from('anamnesis_sections')
      .select('section, data, completed, updated_at')
      .eq('anamnesis_id', anamnesisId)
      .order('updated_at', { ascending: true })

    return (data ?? []) as SectionRecord[]
  },

  async getLatestExtraction(
    admin: AdminClient,
    anamnesisId: string,
  ): Promise<Record<string, unknown> | null> {
    const { data } = await admin
      .from('anamnesis_extractions')
      .select('extraction_result')
      .eq('anamnesis_id', anamnesisId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data
      ? ((data as { extraction_result: unknown }).extraction_result as Record<string, unknown>)
      : null
  },

  async insertMedicalRecord(
    admin: AdminClient,
    record: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const { data, error } = await admin
      .from('medical_records')
      .insert(record as never)
      .select('id')
      .single()

    if (error) throw error
    return data as { id: string }
  },

  async findMedicalRecord(
    admin: AdminClient,
    recordId: string,
  ): Promise<ExistingRecord | null> {
    const { data } = await admin
      .from('medical_records')
      .select('id, doctor_id, content')
      .eq('id', recordId)
      .maybeSingle()

    return data as ExistingRecord | null
  },

  async updateMedicalRecordContent(
    admin: AdminClient,
    recordId: string,
    content: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await admin
      .from('medical_records')
      .update({ content: content as Json })
      .eq('id', recordId)

    if (error) throw error
  },
}

export type { SectionRecord }
