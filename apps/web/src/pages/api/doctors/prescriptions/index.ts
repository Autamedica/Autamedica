import type { APIRoute } from "astro";
import { badRequest, forbidden, internalError, jsonOk } from "@/lib/api-helpers";
import type { DoctorContext } from "@/lib/doctors/api/doctor-context";
import { doctorPrescriptionBackendService } from "@/lib/doctors/services/prescription.backend";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { validateBody } from "@/lib/validation";
import { DoctorPrescriptionCreateSchema } from "@/lib/zod/prescriptions";
import { logger } from "@autamedica/shared";
import { captureSentryException } from '@/lib/observability/sentry';

async function resolveAuthedDoctorContext(
  request: Request,
  locals: App.Locals,
): Promise<DoctorContext | Response> {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const admin = createAstroAdminClient(locals?.runtime?.env);
  const { data: doctor, error } = await admin
    .from("doctors")
    .select("id, active")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    logger.error("[api/doctors/prescriptions] doctor lookup failed", {
      userId: auth.user.id,
      error,
    });
    return internalError();
  }

  if (!doctor?.id || doctor.active !== true) {
    return forbidden("doctor_profile_required");
  }

  return { userId: auth.user.id, doctorId: doctor.id };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolveAuthedDoctorContext(request, locals);
  if (context instanceof Response) return context;

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
  const context = await resolveAuthedDoctorContext(request, locals);
  if (context instanceof Response) return context;

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
    if (error instanceof Error && error.message === "patient_id_required") {
      return badRequest("patient_id or external_patient is required");
    }
    if (error instanceof Error && error.message === "external_patient_identification_required") {
      return badRequest("Para pacientes sin cuenta debe informar DNI o CUIL.");
    }
    if (error instanceof Error && error.message === "external_patient_address_required") {
      return badRequest("Para pacientes sin cuenta debe informar domicilio.");
    }
    if (error instanceof Error && [
      "prescription_doctor_country_required",
      "prescription_country_mismatch",
      "external_patient_care_country_confirmation_required",
      "external_patient_country_mismatch_or_unset",
      "external_patient_registered_account_required",
      "external_patient_cpf_required",
    ].includes(error.message)) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.message === "strict_prescription_missing_required_fields") {
      return badRequest(
        "Medicación con validación reforzada: debe informar diagnóstico y dosis antes de emitir.",
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
