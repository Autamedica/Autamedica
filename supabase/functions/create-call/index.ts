import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.info('Create Call function started')

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse request body
    const { doctorId: inputDoctorId, patientId: inputPatientId, appointmentId } = await req.json().catch(() => ({}))

    // Create Supabase client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Create user client to verify the auth token
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.info('Authenticated user starting call:', user.id)

    // Verify the authenticated user is a doctor and get their doctor record
    let doctorRecord = null
    if (inputDoctorId) {
      const { data, error } = await supabaseAdmin
        .from('doctors')
        .select('id, user_id, active')
        .or(`id.eq.${inputDoctorId},user_id.eq.${inputDoctorId}`)
        .maybeSingle()
      if (error) console.error('Error finding doctor by inputDoctorId:', error)
      doctorRecord = data
    }

    if (!doctorRecord) {
      const { data, error } = await supabaseAdmin
        .from('doctors')
        .select('id, user_id, active')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) console.error('Error finding doctor by user.id:', error)
      doctorRecord = data
    }

    if (!doctorRecord || doctorRecord.user_id !== user.id || doctorRecord.active !== true) {
      console.error('Doctor identity mismatch or not a doctor:', { userId: user.id, inputDoctorId, doctorRecord })
      return new Response(
        JSON.stringify({ error: 'Forbidden: authenticated user is not the specified doctor' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve patientId if not provided directly
    let resolvedPatientId = inputPatientId || null
    if (!resolvedPatientId && appointmentId) {
      const { data: appt } = await supabaseAdmin
        .from('appointments')
        .select('patient_id')
        .eq('id', appointmentId)
        .maybeSingle()
      if (appt?.patient_id) {
        resolvedPatientId = appt.patient_id
      }
    }

    // Guest appointments deliberately have patient_id = NULL. Their verified
    // appointment ID is the only permitted way to start a patient-less call.
    if (!resolvedPatientId && !appointmentId) {
      return new Response(
        JSON.stringify({
          error: 'Missing required patient or appointment: patientId or appointmentId is required'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate before reusing calls, changing appointment state or notifying a
    // patient. Admin database clients bypass RLS; authorization is mandatory.
    if (appointmentId) {
      const { data: appointment, error: appointmentError } = await supabaseAdmin
        .from('appointments')
        .select('id, doctor_id, patient_id, type, status, deleted_at')
        .eq('id', appointmentId)
        .maybeSingle()

      if (appointmentError) {
        console.error('Failed to verify appointment:', appointmentError)
        return new Response(JSON.stringify({ error: 'Appointment verification failed' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!appointment) {
        return new Response(JSON.stringify({ error: 'Appointment not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (
        appointment.doctor_id !== doctorRecord.id ||
        appointment.patient_id !== resolvedPatientId ||
        appointment.deleted_at !== null
      ) {
        return new Response(JSON.stringify({ error: 'Appointment participant mismatch' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (
        appointment.type !== 'telemedicine' ||
        !['scheduled', 'confirmed', 'in_progress', 'no_show'].includes(appointment.status)
      ) {
        return new Response(JSON.stringify({ error: 'Appointment not callable' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Verify authorization as the real doctor, not with service_role.
    // Database helper supports pharmacy guests without an auth.users account.
    const supabaseActor = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: canStartCall, error: accessError } = await supabaseActor
      .rpc('can_start_call', {
        p_doctor_id: doctorRecord.id,
        p_patient_id: resolvedPatientId,
        p_appointment_id: appointmentId || null,
      })

    if (accessError) {
      console.error('Doctor-patient access check failed:', accessError)
      return new Response(JSON.stringify({ error: 'Patient access verification failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (canStartCall !== true) {
      return new Response(JSON.stringify({ error: 'Patient access denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.info('Creating/reusing call for:', {
      doctorId: doctorRecord.id,
      patientId: resolvedPatientId,
      appointmentId
    })

    // Check if an active call already exists for this appointment to avoid duplicate key violations
    let targetCall: any = null
    let reused = false

    if (appointmentId) {
      const { data: existingCall } = await supabaseAdmin
        .from('calls')
        .select('id, room_id, doctor_id, patient_id, status, created_at, appointment_id')
        .eq('appointment_id', appointmentId)
        .not('status', 'in', '("declined","canceled","ended")')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingCall) {
        if (
          existingCall.doctor_id !== doctorRecord.id ||
          existingCall.patient_id !== resolvedPatientId
        ) {
          return new Response(JSON.stringify({ error: 'Existing call participant mismatch' }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        targetCall = existingCall
        reused = true
        if (existingCall.status === 'requested') {
          await supabaseAdmin
            .from('calls')
            .update({ status: 'ringing' })
            .eq('id', existingCall.id)
          targetCall.status = 'ringing'
        }
      }
    }

    if (!targetCall) {
      // Call create_call RPC using admin privileges
      const { data: callData, error: callError } = await supabaseAdmin
        .rpc('create_call', {
          p_doctor_id: doctorRecord.id,
          p_patient_id: resolvedPatientId,
          p_appointment_id: appointmentId || null
        })

      if (callError || !callData || !callData[0]) {
        console.error('Error creating call via RPC:', callError)
        return new Response(
          JSON.stringify({
            error: 'Failed to create call',
            details: callError?.message || 'No call returned'
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      targetCall = callData[0]
      // Set to ringing
      await supabaseAdmin
        .from('calls')
        .update({ status: 'ringing' })
        .eq('id', targetCall.id)
      targetCall.status = 'ringing'
    }

    // Transition appointment to in_progress if applicable
    if (appointmentId) {
      await supabaseAdmin
        .from('appointments')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .neq('status', 'in_progress')
    }

    // Resolve patient user_id for high-priority push notification
    let patientUserId: string | null = null
    if (resolvedPatientId) {
      const { data: patientRow } = await supabaseAdmin
        .from('patients')
        .select('user_id')
        .eq('id', resolvedPatientId)
        .maybeSingle()

      if (patientRow?.user_id) {
        patientUserId = patientRow.user_id
      } else {
        const { data: profileRow } = await supabaseAdmin
          .from('profiles')
          .select('user_id')
          .eq('user_id', resolvedPatientId)
          .maybeSingle()
        if (profileRow?.user_id) {
          patientUserId = profileRow.user_id
        }
      }
    }

    // Resolve doctor display name for notification copy
    const { data: doctorProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle()

    const doctorDisplayName = doctorProfile && (doctorProfile.first_name || doctorProfile.last_name)
      ? `Dr. ${doctorProfile.first_name || ''} ${doctorProfile.last_name || ''}`.trim()
      : 'Tu médico'

    // Send FCM push notification so patient's device rings immediately
    if (patientUserId) {
      try {
        await supabaseAdmin.functions.invoke('send-push-notification', {
          body: {
            userId: patientUserId,
            title: 'Videoconsulta iniciada',
            body: `${doctorDisplayName} te está llamando a la consulta`,
            data: {
              type: 'CALL_STARTED',
              call_id: targetCall.id,
              room_id: targetCall.room_id,
              doctor_id: doctorRecord.id,
              doctor_name: doctorDisplayName,
              appointment_id: appointmentId || '',
            }
          }
        })
        console.info('[create-call] Dispatched CALL_STARTED push notification to patient:', patientUserId)
      } catch (pushErr) {
        console.warn('[create-call] Push notification dispatch non-blocking error:', pushErr)
      }
    }

    console.info('Call ready:', { callId: targetCall.id, roomId: targetCall.room_id, reused })

    return new Response(
      JSON.stringify({
        success: true,
        call: targetCall,
        reused
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error in create-call:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
