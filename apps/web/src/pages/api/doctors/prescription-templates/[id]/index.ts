import type { APIRoute } from "astro";
import { badRequest, forbidden, internalError, jsonOk, notFound } from "@/lib/api-helpers";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { logger } from "@autamedica/shared";

async function resolveDoctorId(request: Request, locals: App.Locals): Promise<string | Response> {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const admin = createAstroAdminClient(locals.runtime?.env);
  const { data: doctor, error } = await admin
    .from("doctors")
    .select("id, active")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    logger.error("[api/doctors/prescription-templates/[id]] doctor lookup failed", {
      userId: auth.user.id,
      error,
    });
    return internalError();
  }

  if (!doctor?.id || doctor.active !== true) {
    return forbidden("doctor_profile_required");
  }

  return doctor.id as string;
}

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const templateId = params.id;
  if (!templateId) return badRequest("missing_template_id");

  const doctorId = await resolveDoctorId(request, locals);
  if (doctorId instanceof Response) return doctorId;

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data, error } = await admin
      .from("doctor_prescription_templates")
      .delete()
      .eq("id", templateId)
      .eq("doctor_id", doctorId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return notFound("prescription_template_not_found");

    return jsonOk({ deleted: true });
  } catch (error) {
    logger.error("[api/doctors/prescription-templates/[id]] DELETE error", {
      templateId,
      error,
    });
    return internalError();
  }
};
