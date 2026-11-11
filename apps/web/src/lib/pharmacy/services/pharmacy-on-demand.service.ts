import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import type {
  AssignedDoctorInfo,
  ClaimConsultationResult,
  CreatePharmacyRequestInput,
  DoctorOnDutyStatus,
  OnDemandQueueItem,
  PharmacyConsultationRequest,
  RequestStatusResponse,
} from '../types'

interface DoctorProfileRow {
  id: string
  user_id: string
  license_number: string
  specialty: string
  on_duty_pharmacy: boolean
  on_duty_since: string | null
  profiles?: {
    first_name: string | null
    last_name: string | null
  } | null
}

export class PharmacyOnDemandService {
  /**
   * Resolves doctor record and profile by auth user ID
   */
  async resolveDoctor(admin: SupabaseClient, doctorUserId: string): Promise<DoctorProfileRow | null> {
    const { data: doctor, error } = await admin
      .from('doctors')
      .select('id, user_id, license_number, specialty, on_duty_pharmacy, on_duty_since, profiles:user_id (first_name, last_name)')
      .eq('user_id', doctorUserId)
      .maybeSingle()

    if (error) {
      logger.error('[PharmacyOnDemandService.resolveDoctor] DB error', error)
      return null
    }

    if (!doctor) return null

    // Safe casting for nested relationship
    const raw = doctor as Record<string, unknown>
    const profile = raw.profiles as { first_name: string | null; last_name: string | null } | null

    return {
      id: String(raw.id),
      user_id: String(raw.user_id),
      license_number: String(raw.license_number || ''),
      specialty: String(raw.specialty || 'Medicina General'),
      on_duty_pharmacy: Boolean(raw.on_duty_pharmacy),
      on_duty_since: raw.on_duty_since ? String(raw.on_duty_since) : null,
      profiles: profile,
    }
  }

