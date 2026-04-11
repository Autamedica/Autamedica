import { describe, expect, it } from "vitest";
import { requiresStrictPrescriptionValidation } from "@/lib/prescriptions/strict-validation";
import {
  buildPatientPrescriptions,
  mapPrescriptionRecordToPatientPrescription,
} from "./prescription-read-model";

describe("prescription-read-model", () => {
  it("detects medications with strict validation requirements", () => {
    expect(requiresStrictPrescriptionValidation("Metilfenidato 10 mg")).toBe(true);
    expect(requiresStrictPrescriptionValidation("Vyvanse 30 mg")).toBe(true);
    expect(requiresStrictPrescriptionValidation("Ibuprofeno 400 mg")).toBe(false);
  });

  it("maps core prescriptions with digital artifacts", () => {
    const result = mapPrescriptionRecordToPatientPrescription({
      id: "rx-1",
      title: "Prescripcion: Metilfenidato",
      created_at: "2026-04-08T10:00:00.000Z",
      content: {
        medication_name: "Metilfenidato",
        dosage: "10 mg",
        doctor_name: "Ana Perez",
        cuir: "CUIR-123",
        vendor_name: "rcta",
        signed_pdf_url: "https://example.com/rx.pdf",
        qr_code_content: "qr-data",
        is_digital_artifact_ready: true,
        source: "prescriptions_core",
      },
    });

    expect(result.medication_name).toBe("Metilfenidato");
    expect(result.doctor_name).toBe("Ana Perez");
    expect(result.is_digital_artifact_ready).toBe(true);
    expect(result.artifact_warning).toBeNull();
    expect(result.source).toBe("prescriptions_core");
  });

  it("adds an artifact warning for strict-validation medications without verifiable support", () => {
    const [result] = buildPatientPrescriptions([
      {
        id: "legacy-1",
        title: "Prescripcion: Vyvanse",
        created_at: "2026-04-08T10:00:00.000Z",
        content: {
          dosage: "30 mg",
          status: "active",
        },
      },
    ]);

    expect(result.requires_strict_validation).toBe(true);
    expect(result.is_digital_artifact_ready).toBe(false);
    expect(result.artifact_warning).toContain("controlada");
  });
});
