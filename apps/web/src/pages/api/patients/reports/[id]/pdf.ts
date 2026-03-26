/**
 * API Controller: PDF download for a specific medical report.
 *
 * GET /api/patients/reports/[id]/pdf — Generates and returns PDF for the authenticated patient.
 *
 * Architecture: Capa 5 (Controller) — validates auth + ownership,
 * delegates PDF generation to pdf-report.service.ts (Capa 6),
 * delegates DB access to medical-history.repo.ts (Capa 7).
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { medicalHistoryRepo } from '@/lib/patients/lib/repos/medical-history.repo'
import { generateConsultationPdf } from '@/lib/patients/services/pdf-report.service'
import { logger } from '@autamedica/shared'

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const recordId = params.id
  if (!recordId) return jsonError('missing_id', 400)

  const context = await resolvePatientContext(request, locals)
  if (!context) return jsonError('unauthorized', 401)

  try {
    const admin = createAstroAdminClient()

    // Capa 7: Repository — fetch record scoped to this patient
    const record = await medicalHistoryRepo.findById(admin, context.patientId, recordId)
    if (!record) return jsonError('not_found', 404)

    // Resolve patient profile + demographics
    const { data: profile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', context.userId)
      .single()

    const { data: patientRow } = await admin
      .from('patients')
      .select('birth_date, gender')
      .eq('user_id', context.userId)
      .single()

    const patientName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Paciente'
    const patientAge = patientRow?.birth_date
      ? Math.floor((Date.now() - new Date(patientRow.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null

    // Resolve doctor profile if available
    let doctorInfo: { name: string; specialty: string | null; license: string | null } | null = null
    const { data: recordFull } = await admin
      .from('medical_records')
      .select('doctor_id')
      .eq('id', recordId)
      .single()

    if (recordFull?.doctor_id) {
      const { data: doctorProfile } = await admin
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', recordFull.doctor_id)
        .single()

      const { data: doctorRecord } = await admin
        .from('doctors')
        .select('specialty, license_number')
        .eq('user_id', recordFull.doctor_id)
        .single()

      if (doctorProfile) {
        doctorInfo = {
          name: [doctorProfile.first_name, doctorProfile.last_name].filter(Boolean).join(' ') || 'Profesional médico',
          specialty: doctorRecord?.specialty ?? null,
          license: doctorRecord?.license_number ?? null,
        }
      }
    }

    // Capa 6: Service — generate PDF
    const pdf = generateConsultationPdf({
      record: {
        id: record.id,
        title: record.title,
        type: record.type,
        content: record.content,
        date_recorded: record.created_at,
        created_at: record.created_at,
      },
      patient: {
        name: patientName,
        age: patientAge,
        gender: patientRow?.gender ?? null,
      },
      doctor: doctorInfo,
    })

    // Audit log
    try {
      await admin.from('audit_logs').insert({
        user_id: context.userId,
        action: 'download_medical_report_pdf',
        resource_type: 'medical_record',
        resource_id: recordId,
        details: { filename: pdf.filename },
      } as never)
    } catch {
      logger.warn('[reports/pdf] audit log insert failed')
    }

    logger.info('[reports/pdf] PDF served', { recordId, filename: pdf.filename })

    return new Response(pdf.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
        'Content-Length': String(pdf.buffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (err) {
    logger.error('[reports/pdf] generation failed', err)
    return jsonError('pdf_generation_failed', 500)
  }
}
