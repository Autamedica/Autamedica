import { describe, expect, it } from "vitest";
import { isMedicalCertificatePubliclyVerifiable } from "./medical-certificate-verification";

const verified = {
  status: "signed",
  signed_pdf_url: "https://example.invalid/signed.pdf",
  signature_verified_at: "2026-10-26T19:00:00Z",
  signature_hash: "sha256-content-digest",
  signature_method: "ac_external",
};

describe("public medical certificate verification", () => {
  it("rejects unsigned drafts even when a PDF URL is present", () => {
    expect(isMedicalCertificatePubliclyVerifiable({ ...verified, status: "draft" })).toBe(false);
  });

  it("rejects cancelled and expired certificates", () => {
    expect(isMedicalCertificatePubliclyVerifiable({ ...verified, status: "cancelled" })).toBe(false);
    expect(isMedicalCertificatePubliclyVerifiable({ ...verified, status: "expired" })).toBe(false);
  });

  it("rejects legacy signed rows without independently verified signature evidence", () => {
    expect(isMedicalCertificatePubliclyVerifiable({ ...verified, signed_pdf_url: null })).toBe(false);
    expect(isMedicalCertificatePubliclyVerifiable({ ...verified, signature_verified_at: null })).toBe(false);
    expect(isMedicalCertificatePubliclyVerifiable({ ...verified, signature_hash: null })).toBe(false);
    expect(isMedicalCertificatePubliclyVerifiable({ ...verified, signature_method: "electronic_simple" })).toBe(false);
  });

  it("accepts signed documents only after trusted signing evidence is stored", () => {
    expect(isMedicalCertificatePubliclyVerifiable(verified)).toBe(true);
    expect(isMedicalCertificatePubliclyVerifiable({ ...verified, signature_method: "electronic_verified" })).toBe(true);
  });
});
