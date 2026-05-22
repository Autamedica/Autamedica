import type { APIRoute } from "astro";
import { badRequest, internalError, jsonOk, unauthorized } from "@/lib/api-helpers";
import { resolveDoctorContext } from "@/lib/doctors/api/doctor-context";
import { generatePatientCareGuide } from "@/lib/prescriptions/prescription-enrichment.service";
import { logger } from "@autamedica/shared";
import { captureSentryException } from '@/lib/observability/sentry';

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) return unauthorized();

  try {
    const body = await request.json();
    const { medicationName, dosage, instructions, diagnosis, patientName } = body;

    if (!medicationName || typeof medicationName !== "string" || !medicationName.trim()) {
      return badRequest("medicationName is required and must be a non-empty string");
    }

    const careGuide = await generatePatientCareGuide({
      medicationName: medicationName.trim(),
      dosage: dosage?.trim(),
      instructions: instructions?.trim(),
      diagnosis: diagnosis?.trim(),
      patientName: patientName?.trim(),
    });

    return jsonOk(careGuide);
  } catch (error) {
    captureSentryException(error, {
      runtimeEnv: locals.runtime?.env,
      layer: 'controller',
      surface: 'api/doctors/prescriptions/suggest-care-guide:POST',
      owner: 'Clinical Core',
      context: {
        doctorId: context.doctorId,
      },
      tags: {
        route: '/api/doctors/prescriptions/suggest-care-guide',
        method: 'POST',
      },
    });
    logger.error("[api/doctors/prescriptions/suggest-care-guide] POST error", error);
    return internalError();
  }
};
