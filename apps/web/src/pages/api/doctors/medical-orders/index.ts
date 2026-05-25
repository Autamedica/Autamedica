import type { APIRoute } from "astro";
import { badRequest, forbidden, internalError, jsonOk } from "@/lib/api-helpers";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { doctorHasPatientAccess } from "@/lib/doctors/lib/resolve-room";
import { logger } from "@autamedica/shared";
import { z } from "zod";

const MedicalOrderCreateSchema = z.object({
  patient_id: z.string().uuid(),
  study_type: z.enum(["laboratory", "imaging", "cardiology", "other"]),
  practices: z.array(z.object({
    name: z.string().min(1),
    code: z.string().optional().nullable(),
  })).min(1),
  diagnosis: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "signed", "cancelled", "expired"]).default("draft"),
});

async function resolveAuthedDoctorContext(
  request: Request,
  locals: App.Locals,
) {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const admin = createAstroAdminClient(locals?.runtime?.env);
  const { data: doctor, error } = await admin
    .from("doctors")
    .select("id, active")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    logger.error("[api/doctors/medical-orders] doctor lookup failed", {
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

    // Verify doctor patient access
    const hasAccess = await doctorHasPatientAccess(admin, context.doctorId, patientId);
    if (!hasAccess) return forbidden("forbidden_patient_access");

    const query = admin
      .from("medical_orders")
      .select("*")
      .eq("patient_id", patientId)
      .eq("doctor_id", context.doctorId);

    const status = url.searchParams.get("status");
    if (status) query.eq("status", status);

    const studyType = url.searchParams.get("studyType");
    if (studyType) query.eq("study_type", studyType);

    const { data: orders, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;

    return jsonOk(orders);
  } catch (error) {
    logger.error("[api/doctors/medical-orders] GET error", error);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolveAuthedDoctorContext(request, locals);
  if (context instanceof Response) return context;

  try {
    const body = await request.json();
    const result = MedicalOrderCreateSchema.safeParse(body);
    if (!result.success) return badRequest(result.error.message);

    const admin = createAstroAdminClient(locals?.runtime?.env);

    // Verify doctor patient access
    const hasAccess = await doctorHasPatientAccess(admin, context.doctorId, result.data.patient_id);
    if (!hasAccess) return forbidden("forbidden_patient_access");

    const { data: created, error } = await admin
      .from("medical_orders")
      .insert({
        doctor_id: context.doctorId,
        patient_id: result.data.patient_id,
        study_type: result.data.study_type,
        practices: result.data.practices,
        diagnosis: result.data.diagnosis,
        notes: result.data.notes,
        status: result.data.status,
      })
      .select()
      .single();

    if (error) throw error;

    return jsonOk(created, 201);
  } catch (error) {
    logger.error("[api/doctors/medical-orders] POST error", error);
    return internalError();
  }
};
