import type { APIRoute } from "astro";
import { badRequest, forbidden, internalError, jsonOk, notFound } from "@/lib/api-helpers";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { logger } from "@autamedica/shared";
import { z } from "zod";

const MedicalOrderUpdateSchema = z.object({
  study_type: z.enum(["laboratory", "imaging", "cardiology", "other"]).optional(),
  practices: z.array(z.object({
    name: z.string().min(1),
    code: z.string().optional().nullable(),
  })).optional(),
  diagnosis: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "signed", "cancelled", "expired"]).optional(),
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
    logger.error("[api/doctors/medical-orders/[id]] doctor lookup failed", {
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

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const orderId = params.id;
  if (!orderId) return badRequest("order id is required");

  const context = await resolveAuthedDoctorContext(request, locals);
  if (context instanceof Response) return context;

  try {
    const body = await request.json();
    const result = MedicalOrderUpdateSchema.safeParse(body);
    if (!result.success) return badRequest(result.error.message);

    const admin = createAstroAdminClient(locals?.runtime?.env);

    // Fetch original order to verify ownership
    const { data: order, error: fetchError } = await admin
      .from("medical_orders")
      .select("doctor_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!order) return notFound("medical_order_not_found");
    if (order.doctor_id !== context.doctorId) return forbidden("forbidden_order_access");
    if (order.status !== "draft") return badRequest("only_draft_orders_can_be_modified");

    const { data: updated, error: updateError } = await admin
      .from("medical_orders")
      .update({
        ...result.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) throw updateError;

    return jsonOk(updated);
  } catch (error) {
    logger.error("[api/doctors/medical-orders/[id]] PATCH error", { orderId, error });
    return internalError();
  }
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const orderId = params.id;
  if (!orderId) return badRequest("order id is required");

  const context = await resolveAuthedDoctorContext(request, locals);
  if (context instanceof Response) return context;

  try {
    const admin = createAstroAdminClient(locals?.runtime?.env);

    // Fetch original order to verify ownership
    const { data: order, error: fetchError } = await admin
      .from("medical_orders")
      .select("doctor_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!order) return notFound("medical_order_not_found");
    if (order.doctor_id !== context.doctorId) return forbidden("forbidden_order_access");

    // Draft orders can be physically deleted, signed can only be cancelled
    if (order.status === "draft") {
      const { error: deleteError } = await admin
        .from("medical_orders")
        .delete()
        .eq("id", orderId);

      if (deleteError) throw deleteError;
    } else {
      const { error: cancelError } = await admin
        .from("medical_orders")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      if (cancelError) throw cancelError;
    }

    return jsonOk({ success: true });
  } catch (error) {
    logger.error("[api/doctors/medical-orders/[id]] DELETE error", { orderId, error });
    return internalError();
  }
};