  /**
   * Creates a new on-demand pharmacy consultation request
   */
  async createRequest(
    admin: SupabaseClient,
    input: CreatePharmacyRequestInput,
  ): Promise<{ request: PharmacyConsultationRequest; queuePosition: number }> {
    let resolvedPharmacyName = input.pharmacyName

    if (input.pharmacyId && (!resolvedPharmacyName || resolvedPharmacyName === 'Farmacia')) {
      const { data: ph } = await admin
        .from('pharmacies')
        .select('name')
        .eq('id', input.pharmacyId)
        .maybeSingle()

      if (ph?.name) {
        resolvedPharmacyName = ph.name
      }
    }

    const { data: inserted, error: insertErr } = await admin.rpc('create_pharmacy_consultation_request', {
      p_pharmacy_id: input.pharmacyId || null,
      p_pharmacy_name: resolvedPharmacyName,
      p_patient_dni: input.patientDni.trim(),
      p_patient_name: input.patientName.trim(),
      p_patient_phone: input.patientPhone.trim(),
      p_reason: input.reason.trim(),
    })

    if (insertErr || !inserted) {
      logger.error('[PharmacyOnDemandService.createRequest] Insert failed', insertErr)
      throw new Error('failed_to_create_request')
    }

    const request = inserted as PharmacyConsultationRequest

    // Calculate queue position (count of pending items created <= this item)
    const { count } = await admin
      .from('pharmacy_consultation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('created_at', request.created_at)

    const queuePosition = Math.max(1, count || 1)

    logger.info('[PharmacyOnDemandService.createRequest] Request created', {
      requestId: request.id,
      pharmacyName: resolvedPharmacyName,
      queuePosition,
    })

    return { request, queuePosition }
  }

  /**
   * Retrieves status and real-time waiting room state for a request
   */
  async getRequestStatus(
    admin: SupabaseClient,
    requestId: string,
    siteOrigin?: string,
  ): Promise<RequestStatusResponse | null> {
    const { data: req, error } = await admin
      .from('pharmacy_consultation_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (error || !req) {
      return null
    }

    const request = req as PharmacyConsultationRequest

    let queuePosition = 0
    if (request.status === 'pending') {
      const { count } = await admin
        .from('pharmacy_consultation_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lte('created_at', request.created_at)

      queuePosition = Math.max(1, count || 1)
    }

    let doctorInfo: AssignedDoctorInfo | null = null
    if (request.doctor_id) {
      const { data: docData } = await admin
        .from('doctors')
        .select('id, user_id, license_number, specialty, profiles:user_id (first_name, last_name)')
        .eq('id', request.doctor_id)
        .maybeSingle()

      if (docData) {
        const raw = docData as Record<string, unknown>
        const profile = raw.profiles as { first_name: string | null; last_name: string | null } | null
        const docName = profile
          ? `Dr. ${[profile.first_name, profile.last_name].filter(Boolean).join(' ')}`.trim()
          : 'Médico de Guardia'

        doctorInfo = {
          id: String(raw.id),
          name: docName,
          specialty: String(raw.specialty || 'Medicina General'),
          licenseNumber: String(raw.license_number || ''),
        }
      }
    }

    let patientJoinUrl: string | null = null
    if (request.room_id && request.guest_invite_id) {
      const prefix = siteOrigin ? siteOrigin.replace(/\/$/, '') : ''
      patientJoinUrl = `${prefix}/call/join/${encodeURIComponent(request.room_id)}?invite=${encodeURIComponent(request.guest_invite_id)}`
    }

    return {
      id: request.id,
      status: request.status,
      queuePosition,
      pharmacyName: request.pharmacy_name,
      patientName: request.patient_name,
      reason: request.reason,
      roomId: request.room_id,
      guestInviteId: request.guest_invite_id,
      patientJoinUrl,
      doctor: doctorInfo,
      createdAt: request.created_at,
      assignedAt: request.assigned_at,
    }
  }

  /**
   * Cancels a pending consultation request
   */
  async cancelRequest(admin: SupabaseClient, requestId: string): Promise<boolean> {
    const { error } = await admin
      .from('pharmacy_consultation_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('status', 'pending')

    if (error) {
      logger.error('[PharmacyOnDemandService.cancelRequest] Error', error)
      return false
    }

    return true
  }

  /**
   * Gets doctor's on-duty status and waiting queue metrics
   */
  async getDoctorOnDutyStatus(admin: SupabaseClient, doctorUserId: string): Promise<DoctorOnDutyStatus | null> {
    const doctor = await this.resolveDoctor(admin, doctorUserId)
    if (!doctor) return null

    const { data: activeSession } = await admin
      .from('doctor_on_duty_sessions')
      .select('id')
      .eq('doctor_id', doctor.id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { count: queueCount } = await admin
      .from('pharmacy_consultation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    return {
      onDuty: doctor.on_duty_pharmacy,
      since: doctor.on_duty_since,
      activeSessionId: activeSession?.id ? String(activeSession.id) : null,
      waitingQueueCount: queueCount || 0,
    }
  }

  /**
   * Toggles doctor's on-duty status
   */
  async toggleDoctorOnDuty(
    admin: SupabaseClient,
    doctorUserId: string,
    onDuty: boolean,
  ): Promise<DoctorOnDutyStatus> {
    const doctor = await this.resolveDoctor(admin, doctorUserId)
    if (!doctor) {
      throw new Error('doctor_not_found')
    }

    const now = new Date().toISOString()

    // 1. Update doctor on_duty_pharmacy
    const { error: updateDocErr } = await admin
      .from('doctors')
      .update({
        on_duty_pharmacy: onDuty,
        on_duty_since: onDuty ? now : null,
      })
      .eq('id', doctor.id)

    if (updateDocErr) {
      logger.error('[PharmacyOnDemandService.toggleDoctorOnDuty] Update doc error', updateDocErr)
      throw new Error('failed_to_update_doctor_duty')
    }

    let activeSessionId: string | null = null

    if (onDuty) {
      // Close any stale active sessions first
      await admin
        .from('doctor_on_duty_sessions')
        .update({ status: 'ended', ended_at: now })
        .eq('doctor_id', doctor.id)
        .eq('status', 'active')

      // Create new session
      const { data: newSession, error: sessErr } = await admin
        .from('doctor_on_duty_sessions')
        .insert({
          doctor_id: doctor.id,
          status: 'active',
          started_at: now,
          last_heartbeat_at: now,
        })
        .select('id')
        .single()

      if (sessErr || !newSession) {
        logger.error('[PharmacyOnDemandService.toggleDoctorOnDuty] Session insert error', sessErr)
      } else {
        activeSessionId = String(newSession.id)
      }
    } else {
      // Close all active sessions
      await admin
        .from('doctor_on_duty_sessions')
        .update({ status: 'ended', ended_at: now })
        .eq('doctor_id', doctor.id)
        .eq('status', 'active')
    }

    const { count: queueCount } = await admin
      .from('pharmacy_consultation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    return {
      onDuty,
      since: onDuty ? now : null,
      activeSessionId,
      waitingQueueCount: queueCount || 0,
    }
  }

  /**
   * Retrieves pending pharmacy consultation requests for doctors on duty
   */
  async getPendingQueue(admin: SupabaseClient): Promise<OnDemandQueueItem[]> {
    const { data, error } = await admin
      .from('pharmacy_consultation_requests')
      .select('id, pharmacy_id, pharmacy_name, patient_dni, patient_name, patient_phone, reason, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('[PharmacyOnDemandService.getPendingQueue] Error fetching queue', error)
      return []
    }

    const now = Date.now()
    return (data || []).map((row) => {
      const createdTime = new Date(row.created_at).getTime()
      const diffMs = Math.max(0, now - createdTime)
      const minutesWaiting = Math.floor(diffMs / (60 * 1000))

      return {
        id: String(row.id),
        pharmacyId: row.pharmacy_id ? String(row.pharmacy_id) : null,
        pharmacyName: String(row.pharmacy_name),
        patientDni: String(row.patient_dni),
        patientName: String(row.patient_name),
        patientPhone: String(row.patient_phone),
        reason: String(row.reason),
        status: row.status,
        createdAt: String(row.created_at),
        minutesWaiting,
      }
    })
  }

  /**
   * Atomically claims a pending request, creating call and guest invite
   */
  async claimRequest(
    admin: SupabaseClient,
    doctorUserId: string,
    requestId: string,
    siteOrigin?: string,
  ): Promise<ClaimConsultationResult> {
    const doctor = await this.resolveDoctor(admin, doctorUserId)
    if (!doctor) {
      throw new Error('doctor_not_found')
    }

    // 1. Fetch request and check it's still pending
    const { data: requestData, error: reqErr } = await admin
      .from('pharmacy_consultation_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (reqErr || !requestData) {
      throw new Error('request_not_found')
    }

    const request = requestData as PharmacyConsultationRequest

    if (request.status !== 'pending') {
      throw new Error('request_already_claimed_or_closed')
    }

    // 2. Generate room ID
    const randomHex = Math.random().toString(36).substring(2, 8)
    const roomId = `room_pharm_${Date.now()}_${randomHex}`

    // 3. Create call in public.calls
    const { data: call, error: callErr } = await admin
      .from('calls')
      .insert({
        doctor_id: doctor.id,
        patient_id: null, // Guest patient from pharmacy counter
        room_id: roomId,
        status: 'requested',
      })
      .select('id, room_id')
      .single()

    if (callErr || !call) {
      logger.error('[PharmacyOnDemandService.claimRequest] Call creation failed', callErr)
      throw new Error('failed_to_create_call')
    }

    // 4. Create opaque guest invite in public.call_guest_invites
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { data: invite, error: inviteErr } = await admin
      .from('call_guest_invites')
      .insert({
        call_id: call.id,
        room_id: roomId,
        guest_name: request.patient_name,
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (inviteErr || !invite) {
      logger.error('[PharmacyOnDemandService.claimRequest] Invite creation failed', inviteErr)
      throw new Error('failed_to_create_invite')
    }

    // 5. Update consultation request atomically
    const now = new Date().toISOString()
    const { error: updateReqErr } = await admin
      .from('pharmacy_consultation_requests')
      .update({
        doctor_id: doctor.id,
        call_id: call.id,
        room_id: roomId,
        guest_invite_id: invite.id,
        status: 'assigned',
        assigned_at: now,
      })
      .eq('id', requestId)
      .eq('status', 'pending')

    if (updateReqErr) {
      logger.error('[PharmacyOnDemandService.claimRequest] Request assignment failed', updateReqErr)
      throw new Error('failed_to_assign_request')
    }

    const prefix = siteOrigin ? siteOrigin.replace(/\/$/, '') : ''
    const doctorRoomUrl = `/doctors/call/${encodeURIComponent(roomId)}`
    const patientJoinUrl = `${prefix}/call/join/${encodeURIComponent(roomId)}?invite=${encodeURIComponent(invite.id)}`

    logger.info('[PharmacyOnDemandService.claimRequest] Request claimed successfully', {
      requestId,
      doctorId: doctor.id,
      callId: call.id,
      roomId,
    })

    return {
      requestId,
      callId: String(call.id),
      roomId,
      guestInviteId: String(invite.id),
      doctorRoomUrl,
      patientJoinUrl,
      patient: {
        dni: request.patient_dni,
        name: request.patient_name,
        phone: request.patient_phone,
        reason: request.reason,
        pharmacyName: request.pharmacy_name,
      },
    }
  }

  /**
   * Completes a consultation request and generates direct prescription link
   */
  async completeRequest(
    admin: SupabaseClient,
    doctorUserId: string,
    requestId: string,
  ): Promise<{
    completed: boolean
    prescriptionUrl: string
    patientName: string
    patientDni: string
  }> {
    const doctor = await this.resolveDoctor(admin, doctorUserId)
    if (!doctor) {
      throw new Error('doctor_not_found')
    }

    const { data: req, error: reqErr } = await admin
      .from('pharmacy_consultation_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (reqErr || !req) {
      throw new Error('request_not_found')
    }

    const request = req as PharmacyConsultationRequest

    if (request.doctor_id !== doctor.id) {
      throw new Error('unauthorized_doctor')
    }

    const now = new Date().toISOString()
    await admin
      .from('pharmacy_consultation_requests')
      .update({
        status: 'completed',
        completed_at: now,
      })
      .eq('id', requestId)

    // Build URL to official digital prescription issuer pre-filling patient details
    const params = new URLSearchParams({
      patientName: request.patient_name,
      patientDni: request.patient_dni,
      reason: request.reason,
      pharmacyOrigin: request.pharmacy_name,
      source: 'pharmacy_express',
    })

    const prescriptionUrl = `/doctors/prescriptions?${params.toString()}`

    return {
      completed: true,
      prescriptionUrl,
      patientName: request.patient_name,
      patientDni: request.patient_dni,
    }
  }

  /**
   * Sends heartbeat telemetry for an on-duty doctor.
   * Invokes the public.doctor_heartbeat RPC.
   */
  async sendHeartbeat(admin: SupabaseClient, doctorUserId: string): Promise<boolean> {
    const doctor = await this.resolveDoctor(admin, doctorUserId)
    if (!doctor) {
      logger.warn('[PharmacyOnDemandService.sendHeartbeat] Doctor not found for user', { doctorUserId })
      return false
    }

    // Try with schema prefix (public.doctor_heartbeat) first per Supabase RPC rules
    let { error } = await admin.rpc('public.doctor_heartbeat' as never, {
      p_doctor_id: doctor.id,
    } as never)

    // Fallback without schema prefix if PostgREST expects bare function name
    if (error) {
      const fallback = await admin.rpc('doctor_heartbeat' as never, {
        p_doctor_id: doctor.id,
      } as never)
      if (!fallback.error) {
        error = null
      }
    }

    if (error) {
      logger.error('[PharmacyOnDemandService.sendHeartbeat] RPC error', error)
      return false
    }

    return true
  }

  /**
   * Match doctors for a dispatch request and create offers.
   * Filtra por especialidad, estado heartbeat y disponibilidad.
   * Crea dispatch_offers con expires_at a 30s.
   */
  async match_dispatch_doctors(
    admin: SupabaseClient,
    dispatchRequestId: string,
  ): Promise<{ success: boolean; offers: Array<{ id: string; doctor_id: string; expires_at: string; price_brl: number } | null> | null }> {
    const { data, error } = await admin
      .rpc('match_dispatch_doctors' as never, { p_dispatch_id: dispatchRequestId } as never)
    if (error) {
      logger.error('[PharmacyOnDemandService.match_dispatch_doctors] RPC error', error)
      return { success: false, offers: null }
    }
    // data es JSONB: { offers: [...] } o {}
    const raw = data as Record<string, unknown> | null
    const offers = (raw?.offers as Array<{ id: string; doctor_id: string; expires_at: string; price_brl: number }>) || null
    return { success: true, offers }
  }

  /**
   * Claim a dispatch offer atomically.
   * First accepted offer wins. Creates call, guest_invite, and updates request status.
   */
  async claim_dispatch_offer(
    admin: SupabaseClient,
    offerId: string,
  ): Promise<{ success: boolean; error?: string; result?: { requestId: string; callId: string; roomId: string; guestInviteId: string; doctorId: string; patientName: string; patientDni: string; priceBrl: number; assignedAt: string } }> {
    const { data, error } = await admin
      .rpc('claim_dispatch_offer' as never, { p_offer_id: offerId } as never)
    if (error) {
      logger.error('[PharmacyOnDemandService.claim_dispatch_offer] RPC error', error)
      return { success: false, error: error.message }
    }
    return { success: true, result: data as never }
  }

  /**
   * Obtener ofertas vigentes para un dispatch (útil para UI polling)
   */
  async get_dispatch_offers(admin: SupabaseClient, dispatchRequestId: string): Promise<{ success: boolean; offers: Array<{ id: string; doctor_id: string; expires_at: string; price_brl: number }> | null }> {
    const { data, error } = await admin
      .from('dispatch_offers')
      .select('id, doctor_id, expires_at, status, price_brl')
      .eq('dispatch_request_id', dispatchRequestId)
      .eq('status', 'pending')
    if (error) {
      logger.error('[PharmacyOnDemandService.get_dispatch_offers] DB error', error)
      return { success: false, offers: null }
    }
    const pendingOffers = (data as Array<{ id: string; doctor_id: string; expires_at: string; status: string; price_brl: number }>) || []
    const now = new Date()
    const validOffers = pendingOffers.filter(o => new Date(o.expires_at) > now)
    return { success: true, offers: validOffers.map(o => ({ id: o.id, doctor_id: o.doctor_id, expires_at: o.expires_at, price_brl: o.price_brl })) }
  }
}

export const pharmacyOnDemandService = new PharmacyOnDemandService()

