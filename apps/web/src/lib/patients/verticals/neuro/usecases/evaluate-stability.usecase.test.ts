import { describe, expect, it } from "vitest";
import { __testables } from "./evaluate-stability.usecase";

describe("evaluateNeuroStability gating", () => {
  it("ignores draft core prescriptions without issuance evidence", () => {
    const eligible = __testables.pickEligibleNeuroPrescription(
      [
        {
          id: "core-draft",
          created_at: "2026-04-08T10:00:00.000Z",
          status: "draft",
          cuir: null,
          qr_code_content: null,
          signed_pdf_url: null,
          clinical_data: {
            medication_name: "Metilfenidato",
            dosage: "10 mg",
            clinical_status: "activa",
          },
        },
      ],
      [],
    );

    expect(eligible).toBeNull();
  });

  it("selects the latest issued strict-validation prescription from core", () => {
    const eligible = __testables.pickEligibleNeuroPrescription(
      [
        {
          id: "older-core",
          created_at: "2026-04-01T10:00:00.000Z",
          status: "sent",
          cuir: "CUIR-1",
          qr_code_content: "qr-1",
          signed_pdf_url: null,
          clinical_data: {
            medication_name: "Metilfenidato",
            dosage: "10 mg",
            diagnosis: "TDAH",
            clinical_status: "activa",
            prescribed_date: "2026-04-01T10:00:00.000Z",
          },
        },
        {
          id: "latest-core",
          created_at: "2026-04-08T10:00:00.000Z",
          status: "signed",
          cuir: "CUIR-2",
          qr_code_content: null,
          signed_pdf_url: "https://example.com/rx.pdf",
          clinical_data: {
            medication_name: "Vyvanse",
            dosage: "30 mg",
            diagnosis: "TDAH",
            clinical_status: "activa",
            prescribed_date: "2026-04-08T10:00:00.000Z",
          },
        },
      ],
      [
        {
          id: "legacy-1",
          created_at: "2026-04-09T10:00:00.000Z",
          title: "Prescripción: Metilfenidato",
          content: {
            medication_name: "Metilfenidato",
            status: "activa",
          },
        },
      ],
    );

    expect(eligible).toMatchObject({
      id: "latest-core",
      source: "prescriptions_core",
      medication_name: "Vyvanse",
      issuance_status: "signed",
      has_verifiable_artifact: true,
    });
  });

  it("falls back to active legacy stimulant prescriptions when core has none eligible", () => {
    const eligible = __testables.pickEligibleNeuroPrescription(
      [],
      [
        {
          id: "legacy-1",
          created_at: "2026-04-08T10:00:00.000Z",
          title: "Prescripción: Metilfenidato",
          content: {
            medication_name: "Metilfenidato",
            dosage: "10 mg",
            diagnosis: "TDAH",
            status: "activa",
          },
        },
      ],
    );

    expect(eligible).toMatchObject({
      id: "legacy-1",
      source: "legacy",
      medication_name: "Metilfenidato",
      issuance_status: null,
      has_verifiable_artifact: false,
    });
  });
});
