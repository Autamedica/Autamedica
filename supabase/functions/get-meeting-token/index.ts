import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// For JWT generation (we use raw crypto or an available library; here using standard esm.sh/jose for robust signing)
import { SignJWT } from 'https://esm.sh/jose@4.14.4'

console.info('get-meeting-token started')

type TelemedicineSessionRow = {
  id: string
  appointment_id: string | null
  patient_id: string
  doctor_id: string
  room_id: string | null
  consultation_rooms?: Array<{ id: string; room_sid: string | null }>
}

async function enrichConsultationRoom(
  supabaseAdmin: ReturnType<typeof createClient>,
  session: Omit<TelemedicineSessionRow, 'consultation_rooms'> | null,
): Promise<TelemedicineSessionRow | null> {
  if (!session) return null

  const { data: rooms } = await supabaseAdmin
    .from('consultation_rooms')
    .select('id, room_sid')
    .eq('consultation_id', session.id)
    .order('created_at', { ascending: false })
    .limit(1)

  return {
    ...session,
    consultation_rooms: (rooms ?? []) as Array<{ id: string; room_sid: string | null }>,
  }
}

async function resolveConsultationByIdentifiers(
  supabaseAdmin: ReturnType<typeof createClient>,
  consultationId?: string,
  sessionId?: string,
  appointmentId?: string,
): Promise<TelemedicineSessionRow | null> {
  const idCandidates = [consultationId, sessionId].map((value) => value?.trim()).filter(Boolean) as string[]

  for (const candidate of idCandidates) {
    const { data } = await supabaseAdmin
      .from('telemedicine_sessions')
      .select('id, appointment_id, patient_id, doctor_id, room_id')
      .eq('id', candidate)
      .maybeSingle()

    if (data) {
      return await enrichConsultationRoom(
        supabaseAdmin,
        data as Omit<TelemedicineSessionRow, 'consultation_rooms'>,
      )
    }
  }

  const appointmentCandidate = appointmentId?.trim() || consultationId?.trim() || sessionId?.trim()
  if (!appointmentCandidate) return null

  const { data } = await supabaseAdmin
    .from('telemedicine_sessions')
    .select('id, appointment_id, patient_id, doctor_id, room_id')
    .eq('appointment_id', appointmentCandidate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return await enrichConsultationRoom(
    supabaseAdmin,
    (data as Omit<TelemedicineSessionRow, 'consultation_rooms'> | null) ?? null,
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { consultationId, sessionId, appointmentId } = await req.json()
    if (!consultationId && !sessionId && !appointmentId) {
      return new Response(JSON.stringify({ error: 'Missing consultationId/sessionId/appointmentId' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Initialize Supabase Clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    
    // 1. User client to verify token
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '')
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(authHeader.replace('Bearer ', ''))
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Admin client to enforce DB operations
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    // Fetch the consultation/session and verify user participation.
    // Supports direct session id and appointment id to avoid client-side coupling
    // to a specific identifier type.
    const consultation = await resolveConsultationByIdentifiers(
      supabaseAdmin,
      consultationId,
      sessionId,
      appointmentId,
    )

    if (!consultation) {
      return new Response(JSON.stringify({ error: 'Consultation not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Enforce participation
    const isParticipant = user.id === consultation.patient_id || user.id === consultation.doctor_id
    if (!isParticipant) {
      return new Response(JSON.stringify({ error: 'Forbidden. You are not a participant of this consultation.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const roomName = consultation.room_id || `room_${consultation.id}`
    let _roomSid = null

    // If room does not exist in consultation_rooms, create it in a transaction-like manner
    if (!consultation.consultation_rooms || consultation.consultation_rooms.length === 0) {
      const { data: newRoom, error: roomError } = await supabaseAdmin
        .from('consultation_rooms')
        .insert({
          consultation_id: consultation.id,
          room_name: roomName,
          patient_id: consultation.patient_id,
          doctor_id: consultation.doctor_id,
          status: 'active'
        })
        .select()
        .single()
      
      if (roomError) {
         return new Response(JSON.stringify({ error: 'Failed to create room record' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      _roomSid = newRoom.id // or any unique identifier from provider
      
      // Update telemedicine_session with the generated room_id if it was missing
      if (!consultation.room_id) {
          await supabaseAdmin.from('telemedicine_sessions').update({ room_id: roomName }).eq('id', consultation.id)
      }
    } else {
      _roomSid = consultation.consultation_rooms[0].room_sid || consultation.consultation_rooms[0].id
    }

    // Generate JWT for LiveKit / WebRTC
    // Note: LiveKit requires specific grants in the JWT. 
    // Example: {"video": {"room": "roomName", "roomJoin": true}}
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY')
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET')

    if (!livekitApiKey || !livekitApiSecret) {
      console.error('LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set')
       return new Response(JSON.stringify({ error: 'Server misconfiguration: missing RTC keys' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const participantName = user.user_metadata?.first_name || user.email || user.id
    const isDoctor = user.id === consultation.doctor_id

    // Update status to 'waiting' or 'in_progress'
    // Log join event
    await supabaseAdmin.from('telemedicine_session_events').insert({
      session_id: consultation.id,
      event_type: 'participant_join',
      event_data: { user_id: user.id, role: isDoctor ? 'doctor' : 'patient', name: participantName }
    })

    // Track participant
    await supabaseAdmin.from('telemedicine_room_participants').upsert({
      room_id: roomName,
      user_id: user.id,
      role: isDoctor ? 'doctor' : 'patient',
      joined_at: new Date().toISOString()
    }, { onConflict: 'room_id,user_id' })

    if (consultation.status === 'scheduled' || consultation.status === 'waiting') {
      // Check if both are now present or if this is the second person joining
      const { data: participants } = await supabaseAdmin
        .from('telemedicine_room_participants')
        .select('role')
        .eq('room_id', roomName)
      
      const hasDoctor = participants?.some(p => p.role === 'doctor')
      const hasPatient = participants?.some(p => p.role === 'patient')
      
      const nextStatus = (hasDoctor && hasPatient) ? 'in_progress' : 'waiting'
      
      await supabaseAdmin
        .from('telemedicine_sessions')
        .update({ 
          status: nextStatus,
          started_at: consultation.started_at || (nextStatus === 'in_progress' ? new Date().toISOString() : null),
          updated_at: new Date().toISOString()
        })
        .eq('id', consultation.id)
      
      if (consultation.appointment_id) {
        await supabaseAdmin
          .from('appointments')
          .update({ 
            status: nextStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', consultation.appointment_id)
      }

      // If doctor joined and was alone, notify patient
      if (isDoctor && nextStatus === 'waiting') {
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
              'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? ''
            },
            body: JSON.stringify({
              userId: consultation.patient_id,
              title: 'Médico en sala',
              body: `${participantName} ha ingresado a la videoconsulta. Ya puedes unirte.`,
              data: {
                type: 'CALL_STARTED',
                appointment_id: consultation.appointment_id || '',
                session_id: consultation.id
              }
            })
          })
        } catch (e) {
          console.error('Failed to trigger push notification:', e)
        }
      }
    }

    const token = await new SignJWT({
        video: {
          room: roomName,
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          canPublishSources: isDoctor
            ? ['camera', 'microphone', 'screen_share']
            : ['camera', 'microphone'],
        }
      })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(livekitApiKey)
      .setSubject(user.id) // Participant identity
      .setExpirationTime('2h') // Expire strict in 2 hours
      .setJti(crypto.randomUUID())
      .setClaim('name', participantName)
      .sign(new TextEncoder().encode(livekitApiSecret))

    return new Response(JSON.stringify({ 
      token, 
      roomName,
      wsUrl: Deno.env.get('LIVEKIT_URL') // LIVEKIT_URL required on edge environment
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('get-meeting-token error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
