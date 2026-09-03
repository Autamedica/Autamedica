import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { domainEvents, logger, getServerEnvOrDefault } from '@autamedica/shared'
import { buildFollowup48h } from '@autamedica/scheduling'

type Db = SupabaseClient<Database>

export interface ScheduleFollowupInput {
  callId?: string
  appointmentId?: string
  doctorId?: string
  patientId?: string
  patientPhone?: string
  patientName?: string
  doctorName?: string
  lang?: 'es' | 'pt-br'
  delayHours?: number
  scheduledFor?: string
  immediate?: boolean
  dryRun?: boolean
}

export interface FollowupScheduleResult {
  ok: boolean
  followupId?: string
  appointmentId?: string | null
  callId?: string | null
  patientPhone?: string
  patientName?: string
  doctorName?: string
  message?: string
  scheduledFor?: string
  status?: string
  dedupeKey?: string
  webhookSent?: boolean
  alreadySent?: boolean
  error?: string
}

export const followupScheduleService = {
  async schedule48hFollowup(admin: Db, input: ScheduleFollowupInput): Promise<FollowupScheduleResult> {
    try {
      const callId = input.callId?.trim() || null
      let appointmentId = input.appointmentId?.trim() || null
      let doctorId = input.doctorId?.trim() || null
      let patientId = input.patientId?.trim() || null
      let roomId: string | null = null
      let durationSeconds: number | undefined

      // 1. Resolve call details if callId is provided
      if (callId) {
        const { data: call, error: callError } = await admin
          .from('calls')
          .select('id, room_id, doctor_id, patient_id, appointment_id, status, created_at, accepted_at, ended_at')
          .eq('id', callId)
          .maybeSingle()

        if (callError) {
          logger.warn('[followupScheduleService] call lookup error', { callId, error: callError })
        }

        if (call) {
          doctorId = doctorId || call.doctor_id
          patientId = patientId || call.patient_id
          appointmentId = appointmentId || call.appointment_id
          roomId = call.room_id
          const startMs = call.accepted_at ? Date.parse(call.accepted_at) : (call.created_at ? Date.parse(call.created_at) : NaN)
          const endMs = call.ended_at ? Date.parse(call.ended_at) : Date.now()
          if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
            durationSeconds = Math.max(0, Math.round((endMs - startMs) / 1000))
          }
        }
      }

      // 2. Resolve appointment details if appointmentId is provided
      if (appointmentId && (!doctorId || !patientId)) {
        const { data: appt, error: apptError } = await admin
          .from('appointments')
          .select('id, doctor_id, patient_id, status, start_time, end_time')
          .eq('id', appointmentId)
          .maybeSingle()

        if (apptError) {
          logger.warn('[followupScheduleService] appointment lookup error', { appointmentId, error: apptError })
        }

        if (appt) {
          doctorId = doctorId || appt.doctor_id
          patientId = patientId || appt.patient_id
        }
      }

      if (!patientId || !doctorId) {
        logger.warn('[followupScheduleService] Missing patientId or doctorId', { callId, appointmentId, patientId, doctorId })
        return { ok: false, error: 'missing_patient_or_doctor' }
      }

      // 3. Resolve Patient Info (Phone, Name, Language)
      let patientPhone = input.patientPhone?.trim() || ''
      let patientName = input.patientName?.trim() || ''
      let locale = input.lang || ''

      const { data: patient } = await admin
        .from('patients')
        .select('id, user_id')
        .eq('id', patientId)
        .maybeSingle()

      if (patient?.user_id) {
        const { data: profile } = await admin
          .from('profiles')
          .select('first_name, last_name, phone')
          .eq('user_id', patient.user_id)
          .maybeSingle()

        if (profile) {
          if (!patientPhone && profile.phone) patientPhone = profile.phone
          if (!patientName && profile.first_name) {
            patientName = profile.first_name.trim()
          }
        }
      }

      patientName = patientName || 'Paciente'

      // 4. Resolve Doctor Info
      let doctorName = input.doctorName?.trim() || ''
      if (!doctorName) {
        const { data: doctor } = await admin
          .from('doctors')
          .select('id, user_id')
          .eq('id', doctorId)
          .maybeSingle()

        if (doctor?.user_id) {
          const { data: doctorProfile } = await admin
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', doctor.user_id)
            .maybeSingle()

          if (doctorProfile) {
            doctorName = [doctorProfile.first_name, doctorProfile.last_name].filter(Boolean).join(' ').trim() || 'Médico'
          }
        }
      }
      doctorName = doctorName || 'Médico'

      // 5. Determine Language (PT-BR vs ES-LATAM) and Validate Phone
      const cleanPhoneDigits = patientPhone.replace(/[^\d]/g, '')
      if (!cleanPhoneDigits || cleanPhoneDigits.length < 8) {
        logger.warn('[followupScheduleService] Missing or invalid patient phone for followup', {
          patientPhone,
          patientId,
          callId,
        })
        return { ok: false, error: 'invalid_or_missing_phone' }
      }

      const isBrazilianPhone = cleanPhoneDigits.startsWith('55') && cleanPhoneDigits.length >= 10
      const isPtLocale = String(locale).toLowerCase().startsWith('pt') || String(locale).toLowerCase() === 'br'
      const lang: 'es' | 'pt-br' = (input.lang === 'pt-br' || isBrazilianPhone || isPtLocale) ? 'pt-br' : 'es'

      // 6. Build Eduardo Line 4 follow-up message
      const message = buildFollowup48h({
        patientName,
        doctorName,
        lang,
      })

      // 7. Calculate scheduled_for
      const delayHours = typeof input.delayHours === 'number' ? input.delayHours : 48
      const scheduledFor = input.scheduledFor || new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString()
      const dedupeKey = callId
        ? `followup_48h:call:${callId}`
        : appointmentId
          ? `followup_48h:appt:${appointmentId}`
          : `followup_48h:pat:${patientId}:${new Date().toISOString().slice(0, 10)}`

      logger.info('[followupScheduleService] Scheduling 48h followup', {
        callId,
        appointmentId,
        patientPhone,
        patientName,
        doctorName,
        lang,
        scheduledFor,
        dedupeKey,
      })

      // 8. Insert into public.appointment_followups queue table (Idempotent guard)
      let followupId: string | undefined
      let insertedStatus = 'pending'

      if (!input.dryRun) {
        try {
          const { data: existing } = await (admin as unknown as {
            from: (tbl: string) => {
              select: (cols: string) => {
                eq: (col: string, val: unknown) => {
                  maybeSingle: () => Promise<{ data: { id: string; status: string } | null }>
                }
              }
            }
          })
            .from('appointment_followups')
            .select('id, status')
            .eq('dedupe_key', dedupeKey)
            .maybeSingle()

          if (existing?.status === 'sent') {
            logger.info('[followupScheduleService] Followup already sent, skipping duplicate', { dedupeKey, id: existing.id })
            return {
              ok: true,
              callId,
              appointmentId,
              followupId: existing.id,
              scheduledFor,
              message,
              dedupeKey,
              webhookSent: false,
              alreadySent: true,
            }
          }

          const { data: inserted, error: insertError } = await (admin as unknown as {
            from: (tbl: string) => {
              upsert: (record: unknown, opts: unknown) => {
                select: (cols: string) => {
                  maybeSingle: () => Promise<{ data: { id: string; status: string } | null; error: unknown }>
                }
              }
            }
          })
            .from('appointment_followups')
            .upsert({
              appointment_id: appointmentId,
              call_id: callId,
              patient_id: patientId,
              doctor_id: doctorId,
              recipient_phone: patientPhone,
              patient_name: patientName,
              doctor_name: doctorName,
              channel: 'whatsapp',
              event_type: 'appointment.followup_48h',
              message,
              scheduled_for: scheduledFor,
              status: 'pending',
              dedupe_key: dedupeKey,
              metadata: {
                lang,
                roomId,
                durationSeconds,
              },
            }, { onConflict: 'dedupe_key' })
            .select('id, status')
            .maybeSingle()

          if (insertError) {
            logger.error('[followupScheduleService] appointment_followups upsert error', insertError)
          } else if (inserted) {
            followupId = inserted.id
            insertedStatus = inserted.status
          }
        } catch (tableErr) {
          logger.warn('[followupScheduleService] appointment_followups table write failed, falling back to outbox log', tableErr)
        }
      }

      // 9. If immediate execution or webhook requested, dispatch to OpenClaw relay
      let webhookSent = false
      if (input.immediate && !input.dryRun && patientPhone) {
        const relayUrl = getServerEnvOrDefault('OPENCLAW_EVENT_RELAY_URL', 'https://openclaw-relay.autamedica.com') ?? 'https://openclaw-relay.autamedica.com'
        const apiKey = getServerEnvOrDefault('OPENCLAW_EVENT_RELAY_API_KEY')
        if (apiKey) {
          try {
            const res = await fetch(`${relayUrl}/send`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'user-agent': 'AutaMedica-Web/1.0',
              },
              body: JSON.stringify({
                event: 'appointment.followup_48h',
                channel: 'whatsapp',
                accountId: 'autamedica',
                to: patientPhone,
                message,
                patientName,
                doctorName,
                lang,
                data: {
                  callId,
                  appointmentId,
                  patientId,
                  doctorId,
                  scheduledFor,
                },
              }),
            })
            if (res.ok) {
              webhookSent = true
              logger.info('[followupScheduleService] Immediate followup dispatched via OpenClaw relay', { to: patientPhone })
              if (followupId) {
                await (admin as unknown as {
                  from: (tbl: string) => {
                    update: (patch: unknown) => {
                      eq: (col: string, val: unknown) => Promise<unknown>
                    }
                  }
                })
                  .from('appointment_followups')
                  .update({ status: 'sent', sent_at: new Date().toISOString() })
                  .eq('id', followupId)
              }
            } else {
              logger.error('[followupScheduleService] OpenClaw relay send failed', { status: res.status, text: await res.text().catch(() => '') })
            }
          } catch (fetchErr) {
            logger.error('[followupScheduleService] Error posting to OpenClaw relay', fetchErr)
          }
        }
      }

      // 10. Emit domain event for multi-agent observability and telemetry
      try {
        await domainEvents.emit('appointment.followup_48h', {
          appointmentId: appointmentId || undefined,
          callId: callId || undefined,
          doctorId,
          patientId,
          patientName,
          doctorName,
          patientPhone,
          scheduledFor,
          message,
          lang,
        })
      } catch (err) {
        logger.warn('[followupScheduleService] domainEvents emit failed', err)
      }

      return {
        ok: true,
        followupId,
        appointmentId,
        callId,
        patientPhone,
        patientName,
        doctorName,
        message,
        scheduledFor,
        status: insertedStatus,
        dedupeKey,
        webhookSent,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      logger.error('[followupScheduleService] Failed to schedule followup', error)
      return { ok: false, error: msg }
    }
  },
}
