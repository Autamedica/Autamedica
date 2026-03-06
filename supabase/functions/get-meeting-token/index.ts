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
      .select('id, appointment_id, patient_id, doctor_id, room_id, consultation_rooms(id, room_sid)')
      .eq('id', candidate)
      .maybeSingle()

    if (data) return data as TelemedicineSessionRow
  }

  const appointmentCandidate = appointmentId?.trim() || consultationId?.trim() || sessionId?.trim()
  if (!appointmentCandidate) return null

  const { data } = await supabaseAdmin
    .from('telemedicine_sessions')
    .select('id, appointment_id, patient_id, doctor_id, room_id, consultation_rooms(id, room_sid)')
    .eq('appointment_id', appointmentCandidate)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data as TelemedicineSessionRow | null) ?? null
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
