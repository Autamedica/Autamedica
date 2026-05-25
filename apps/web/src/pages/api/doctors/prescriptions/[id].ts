import type { APIRoute } from "astro";
import {
  badRequest,
  forbidden,
  internalError,
  jsonOk,
  notFound,
} from "@/lib/api-helpers";
import type { DoctorContext } from "@/lib/doctors/api/doctor-context";
import { doctorPrescriptionBackendService } from "@/lib/doctors/services/prescription.backend";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { validateBody } from "@/lib/validation";
import { DoctorPrescriptionUpdateSchema } from "@/lib/zod/prescriptions";
import { logger } from "@autamedica/shared";

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
    logger.error("[api/doctors/prescriptions/[id]] doctor lookup failed", {
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

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest("missing_prescription_id");

  const context = await resolveAuthedDoctorContext(request, locals);
  if (context instanceof Response) return context;

  try {
    const body = await request.json();
    const validated = validateBody(DoctorPrescriptionUpdateSchema, body);
    if (validated.success === false) return validated.error;

    const admin = createAstroAdminClient(locals?.runtime?.env);
    const updated = await doctorPrescriptionBackendService.update(
      admin,
      context,
      prescriptionId as never,
      validated.data as never,
    );

    if (!updated) return notFound("prescription_not_found");
    return jsonOk(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden_patient_access") {
      return forbidden("forbidden_patient_access");
    }
    if (error instanceof Error && error.message === "forbidden_prescription_update") {
      return forbidden("forbidden_prescription_update");
    }
    if (error instanceof Error && error.message === "strict_prescription_missing_required_fields") {
      return badRequest(
        "Medicación con validación reforzada: debe informar diagnóstico y dosis antes de emitir.",
      );
    }

    logger.error("[api/doctors/prescriptions/[id]] PATCH error", { prescriptionId, error });
    return internalError();
  }
};
