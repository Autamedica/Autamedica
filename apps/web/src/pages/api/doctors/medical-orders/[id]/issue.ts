import type { APIRoute } from "astro";
import { badRequest, forbidden, internalError, jsonOk, notFound } from "@/lib/api-helpers";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { logger } from "@autamedica/shared";

function generateCuir(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "O-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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
    logger.error("[api/doctors/medical-orders/[id]/issue] doctor lookup failed", {
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

export const POST: APIRoute = async ({ request, params, locals }) => {
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
    if (order.status !== "draft") return badRequest("only_draft_orders_can_be_issued");

    const cuir = generateCuir();
    const qrContent = `https://autamedica.com/orders/${cuir}`;
    const signedPdfUrl = `/storage/v1/object/public/medical-orders/${orderId}.pdf`;

    const { data: updated, error: updateError } = await admin
      .from("medical_orders")
      .update({
        status: "signed",
        cuir,
        qr_code_content: qrContent,
        signed_pdf_url: signedPdfUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .select()
      .single();

    if (updateError) throw updateError;

    return jsonOk({
      cuir: updated.cuir,
      qrContent: updated.qr_code_content,
      signedPdfUrl: updated.signed_pdf_url,
      issuedAt: updated.updated_at,
    });
  } catch (error) {
    logger.error("[api/doctors/medical-orders/[id]/issue] POST error", { orderId, error });
    return internalError();
  }
};
