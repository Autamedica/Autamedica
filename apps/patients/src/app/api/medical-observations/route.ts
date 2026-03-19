import { resolvePatientContext } from '@/app/api/shared/patient-context';
import { createRouteHandlerClient } from '@autamedica/auth/server';
import { ensureServerEnv, logger } from '@autamedica/shared';
import type { Database } from '@autamedica/types';
import { NextRequest, NextResponse } from 'next/server';

type SymptomRow = Database['public']['Tables']['symptom_reports']['Row'];
type MedicationLogRow = Database['public']['Tables']['medication_logs']['Row'];
type VitalSignRow = Database['public']['Tables']['vital_signs']['Row'];
type MedicalRecordRow = Database['public']['Tables']['medical_records']['Row'];

interface DashboardAppointmentDoctor {
  first_name: string | null;
  last_name: string | null;
  specialty: string | null;
}

type DashboardAppointmentRow = Database['public']['Tables']['appointments']['Row'] & {
  doctor: DashboardAppointmentDoctor | null;
};

function toActiveMedication(record: MedicalRecordRow) {
  const content = typeof record.content === 'object' && record.content !== null
    ? (record.content as Record<string, unknown>)
    : {};

  const dosage = typeof content.dosage === 'string' ? content.dosage : 'No especificado';
  const frequency = typeof content.frequency === 'string'
    ? content.frequency
    : 'Según indicación médica';
  const status = typeof content.status === 'string' ? content.status : 'active';

  return {
    id: record.id,
    name: record.title,
    dosage,
    frequency,
    status,
    start_date: record.created_at,
    notes: typeof content.notes === 'string' ? content.notes : null,
  };
}

export async function GET() {
  try {
    const supabase = await createRouteHandlerClient();
    const context = await resolvePatientContext(supabase);
    if (!context) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    const [symptomsResult, medicationLogsResult, vitalSignsResult, appointmentsResult, prescriptionsResult] =
      await Promise.all([
        supabase
          .from('symptom_reports')
          .select('*')
          .eq('patient_id', context.patientId)
          .is('deleted_at', null)
          .order('reported_at', { ascending: false })
          .limit(10),
        supabase
          .from('medication_logs')
          .select('*')
          .eq('patient_id', context.patientId)
          .is('deleted_at', null)
          .order('taken_at', { ascending: false })
          .limit(30),
        supabase
          .from('vital_signs')
          .select('*')
          .eq('patient_id', context.patientId)
          .is('deleted_at', null)
          .order('measured_at', { ascending: false })
          .limit(10),
        supabase
          .from('appointments')
          .select(`
            *,
            doctor:doctors(
              first_name,
              last_name,
              specialty
            )
          `)
          .eq('patient_id', context.patientId)
          .gte('start_time', nowIso)
          .in('status', ['scheduled', 'confirmed', 'in_progress'])
          .order('start_time', { ascending: true })
          .limit(5),
        supabase
          .from('medical_records')
          .select('*')
          .eq('patient_id', context.patientId)
          .eq('type', 'prescription')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

    if (symptomsResult.error) throw symptomsResult.error;
    if (medicationLogsResult.error) throw medicationLogsResult.error;
    if (vitalSignsResult.error) throw vitalSignsResult.error;
    if (appointmentsResult.error) throw appointmentsResult.error;
    if (prescriptionsResult.error) throw prescriptionsResult.error;

    const activeMedications = (prescriptionsResult.data ?? [])
      .map(toActiveMedication)
      .filter((record) => record.status === 'active');

    return NextResponse.json({
      success: true,
      data: {
        symptoms: (symptomsResult.data ?? []) as SymptomRow[],
        medicationLogs: (medicationLogsResult.data ?? []) as MedicationLogRow[],
        vitalSigns: (vitalSignsResult.data ?? []) as VitalSignRow[],
        upcomingAppointments: (appointmentsResult.data ?? []) as DashboardAppointmentRow[],
        activeMedications,
      },
    });
  } catch (error) {
    logger.error('[GET /api/medical-observations] Error', error);
    return NextResponse.json(
      { error: 'Error al obtener observaciones médicas' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const context = await resolvePatientContext(supabase);

    if (!context) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.access_token) {
      return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
    }

    const response = await fetch(
      `${ensureServerEnv('SUPABASE_URL')}/functions/v1/ingest-patient-observation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ensureServerEnv('SUPABASE_ANON_KEY'),
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      },
    );

    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    logger.error('[POST /api/medical-observations] Error', error);
    return NextResponse.json(
      { error: 'Error al registrar observación médica' },
      { status: 500 },
    );
  }
}
