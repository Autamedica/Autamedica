import type { APIRoute } from "astro";
import { badRequest, forbidden, internalError, jsonOk } from "@/lib/api-helpers";
import { DOCTOR_ROLES, isAuthed, withAuthRole } from "@/lib/api-auth";
import { createAstroAdminClient } from "@/lib/supabase";
import { doctorHasPatientAccess } from "@/lib/doctors/lib/resolve-room";
import { logger } from "@autamedica/shared";
import { z } from "zod";
import { resolveBrazilianCidDisclosure } from "@/lib/doctors/services/brazilian-certificate-cid";

const MedicalCertificateCreateSchema = z.object({
  patient_id: z.string().uuid("ID de paciente inválido"),
  appointment_id: z.string().uuid().optional().nullable(),
  certificate_type: z.enum([
    "reposo_laboral",
    "reposo_escolar",
    "aptitud_fisica",
    "constancia_atencion",
    "tratamiento",
    "otro",
  ]),
  days_of_rest: z.number().int().min(0).default(0),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha de inicio inválido (AAAA-MM-DD)"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha de fin inválido (AAAA-MM-DD)").optional().nullable(),
  diagnosis: z.string().optional().nullable(),
  hide_diagnosis: z.boolean().default(false),
  cid10_code: z.string().max(8).optional().nullable(),
  cid_requested_by_patient: z.boolean().default(false),
  observations: z.string().optional().nullable(),
  treatment: z.string().trim().max(2000).optional().nullable(),
  country_code: z.enum(["AR", "BR"]).default("AR"),
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
    .select("id, active, user_id, license_type, uf_brazil")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    const details = error.message || String(error);
    logger.error("[api/doctors/certificates] doctor lookup failed", {
      userId: auth.user.id,
      error,
    });
    return internalError("doctor_lookup_failed", details);
  }

  if (!doctor?.id || doctor.active !== true) {
    return forbidden("doctor_profile_required");
  }

  return {
    userId: auth.user.id,
    doctorId: doctor.id,
    licenseType: doctor.license_type as string | null,
    ufBrazil: doctor.uf_brazil as string | null,
    countryCode: doctor.license_type === "CRM" && /^[A-Z]{2}$/.test(doctor.uf_brazil ?? "")
      ? "BR" as const
      : ["MN", "MP"].includes(doctor.license_type ?? "") ? "AR" as const : null,
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolveAuthedDoctorContext(request, locals);
  if (context instanceof Response) return context;

  const url = new URL(request.url);
  if (url.searchParams.get("context") === "country") {
    return jsonOk({ countryCode: context.countryCode });
  }
  const patientId = url.searchParams.get("patientId");

  try {
    const admin = createAstroAdminClient(locals?.runtime?.env);

    if (patientId) {
      const hasAccess = await doctorHasPatientAccess(admin, context.doctorId, patientId);
      if (!hasAccess) return forbidden("forbidden_patient_access");
    }

    const query = admin
      .from("medical_certificates")
      .select('*')
      .eq("doctor_id", context.doctorId);

    if (patientId) {
      query.eq("patient_id", patientId);
    }

    const status = url.searchParams.get("status");
    if (status) {
      query.eq("status", status);
    }

    const certType = url.searchParams.get("certificateType");
    if (certType) {
      query.eq("certificate_type", certType);
    }

    const { data: certificates, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;

    // Enrich with patient names and DNI if available
    const patientIds = Array.from(new Set((certificates ?? []).map((c) => c.patient_id).filter(Boolean)));
    const patientMap: Record<string, { fullName: string; dni: string }> = {};

    if (patientIds.length > 0) {
      const { data: patients } = await admin
        .from("patients")
        .select("id, user_id, dni")
        .in("id", patientIds);

      const userIds = (patients ?? []).map((p) => p.user_id).filter(Boolean);
      const { data: profiles } = userIds.length > 0
        ? await admin
            .from("profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", userIds)
        : { data: [] };

      const profileMap = new Map((profiles ?? []).map((pr) => [pr.user_id, pr]));

      for (const p of patients ?? []) {
        const prof = p.user_id ? profileMap.get(p.user_id) : null;
        const fullName = prof ? `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim() : "Paciente";
        patientMap[p.id] = { fullName, dni: p.dni ?? "" };
      }
    }

    const enriched = (certificates ?? []).map((cert) => ({
      ...cert,
      patientName: patientMap[cert.patient_id]?.fullName ?? "Paciente",
      patientDni: patientMap[cert.patient_id]?.dni ?? "",
    }));

    return jsonOk(enriched);
  } catch (error) {
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger.error("[api/doctors/certificates] GET error", error);
    return internalError("medical_certificates_get_failed", details);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolveAuthedDoctorContext(request, locals);
  if (context instanceof Response) return context;

  try {
    const body = await request.json();
    const result = MedicalCertificateCreateSchema.safeParse(body);
    if (!result.success) return badRequest(result.error.message);

    if (!context.countryCode || result.data.country_code !== context.countryCode) {
      return forbidden("certificate_doctor_country_mismatch");
    }
    let cid10Code: string | null;
    try {
      cid10Code = resolveBrazilianCidDisclosure({
        countryCode: result.data.country_code,
        code: result.data.cid10_code,
        patientRequested: result.data.cid_requested_by_patient,
        doctorLicenseType: context.licenseType,
        doctorUfBrazil: context.ufBrazil,
      });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "cid10_invalid");
    }
    const admin = createAstroAdminClient(locals?.runtime?.env);

    // Verify doctor patient access
    const hasAccess = await doctorHasPatientAccess(admin, context.doctorId, result.data.patient_id);
    if (!hasAccess) return forbidden("forbidden_patient_access");

    // Generate an internal draft reference; this is not a national ReNaPDiS registration.
    const timestampHex = Date.now().toString(16).toUpperCase();
    const randomHex = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    const cuir = `${result.data.country_code}-CERT-${timestampHex}-${randomHex}`;
    const qrContent = `https://autamedica.com/verify/${cuir}`;

    const { data: created, error } = await admin
      .from("medical_certificates")
      .insert({
        doctor_id: context.doctorId,
        patient_id: result.data.patient_id,
        appointment_id: result.data.appointment_id ?? null,
        cuir,
        status: "draft",
        certificate_type: result.data.certificate_type,
        days_of_rest: result.data.days_of_rest,
        start_date: result.data.start_date,
        end_date: result.data.end_date ?? null,
        diagnosis: result.data.diagnosis ?? null,
        hide_diagnosis: result.data.country_code === "BR" ? true : result.data.hide_diagnosis,
        cid10_code: cid10Code,
        cid_requested_by_patient: Boolean(cid10Code),
        cid_consent_recorded_at: cid10Code ? new Date().toISOString() : null,
        cid_consent_recorded_by: cid10Code ? context.userId : null,
        observations: result.data.observations ?? null,
        treatment: result.data.treatment ?? null,
        qr_code_content: qrContent,
        country_code: result.data.country_code,
      })
      .select()
      .single();

    if (error) throw error;

    logger.info("[api/doctors/certificates] unsigned certificate draft saved", {
      certificateId: created.id,
      cuir: created.cuir,
      doctorId: context.doctorId,
      patientId: result.data.patient_id,
    });

    return jsonOk(created, 201);
  } catch (error) {
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger.error("[api/doctors/certificates] POST error", error);
    return internalError("medical_certificates_post_failed", details);
  }
};
