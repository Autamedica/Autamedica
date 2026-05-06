/**
 * Service: OpenClaw webhook business logic.
 * Orchestrates repo queries and scheduling package functions.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import {
  processReminderResponse,
  processWaitlist,
  acceptWaitlistOffer,
  sendMessageWithFallback,
  DEFAULT_OPENCLAW_CONFIG,
  handleTriageMessage,
} from '@autamedica/scheduling'
import { openclawRepo } from '../repos/openclaw.repo'

type AdminClient = SupabaseClient

export interface WebhookResult {
  action: string
  reminder_id?: string
  appointment_id?: string
  waitlist_id?: string
  message?: string
}

function getOpenClawConfig() {
  return {
    ...DEFAULT_OPENCLAW_CONFIG,
    token: (globalThis.process?.env?.OPENCLAW_GATEWAY_TOKEN) ?? '',
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return `${date} a las ${time}`
}

function buildMainMenu(patientName: string): string {
  const greeting = patientName
    ? `👋 *¡Hola ${patientName}! Soy el asistente de AutaMedica.*`
    : `👋 *¡Hola! Soy el asistente de AutaMedica.*`
  return [
    greeting,
    ``,
    `Estoy acá para ayudarte. Elegí una opción:`,
    ``,
    `1️⃣ *Agendar turno* — Agendá una consulta médica`,
    `2️⃣ *Ver mis turnos* — Consultá tus turnos próximos`,
    `3️⃣ *Hablar con un asesor* — Comunicate con una persona`,
    `4️⃣ *Chequeo de salud* — Hacé un triaje gratuito por WhatsApp`,
    `5️⃣ *Anamnesis por audio* — Mandanos una nota de voz con tu motivo de consulta`,
    ``,
    `Respondé con el *número* de la opción que querés.`,
  ].join('\n')
}

function buildHealthCheckWelcome(patientName: string): string {
  return [
    `🩺 *Consultá tu salud sin salir de casa — AutaMedica*`,
    ``,
    `Hola ${patientName}, bienvenida/o.`,
    ``,
    `Te voy a hacer 7 preguntas simples para entender cómo está tu salud hoy.`,
    ``,
    `⚠️ *Importante:* Esto no reemplaza a tu médico.`,
    `Si tenés una emergencia, llamá al 107 (SAME) o andá a la guardia.`,
    ``,
    `¿Estás listo/a? Respondé:`,
    `✅ *SÍ* — para empezar`,
    `❌ *NO* — si preferís no hacerlo ahora`,
  ].join('\n')
}

async function safeSend(phone: string, message: string): Promise<void> {
  try {
    const result = await sendMessageWithFallback(getOpenClawConfig(), {
      to: phone,
      message,
      channel: 'whatsapp',
    })
    if (!result.ok) {
      logger.error('[openclaw] send failed', result.error ?? result.raw ?? 'unknown error')
    }
  } catch (err) {
    logger.error('[openclaw] send failed', err)
  }
}

export const openclawService = {
  async handleMainMenu(
    admin: AdminClient,
    phone: string,
  ): Promise<WebhookResult> {
    const patient = await openclawRepo.findPatientByPhone(admin, phone)
    safeSend(phone, buildMainMenu(patient?.name ?? ''))
    return { action: 'menu_fallback', message: 'sent' }
  },

  // ==========================================
  // MENU: Opcion 1 — Agendar turno (revision medica paga)
  // ==========================================
  async handleMenuSchedule(
    admin: AdminClient,
    phone: string,
  ): Promise<WebhookResult> {
    const patient = await openclawRepo.findPatientByPhone(admin, phone)
    const name = patient?.name ?? ''

    const greeting = name ? `Hola ${name}` : 'Hola'
    const message = [
      `📅 *Agendar una consulta médica*`,
      ``,
      `${greeting}, para agendar una consulta con un médico matriculado:`,
      ``,
      `👉 *Ingresá a:* https://autamedica.com/patients/anamnesis`,
      ``,
      `⏱️ La consulta dura *30 minutos* por videollamada.`,
      `💰 El costo es de *$15.000 ARS* (pesos argentinos).`,
      ``,
      `También podés agendar desde nuestra web: autamedica.com`,
      ``,
      `¿Necesitás ayuda? Respondé *3* para hablar con un asesor.`,
    ].join('\n')

    safeSend(phone, message)
    return { action: 'menu_schedule', message: 'sent' }
  },

  // ==========================================
  // MENU: Opcion 2 — Ver mis turnos
  // ==========================================
  async handleMenuView(
    admin: AdminClient,
    phone: string,
  ): Promise<WebhookResult> {
    const patient = await openclawRepo.findPatientByPhone(admin, phone)

    if (!patient) {
      safeSend(phone, [
        `📋 *Tus turnos*`,
        ``,
        `No encontramos tu registro. ¿Ya te registraste en AutaMedica?`,
        ``,
        `👉 Ingresá a https://autamedica.com/registro`,
      ].join('\n'))
      return { action: 'menu_view', message: 'no_patient' }
    }

    const appointments = await openclawRepo.findUpcomingAppointments(admin, patient.id)

    if (appointments.length === 0) {
      safeSend(phone, [
        `📋 *Tus turnos — ${patient.name}*`,
        ``,
        `No tenés turnos agendados por ahora.`,
        ``,
        `¿Querés agendar uno? Respondé *1*.`,
      ].join('\n'))
      return { action: 'menu_view', message: 'no_appointments' }
    }

    const lines = appointments.map((appt, i) => {
      const dt = formatDateTime(appt.start_time)
      return [
        `*${i + 1}.* ${appt.type}`,
        `   👨‍⚕️ ${appt.doctor_name}`,
        `   📅 ${dt}`,
        `   📌 ${appt.status === 'confirmed' ? '✅ Confirmado' : '⏳ Pendiente'}`,
      ].join('\n')
    })

    const message = [
      `📋 *Tus próximos turnos — ${patient.name}*`,
      ``,
      ...lines,
      ``,
      `Para cancelar un turno, respondé *CANCELO*.`,
      `Para agendar uno nuevo, respondé *1*.`,
    ].join('\n')

    safeSend(phone, message)
    return { action: 'menu_view', message: `${appointments.length} appointments` }
  },

  // ==========================================
  // MENU: Opcion 3 — Hablar con un asesor
  // ==========================================
  async handleMenuAdvisor(
    _admin: AdminClient,
    phone: string,
  ): Promise<WebhookResult> {
    const patient = await openclawRepo.findPatientByPhone(_admin, phone)
    const name = patient?.name ?? ''

    const message = [
      `🙋 *Hablar con un asesor*`,
      ``,
      name ? `${name}, ` : '',
      `Un asesor de AutaMedica te va a contactar por WhatsApp en breve.`,
      ``,
      `⏰ *Horario de atención:* Lunes a viernes de 8 a 20 hs.`,
      ``,
      `Si es una *urgencia médica*, llamá al *107 (SAME)* o andá a la guardia más cercana.`,
      ``,
      `Mientras tanto, podés:`,
      `• Responder *1* para agendar un turno`,
      `• Responder *4* para hacer un chequeo de salud gratis`,
    ].join('\n')

    safeSend(phone, message)
    return { action: 'menu_advisor', message: 'sent' }
  },

  // ==========================================
  // MENU: Opcion 4 — Chequeo de salud (GRATIS)
  // ==========================================
  async handleHealthCheck(
    admin: AdminClient,
    phone: string,
  ): Promise<WebhookResult> {
    const patient = await openclawRepo.findPatientByPhone(admin, phone)
    const name = patient?.name ?? ''

    const result = await handleTriageMessage(admin, { openclaw: getOpenClawConfig() }, phone, name || 'paciente', 'SALUD')
    if (!result.sent) {
      logger.error('[openclaw] triage welcome failed', result.error)
      safeSend(phone, buildHealthCheckWelcome(name || 'paciente'))
    }
    return { action: 'health_check', message: 'welcome sent' }
  },

  async handleAnamnesisAudioPrompt(
    _admin: AdminClient,
    phone: string,
  ): Promise<WebhookResult> {
    const message = [
      `🎙️ *Anamnesis por audio — AutaMedica*`,
      ``,
      `Mandanos una nota de voz contando, en tus palabras:`,
      ``,
      `• Qué te pasa o qué te preocupa`,
      `• Desde cuándo empezó`,
      `• Síntomas importantes`,
      `• Medicamentos que tomás`,
      `• Enfermedades previas y alergias`,
      ``,
      `Con ese audio generamos una *pre-anamnesis* para que un profesional la revise.`,
      ``,
      `⚠️ Si tenés una emergencia, llamá al *107 (SAME)* o andá a la guardia.`,
    ].join('\n')

    safeSend(phone, message)
    return { action: 'anamnesis_audio_prompt', message: 'sent' }
  },

  async handleTriageReply(
    admin: AdminClient,
    phone: string,
    message: string,
  ): Promise<WebhookResult> {
    const patient = await openclawRepo.findPatientByPhone(admin, phone)
    const name = patient?.name ?? 'paciente'
    const result = await handleTriageMessage(admin, { openclaw: getOpenClawConfig() }, phone, name, message)
    return {
      action: result.sent ? 'triage_reply' : 'triage_error',
      message: result.error ?? 'sent',
    }
  },

  // ==========================================
  // LEGACY: Confirmar/Cancelar recordatorio
  // ==========================================
  async handleConfirmOrCancel(
    admin: AdminClient,
    phone: string,
    response: 'confirmed' | 'cancelled',
  ): Promise<WebhookResult> {
    const patientId = await openclawRepo.findPatientIdByPhone(admin, phone)
    if (!patientId) {
      logger.warn(`[openclaw] No patient found for ${phone}`)
      const menu = buildMainMenu('')
      safeSend(phone, menu)
      return { action: 'no_patient_menu_sent' }
    }

    const reminder = await openclawRepo.findActiveReminderForPatient(admin, patientId)
    if (!reminder) {
      logger.warn(`[openclaw] No active reminder found for ${phone}`)
      const patient = await openclawRepo.findPatientByPhone(admin, phone)
      const menu = buildMainMenu(patient?.name ?? '')
      safeSend(phone, menu)
      return { action: 'no_reminder_menu_sent' }
    }

    await processReminderResponse(admin, reminder.id, response)

    if (response === 'cancelled' && reminder.appointment_id) {
      const slot = await openclawRepo.getAppointmentSlot(admin, reminder.appointment_id)
      if (slot) {
        await processWaitlist(admin, slot.doctor_id, {
          date: slot.start_time.split('T')[0],
          start_time: slot.start_time,
          end_time: slot.end_time,
        }).catch((err) => logger.error('[openclaw] processWaitlist failed', err))
      }
    }

    const confirmMsg = response === 'confirmed'
      ? `✅ *Turno confirmado.* Te esperamos. Cualquier cosa, respondé *MENU* para ver las opciones.`
      : `❌ *Turno cancelado.* Si querés agendar uno nuevo, respondé *1*.`

    safeSend(phone, confirmMsg)
    return { action: response, reminder_id: reminder.id }
  },

  // ==========================================
  // LEGACY: Aceptar oferta de waitlist
  // ==========================================
  async handleWaitlistAcceptance(
    admin: AdminClient,
    phone: string,
  ): Promise<WebhookResult> {
    const patientId = await openclawRepo.findPatientIdByPhone(admin, phone)
    if (!patientId) throw new Error('Patient not found for phone')

    const offer = await openclawRepo.findActiveWaitlistOffer(admin, patientId)
    if (!offer) throw new Error('No active waitlist offer found')

    const result = await acceptWaitlistOffer(admin, offer.id, {
      start_time: offer.offered_start_time ?? new Date().toISOString(),
      end_time: offer.offered_end_time ?? new Date().toISOString(),
      type: offer.appointment_type ?? undefined,
    })

    return {
      action: 'waitlist_accepted',
      appointment_id: result.appointment_id,
      waitlist_id: offer.id,
    }
  },
}
