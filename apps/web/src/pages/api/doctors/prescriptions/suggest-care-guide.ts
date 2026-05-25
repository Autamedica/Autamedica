import type { APIRoute } from "astro";
import { badRequest, internalError, jsonOk } from "@/lib/api-helpers";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { generatePatientCareGuideResult } from "@/lib/prescriptions/prescription-enrichment.service";
import { createAstroAdminClient } from "@/lib/supabase";
import { logger } from "@autamedica/shared";
import { captureSentryException } from '@/lib/observability/sentry';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const body = await request.json();
    const { medicationName, dosage, frequency, duration, instructions, diagnosis, patientName } = body;

    if (!medicationName || typeof medicationName !== "string" || !medicationName.trim()) {
      return badRequest("medicationName is required and must be a non-empty string");
    }

    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, care_guide_template')
      .eq('user_id', user.id)
      .maybeSingle();
    if (doctorError) {
      logger.warn("[api/doctors/prescriptions/suggest-care-guide] doctor template lookup failed", {
        userId: user.id,
        error: doctorError,
      });
    }

    const careGuideTemplate = (doctor?.care_guide_template as "female" | "neutral" | "empathetic") ?? 'neutral';
    const result = await generatePatientCareGuideResult({
      medicationName: medicationName.trim(),
      dosage: dosage?.trim(),
      frequency: frequency?.trim(),
      duration: duration?.trim(),
      instructions: instructions?.trim(),
      diagnosis: diagnosis?.trim(),
      patientName: patientName?.trim(),
      careGuideTemplate,
    });

    return jsonOk({
      ...result.guide,
      generation: {
        provider: result.provider,
        reason: result.reason,
        model: result.model,
        status: result.status,
      },
    });
  } catch (error) {
    captureSentryException(error, {
      runtimeEnv: locals.runtime?.env,
      layer: 'controller',
      surface: 'api/doctors/prescriptions/suggest-care-guide:POST',
      owner: 'Clinical Core',
      context: {
        method: 'POST',
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
