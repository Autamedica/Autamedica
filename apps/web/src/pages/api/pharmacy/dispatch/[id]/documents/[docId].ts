import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/api-helpers'
import { isMedicalCertificatePubliclyVerifiable } from '@/lib/doctors/services/medical-certificate-verification'
import { certificateSha256 } from '@/lib/doctors/services/certificate-electronic-assets'
import { logger } from '@autamedica/shared'

function safeExternalDocumentUrl(value: unknown, allowed: RegExp): string | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || !allowed.test(parsed.hostname)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function findMemedDocumentUrl(value: unknown, depth = 0): string | null {
  if (depth > 5 || !value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMemedDocumentUrl(item, depth + 1)
      if (found) return found
    }
    return null
  }
  const object = value as Record<string, unknown>
  for (const [key, nested] of Object.entries(object)) {
    if (/(url|link|pdf|document)/i.test(key) && typeof nested === 'string') {
      const safe = safeExternalDocumentUrl(nested, /(^|[.])memed[.]com(?:[.]br)?$/i)
      if (safe) return safe
    }
  }
  for (const nested of Object.values(object)) {
    const found = findMemedDocumentUrl(nested, depth + 1)
    if (found) return found
  }
  return null
}

/** Guest-token/session scoped PDF delivery for a pharmacy dispatch encounter. */
export const GET: APIRoute = async ({ params, request, locals }) => {
  const dispatchId = params.id?.trim()
  const docId = params.docId?.trim()
  if (!dispatchId || !docId) return badRequest('document_id_required')
  const match = /^(memed|core|certificate)-([0-9a-f-]{36})$/i.exec(docId)
  if (!match) return badRequest('invalid_document_id')
  const [, kind, recordId] = match

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: dispatch, error: dispatchError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id,patient_id,assigned_doctor_id,requested_by_user_id,cloudflare_room_id,status,call_started_at,created_at')
      .eq('id', dispatchId)
      .maybeSingle()
    if (dispatchError) return internalError()
    if (!dispatch?.patient_id || !dispatch.assigned_doctor_id
      || !['in_call', 'completed'].includes(String(dispatch.status))) return notFound('document_not_found')

    const url = new URL(request.url)
    const queryToken = url.searchParams.get('token')?.trim() || ''
    const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
    const headerToken = request.headers.get('x-guest-token')?.trim() || authHeader
    const token = queryToken || headerToken
    let authorized = false
    if (token) {
      const secret = resolveGuestSecret(locals.runtime?.env)
      if (secret) {
        const guest = await verifyGuestToken(token, secret)
        authorized = Boolean(guest && guest.callId === dispatch.id && guest.roomId === dispatch.cloudflare_room_id)
      }
    }
    if (!authorized) {
      const patientContext = await resolvePatientContext(request, locals).catch(() => null)
      authorized = Boolean(patientContext && patientContext.patientId === dispatch.patient_id)
    }
    if (!authorized) return unauthorized()

    const createdAfter = String(dispatch.call_started_at ?? dispatch.created_at)
    if (kind === 'memed') {
      const { data: row, error } = await admin.from('memed_prescriptions')
        .select('id,patient_id,doctor_id,memed_id,status,digital_link_data,created_at')
        .eq('id', recordId).eq('patient_id', dispatch.patient_id)
        .eq('doctor_id', dispatch.assigned_doctor_id).maybeSingle()
      if (error) return internalError()
      if (!row || row.status === 'deleted' || new Date(row.created_at).getTime() < new Date(createdAfter).getTime()) {
        return notFound('document_not_found')
      }
      const link = findMemedDocumentUrl(row.digital_link_data)
      if (!link) return notFound('memed_document_link_unavailable')
      return new Response(null, {
        status: 302,
        headers: { Location: link, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
      })
    }

    if (kind === 'core') {
      const { data: row, error } = await admin.from('prescriptions')
        .select('id,patient_id,doctor_id,status,cuir,signature_method,created_at')
        .eq('id', recordId).eq('patient_id', dispatch.patient_id)
        .eq('doctor_id', dispatch.assigned_doctor_id).maybeSingle()
      if (error) return internalError()
      if (row?.status !== 'active' || !row.cuir
        || row.signature_method !== 'ac_external'
        || new Date(row.created_at).getTime() < new Date(createdAfter).getTime()) {
        return notFound('document_not_found')
      }

      // Match the clinical prescription PDF endpoint: guest delivery requires
      // the actual PAdES audit evidence and verified document hash, never a
      // long-lived Supabase signed URL from the database row.
      const [{ data: signatureEvent, error: signatureError }, { data: issueEvent, error: issueError }] = await Promise.all([
        admin.from('prescription_audit_events').select('signature_hash,metadata')
          .eq('prescription_id', recordId).eq('event_type', 'ACT_DIGITAL_SIGNATURE')
          .order('timestamp', { ascending: false }).limit(1).maybeSingle(),
        admin.from('prescription_audit_events').select('signature_hash,metadata')
          .eq('prescription_id', recordId).eq('event_type', 'issued')
          .order('timestamp', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (signatureError || issueError) return internalError()
      const signatureMeta = signatureEvent?.metadata as Record<string, unknown> | null
      const issueMeta = issueEvent?.metadata as Record<string, unknown> | null
      const hash = signatureEvent?.signature_hash
      const path = String(issueMeta?.pdfPath ?? '')
      if (!hash || issueMeta?.signature_hash !== hash
        || signatureMeta?.method !== 'PAdES_AC_EXTERNAL'
        || signatureMeta?.document_hash !== hash
        || !path.startsWith(`prescriptions/${row.cuir}/`) || !path.endsWith('.pdf')) {
        return forbidden('prescription_signature_evidence_invalid')
      }
      const { data: pdf, error: downloadError } = await admin.storage.from('medical-documents').download(path)
      if (downloadError || !pdf) return notFound('signed_pdf_missing')
      const pdfBytes = new Uint8Array(await pdf.arrayBuffer())
      const actualHash = await certificateSha256(pdfBytes)
      if (actualHash !== hash) return forbidden('prescription_pdf_integrity_mismatch')
      return new Response(Uint8Array.from(pdfBytes).buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="receita-${recordId}.pdf"`,
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }

    const { data: certificate, error } = await admin.from('medical_certificates')
      .select('*').eq('id', recordId).eq('patient_id', dispatch.patient_id)
      .eq('doctor_id', dispatch.assigned_doctor_id).maybeSingle()
    if (error) return internalError()
    if (certificate?.status !== 'signed'
      || new Date(certificate.created_at).getTime() < new Date(createdAfter).getTime()) {
      return notFound('document_not_found')
    }
    if (!isMedicalCertificatePubliclyVerifiable(certificate as unknown as Parameters<typeof isMedicalCertificatePubliclyVerifiable>[0])) {
      return forbidden('certificate_signature_unverified')
    }
    const evidence = certificate as typeof certificate & { signature_hash?: string | null; signature_method?: string | null }
    const hash = evidence.signature_hash
    const path = evidence.signature_method === 'electronic_verified'
      ? `certificates/electronic/${recordId}/${hash}.pdf`
      : `certificates/signed/${recordId}.pdf`
    if (!hash || certificate.signed_pdf_url !== path) return forbidden('certificate_pdf_path_invalid')
    const { data, error: downloadError } = await admin.storage.from('medical-documents').download(path)
    if (downloadError || !data) return notFound('document_pdf_unavailable')
    const pdf = new Uint8Array(await data.arrayBuffer())
    if (await certificateSha256(pdf) !== hash) return forbidden('signed_document_integrity_mismatch')
    return new Response(Uint8Array.from(pdf).buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="atestado-${recordId}.pdf"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    logger.error('[pharmacy/dispatch/documents] delivery failed', {
      dispatchId, documentKind: kind,
      errorName: error instanceof Error ? error.name : typeof error,
    })
    return internalError('document_delivery_failed')
  }
}
