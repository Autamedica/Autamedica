import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { forbidden, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { doctorHasPatientAccess } from '@/lib/doctors/lib/resolve-room';
import { createAstroAdminClient } from '@/lib/supabase';

function getRuntimeEnv(locals: unknown): Record<string, unknown> | null {
  const runtime = (locals as { runtime?: { env?: Record<string, unknown> } } | undefined)?.runtime;
  return runtime?.env ?? null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) return unauthorized();

  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId');

  try {
    const admin = createAstroAdminClient(getRuntimeEnv(locals));
    let orderQuery = admin
      .from('dispensation_orders')
      .select('id, prescription_id, pharmacy_id, medication, status, patient_id')
      .eq('doctor_id', context.doctorId)
      .eq('status', 'clarification_requested');

    if (patientId) {
      const canAccess = await doctorHasPatientAccess(admin, context.doctorId, patientId as never);
      if (!canAccess) return forbidden('forbidden_patient_access');
      orderQuery = orderQuery.eq('patient_id', patientId);
    }

    const { data: orders, error: ordersError } = await orderQuery;

    if (ordersError) {
      logger.error('[doctors/prescriptions/clarifications] Order query failed', ordersError);
      return internalError();
    }

    if (!orders || orders.length === 0) {
      return jsonOk([]);
    }

    const orderIds = orders.map((order) => order.id);
    const pharmacyIds = [...new Set(orders.map((order) => order.pharmacy_id).filter(Boolean))];

    const [{ data: clarifications, error: clarificationsError }, { data: pharmacies, error: pharmaciesError }] = await Promise.all([
      admin
        .from('dispensation_clarifications')
        .select('id, order_id, question, question_category, requested_at, expires_at, status')
        .in('order_id', orderIds)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false }),
      pharmacyIds.length > 0
        ? admin
          .from('pharmacies')
          .select('id, name')
          .in('id', pharmacyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (clarificationsError) {
      logger.error('[doctors/prescriptions/clarifications] Clarification query failed', clarificationsError);
      return internalError();
    }

    if (pharmaciesError) {
      logger.warn('[doctors/prescriptions/clarifications] Pharmacy lookup failed', pharmaciesError);
    }

    const orderById = new Map(orders.map((order) => [order.id, order]));
    const pharmacyById = new Map((pharmacies ?? []).map((pharmacy) => [pharmacy.id, pharmacy.name]));

    const response = (clarifications ?? [])
      .map((clarification) => {
        const order = orderById.get(clarification.order_id);
        if (!order) return null;

        return {
          id: clarification.id,
          order_id: clarification.order_id,
          prescription_id: order.prescription_id,
          patient_id: order.patient_id,
          medication: order.medication,
          pharmacy_name: order.pharmacy_id ? pharmacyById.get(order.pharmacy_id) ?? null : null,
          question: clarification.question,
          question_category: clarification.question_category,
          requested_at: clarification.requested_at,
          expires_at: clarification.expires_at,
          order_status: order.status,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return jsonOk(response);
  } catch (error) {
    logger.error('[doctors/prescriptions/clarifications] GET error', error);
    return internalError();
  }
};
