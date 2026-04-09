import { describe, expect, it } from "vitest";
import { __testables } from "./prescription.backend";

describe("doctor prescription backend mappings", () => {
  it("preserves issuance state when a signed or sent prescription remains clinically active", () => {
    expect(__testables.mapClinicalStatusToCoreStatus("activa", "signed")).toBe("signed");
    expect(__testables.mapClinicalStatusToCoreStatus("activa", "sent")).toBe("sent");
  });

  it("maps clinical completion and cancellation to core issuance states", () => {
    expect(__testables.mapClinicalStatusToCoreStatus("completada", "draft")).toBe("expired");
    expect(__testables.mapClinicalStatusToCoreStatus("cancelada", "sent")).toBe("cancelled");
  });

  it("maps core rows into doctor prescriptions using clinical metadata and hides pending vendor", () => {
    const prescription = __testables.mapCoreRowToPrescription({
      id: "rx-1",
      created_at: "2026-04-08T12:00:00.000Z",
      updated_at: "2026-04-08T13:00:00.000Z",
      doctor_id: "doc-1",
      patient_id: "pat-1",
      cuir: "CUIR-1",
      status: "sent",
      vendor_name: "pending",
      vendor_id: null,
      qr_code_content: "qr-value",
      signed_pdf_url: null,
      clinical_data: {
        medication_name: "Metilfenidato",
        dosage: "10 mg",
        frequency: "Cada 12 horas",
        duration: "30 dias",
        instructions: "Tomar por la manana",
        diagnosis: "TDAH",
        notes: "Control en 30 dias",
        clinical_status: "pausada",
        prescribed_date: "2026-04-01T10:00:00.000Z",
        start_date: "2026-04-02T10:00:00.000Z",
        end_date: "2026-05-02T10:00:00.000Z",
      },
    } as never);

    expect(prescription.status).toBe("pausada");
    expect(prescription.prescribed_date).toBe("2026-04-01T10:00:00.000Z");
    expect(prescription.start_date).toBe("2026-04-02T10:00:00.000Z");
    expect(prescription.end_date).toBe("2026-05-02T10:00:00.000Z");
    expect(prescription.vendor_name).toBeNull();
    expect(prescription.is_digital_artifact_ready).toBe(true);
    expect(prescription.diagnosis).toBe("TDAH");
    expect(prescription.requires_strict_validation).toBe(true);
    expect(prescription.artifact_warning).toBeNull();
  });

  it("requires diagnosis and dosage before saving strict-validation medications", () => {
    expect(() =>
      __testables.assertStrictPrescriptionRequirements({
        medication_name: "Vyvanse 30 mg",
        diagnosis: null,
        dosage: "",
      }),
    ).toThrow("strict_prescription_missing_required_fields");

    expect(() =>
      __testables.assertStrictPrescriptionRequirements({
        medication_name: "Metilfenidato",
        diagnosis: "TDAH",
        dosage: "10 mg",
      }),
    ).not.toThrow();
  });
});
