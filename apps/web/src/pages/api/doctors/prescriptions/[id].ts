import type { APIRoute } from "astro";
import {
  badRequest,
  forbidden,
  internalError,
  jsonOk,
  notFound,
  unauthorized,
} from "@/lib/api-helpers";
import { resolveDoctorContext } from "@/lib/doctors/api/doctor-context";
import { doctorPrescriptionBackendService } from "@/lib/doctors/services/prescription.backend";
import { createAstroAdminClient } from "@/lib/supabase";
import { validateBody } from "@/lib/validation";
import { DoctorPrescriptionUpdateSchema } from "@/lib/zod/prescriptions";
import { logger } from "@autamedica/shared";

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest("missing_prescription_id");

  const context = await resolveDoctorContext(request, locals);
  if (!context) return unauthorized();

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
        "Para metilfenidato o lisdexanfetamina debe informar diagnostico y dosis antes de guardar el borrador clinico.",
      );
    }

    logger.error("[api/doctors/prescriptions/[id]] PATCH error", { prescriptionId, error });
    return internalError();
  }
};
