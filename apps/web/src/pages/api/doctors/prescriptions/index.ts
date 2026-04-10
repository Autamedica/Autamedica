import type { APIRoute } from "astro";
import { badRequest, forbidden, internalError, jsonOk, unauthorized } from "@/lib/api-helpers";
import { resolveDoctorContext } from "@/lib/doctors/api/doctor-context";
import { doctorPrescriptionBackendService } from "@/lib/doctors/services/prescription.backend";
import { createAstroAdminClient } from "@/lib/supabase";
import { validateBody } from "@/lib/validation";
import { DoctorPrescriptionCreateSchema } from "@/lib/zod/prescriptions";
import { logger } from "@autamedica/shared";
import { captureSentryException } from '@/lib/observability/sentry';

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) return unauthorized();

  const url = new URL(request.url);
  const patientId = url.searchParams.get("patientId");
  if (!patientId) return badRequest("patientId is required");

  try {
    const admin = createAstroAdminClient(locals?.runtime?.env);
    const prescriptions = await doctorPrescriptionBackendService.listByPatient(
      admin,
      context,
      patientId as never,
      {
        medication_name: url.searchParams.get("medicationName") ?? undefined,
        status: (url.searchParams.get("status") ?? undefined) as never,
        active_only: url.searchParams.get("activeOnly") === "true",
      },
    );

    return jsonOk(prescriptions);
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden_patient_access") {
      return forbidden("forbidden_patient_access");
    }
    captureSentryException(error, {
      runtimeEnv: locals.runtime?.env,
      layer: 'controller',
      surface: 'api/doctors/prescriptions:GET',
      owner: 'Clinical Core',
      context: {
        doctorId: context.doctorId,
        patientId,
      },
      tags: {
        route: '/api/doctors/prescriptions',
        method: 'GET',
      },
    });
    logger.error("[api/doctors/prescriptions] GET error", error);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) return unauthorized();

  try {
    const body = await request.json();
    const validated = validateBody(DoctorPrescriptionCreateSchema, body);
    if (validated.success === false) return validated.error;

    const admin = createAstroAdminClient(locals?.runtime?.env);
    const created = await doctorPrescriptionBackendService.create(
      admin,
      context,
      validated.data as never,
    );
    return jsonOk(created, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden_patient_access") {
      return forbidden("forbidden_patient_access");
    }
    if (error instanceof Error && error.message === "strict_prescription_missing_required_fields") {
      return badRequest(
        "Para metilfenidato o lisdexanfetamina debe informar diagnostico y dosis antes de guardar el borrador clinico.",
      );
    }
    captureSentryException(error, {
      runtimeEnv: locals.runtime?.env,
      layer: 'controller',
      surface: 'api/doctors/prescriptions:POST',
      owner: 'Clinical Core',
      context: {
        doctorId: context.doctorId,
      },
      tags: {
        route: '/api/doctors/prescriptions',
        method: 'POST',
      },
    });
    logger.error("[api/doctors/prescriptions] POST error", error);
    return internalError();
  }
};
