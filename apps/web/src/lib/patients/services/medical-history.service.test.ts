import { describe, expect, it } from "vitest";
import { isPatientCertificateDownloadable } from "./medical-history.service";

const validCertificate = {
  status: "signed",
  signed_pdf_url: "certificates/signed/certificate-id.pdf",
  signature_verified_at: "2026-11-19T12:00:00.000Z",
  signature_hash: "a".repeat(64),
  signature_method: "ac_external",
};

describe("patient medical history certificate visibility", () => {
  it.each(["ac_external", "electronic_verified"])(
    "exposes a signed certificate with complete %s evidence",
    (signature_method) => {
      expect(isPatientCertificateDownloadable({
        ...validCertificate,
        signature_method,
      })).toBe(true);
    },
  );

  it.each([
    ["draft status", { status: "draft" }],
    ["missing signed PDF", { signed_pdf_url: null }],
    ["empty signed PDF path", { signed_pdf_url: "  " }],
    ["missing verification timestamp", { signature_verified_at: null }],
    ["missing signature hash", { signature_hash: null }],
    ["empty signature hash", { signature_hash: " " }],
    ["unknown signature method", { signature_method: "electronic_simple" }],
  ])("hides certificates with %s", (_label, override) => {
    expect(isPatientCertificateDownloadable({
      ...validCertificate,
      ...override,
    })).toBe(false);
  });
});
