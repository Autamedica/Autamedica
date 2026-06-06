import type { APIRoute } from "astro";
import { badRequest, forbidden, internalError, jsonOk, notFound } from "@/lib/api-helpers";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { logger } from "@autamedica/shared";
import { generateMedicalOrderPdf } from "@/lib/doctors/services/pdf-medical-order.service";
import { getActiveCertificate, loadSigningCredentials } from "@/lib/doctors/services/certificate-query.service";

function generateCuir(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "O-";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function resolveInsurancePlan(insuranceInfo: unknown): string | undefined {
  if (!insuranceInfo || typeof insuranceInfo !== "object" || Array.isArray(insuranceInfo)) {
    return undefined;
  }
  const data = insuranceInfo as Record<string, unknown>;
  const pickString = (keys: string[]): string | undefined => {
    const value = keys.map((key) => data[key]).find((entry) => typeof entry === "string");
    return typeof value === "string" ? value : undefined;
  };
  const provider = pickString(["provider", "insurance_provider", "obraSocial"]);
  const plan = pickString(["plan", "insurance_plan", "planName"]);

  return [provider, plan].filter(Boolean).join(" ").trim() || undefined;
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
    const details = error.message || String(error);
    logger.error("[api/doctors/medical-orders/[id]/issue] doctor lookup failed", {
      userId: auth.user.id,
      error,
    });
    return internalError('doctor_lookup_failed', details);
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
      .select("doctor_id, patient_id, status, study_type, practices, diagnosis, notes")
      .eq("id", orderId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!order) return notFound("medical_order_not_found");
    if (order.doctor_id !== context.doctorId) return forbidden("forbidden_order_access");
    if (order.status !== "draft") return badRequest("only_draft_orders_can_be_issued");

    // Fetch patient info
    const { data: patient } = await admin
      .from("patients")
      .select("user_id, dni, cuil, address, birth_date, gender, insurance_info")
      .eq("id", order.patient_id)
      .maybeSingle();

    let patientName = "Paciente";
    if (patient?.user_id) {
      const { data: patientProfile } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", patient.user_id)
        .maybeSingle();
      if (patientProfile) {
        patientName = `${patientProfile.first_name ?? ""} ${patientProfile.last_name ?? ""}`.trim() || "Paciente";
      }
    }

    // Fetch doctor info
    const { data: doctor } = await admin
      .from("doctors")
      .select("id, license_number, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address, signature_image_url, stamp_image_url")
      .eq("id", order.doctor_id)
      .maybeSingle();

    let doctorName = "Médico";
    if (context.userId) {
      const { data: doctorProfile } = await admin
        .from("profiles")
        .select("first_name, last_name")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (doctorProfile) {
        doctorName = `Dr/Dra. ${doctorProfile.first_name ?? ""} ${doctorProfile.last_name ?? ""}`.trim() || "Médico";
      }
    }

    const cuir = generateCuir();
    const qrContent = `https://autamedica.com/orders/${cuir}`;

    // 1. Generate core PDF
    const artifacts = await generateMedicalOrderPdf({
      orderId,
      studyType: order.study_type as 'laboratory' | 'imaging' | 'cardiology' | 'other',
      practices: order.practices as Array<{ name: string }>,
      diagnosis: order.diagnosis ?? "",
      notes: order.notes ?? undefined,
      patient: {
        name: patientName,
        dni: patient?.dni ?? undefined,
        cuil: patient?.cuil ?? undefined,
        dateOfBirth: patient?.birth_date ?? undefined,
        sex: patient?.gender ?? undefined,
        insurancePlan: resolveInsurancePlan(patient?.insurance_info),
        address: patient?.address ?? undefined,
      },
      prescriber: {
        name: doctorName,
        license: doctor?.license_number ?? "",
        licenseJurisdiction: doctor?.enrollment_jurisdiction ?? undefined,
        licenseEntity: doctor?.enrollment_entity ?? undefined,
        refeps: doctor?.refeps_id ?? undefined,
        specialty: doctor?.specialty ?? undefined,
        professionalAddress: doctor?.professional_address ?? undefined,
        signatureImageUrl: doctor?.signature_image_url ?? undefined,
        stampImageUrl: doctor?.stamp_image_url ?? undefined,
      },
      issuedAt: new Date().toISOString(),
      existingCuir: cuir,
    });

    let finalPdfBuffer = artifacts.pdfBuffer;

    // 2. Attempt PAdES digital signing if doctor has certificate
    try {
      if (doctor?.id) {
        const activeCert = await getActiveCertificate(admin, doctor.id);
        if (activeCert) {
          const { p12Buffer, password } = await loadSigningCredentials(
            admin,
            doctor.id,
            activeCert.certFingerprint,
          );
          const { signPdfWithP12 } = await import("@/lib/prescriptions/pdf-signer.service");
          const signResult = await signPdfWithP12({
            pdfBuffer: artifacts.pdfBuffer,
            p12Buffer,
            password,
            signerName: doctorName,
            reason: `Orden Medica ${artifacts.cuir} - ${doctorName}`,
            location: doctor.enrollment_jurisdiction ?? "Argentina",
          });
          finalPdfBuffer = signResult.signedPdfBuffer;
          logger.info("[issueMedicalOrder] PDF signed with PAdES", { cuir: artifacts.cuir });
        }
      }
    } catch (signError) {
      logger.warn("[issueMedicalOrder] PAdES signing failed, using electronic_simple", signError);
    }

    // 3. Upload to private storage bucket 'medical-documents'
    const pdfPath = `medical-orders/${orderId}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("medical-documents")
      .upload(pdfPath, finalPdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      logger.error("[api/doctors/medical-orders/[id]/issue] PDF upload failed", uploadError);
      return internalError("pdf_upload_failed", uploadError.message || String(uploadError));
    }

    // Generate a long-term signed URL since medical-documents is private
    const { data: urlData, error: urlError } = await admin.storage
      .from("medical-documents")
      .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);

    if (urlError || !urlData?.signedUrl) {
      logger.error("[api/doctors/medical-orders/[id]/issue] Signed URL generation failed", urlError);
      return internalError(
        "signed_url_generation_failed",
        urlError?.message || "signed_pdf_url_missing",
      );
    }

    const signedPdfUrl = urlData.signedUrl;

    // 4. Update order state in database
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
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger.error("[api/doctors/medical-orders/[id]/issue] POST error", { orderId, error });
    return internalError("medical_order_issue_failed", details);
  }
};
