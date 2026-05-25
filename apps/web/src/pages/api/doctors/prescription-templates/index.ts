import type { APIRoute } from "astro";
import { z } from "zod";
import { badRequest, forbidden, internalError, jsonOk } from "@/lib/api-helpers";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { logger } from "@autamedica/shared";

const OptionalNullableText = (max: number) => z.string().trim().max(max).nullable().optional();

const PrescriptionTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  medication_name: z.string().trim().min(1).max(200),
  dosage: OptionalNullableText(200),
  frequency: OptionalNullableText(200),
  duration: OptionalNullableText(200),
  instructions: OptionalNullableText(4000),
  diagnosis: OptionalNullableText(500),
  notes: OptionalNullableText(2000),
  side_effects_warning: OptionalNullableText(2000),
  care_guide_tips: OptionalNullableText(4000),
  care_guide_forgotten: OptionalNullableText(4000),
  care_guide_warnings: OptionalNullableText(4000),
  care_guide_lifestyle: OptionalNullableText(4000),
});

type TemplatePayload = z.infer<typeof PrescriptionTemplateCreateSchema>;

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
    logger.error("[api/doctors/prescription-templates] doctor lookup failed", {
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

function normalizeTemplatePayload(payload: TemplatePayload): TemplatePayload {
  return {
    ...payload,
    name: payload.name.trim(),
    medication_name: payload.medication_name.trim(),
    dosage: payload.dosage?.trim() || null,
    frequency: payload.frequency?.trim() || null,
    duration: payload.duration?.trim() || null,
    instructions: payload.instructions?.trim() || null,
    diagnosis: payload.diagnosis?.trim() || null,
    notes: payload.notes?.trim() || null,
    side_effects_warning: payload.side_effects_warning?.trim() || null,
    care_guide_tips: payload.care_guide_tips?.trim() || null,
    care_guide_forgotten: payload.care_guide_forgotten?.trim() || null,
    care_guide_warnings: payload.care_guide_warnings?.trim() || null,
    care_guide_lifestyle: payload.care_guide_lifestyle?.trim() || null,
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const doctorId = await resolveDoctorId(request, locals);
  if (doctorId instanceof Response) return doctorId;

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data, error } = await admin
      .from("doctor_prescription_templates")
      .select(
        "id, name, medication_name, dosage, frequency, duration, instructions, diagnosis, notes, side_effects_warning, care_guide_tips, care_guide_forgotten, care_guide_warnings, care_guide_lifestyle, created_at, updated_at",
      )
      .eq("doctor_id", doctorId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return jsonOk(data ?? []);
  } catch (error) {
    logger.error("[api/doctors/prescription-templates] GET error", error);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const doctorId = await resolveDoctorId(request, locals);
  if (doctorId instanceof Response) return doctorId;

  try {
    const body = await request.json();
    const parsed = PrescriptionTemplateCreateSchema.safeParse(body);
    if (!parsed.success) return badRequest("invalid_prescription_template");

    const payload = normalizeTemplatePayload(parsed.data);
    const admin = createAstroAdminClient(locals.runtime?.env);

    const { count, error: countError } = await admin
      .from("doctor_prescription_templates")
      .select("id", { count: "exact", head: true })
      .eq("doctor_id", doctorId);

    if (countError) throw countError;
    if ((count ?? 0) >= 12) {
      return badRequest("prescription_template_limit_reached");
    }

    const { data, error } = await admin
      .from("doctor_prescription_templates")
      .insert({
        ...payload,
        doctor_id: doctorId,
      })
      .select(
        "id, name, medication_name, dosage, frequency, duration, instructions, diagnosis, notes, side_effects_warning, care_guide_tips, care_guide_forgotten, care_guide_warnings, care_guide_lifestyle, created_at, updated_at",
      )
      .single();

    if (error) {
      if (error.code === "23505") return badRequest("prescription_template_name_exists");
      throw error;
    }

    return jsonOk(data, 201);
  } catch (error) {
    logger.error("[api/doctors/prescription-templates] POST error", error);
    return internalError();
  }
};
