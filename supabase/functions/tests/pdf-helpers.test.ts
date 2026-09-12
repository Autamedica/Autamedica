import { assertEquals, assertMatch } from "jsr:@std/assert";
import {
  formatDate,
  generateMedicalOrderPdfBytes,
  generatePrescriptionPdfBytes,
  sanitizePdfText,
  sha256Hex,
} from "../_shared/pdf-helpers.ts";

Deno.test("pdf-helpers - sanitizePdfText", () => {
  const dirty = '“Medicamento” en ‘dosis’ – prueba\u00a0con espacio';
  const clean = sanitizePdfText(dirty);
  assertEquals(clean, '"Medicamento" en \'dosis\' - prueba con espacio');
});

Deno.test("pdf-helpers - formatDate", () => {
  assertEquals(formatDate("2026-09-12T10:00:00Z"), "12/09/2026");
  assertEquals(formatDate("2026-05-01"), "01/05/2026");
});

Deno.test("pdf-helpers - sha256Hex", async () => {
  const bytes = new TextEncoder().encode("AutaMedica-Test-Data");
  const hash = await sha256Hex(bytes);
  assertEquals(hash.length, 64);
  assertMatch(hash, /^[0-9a-f]{64}$/);
});

Deno.test("pdf-helpers - generatePrescriptionPdfBytes creates valid PDF", () => {
  const pdfBytes = generatePrescriptionPdfBytes({
    cuir: "AR-MD-1993D7186A9-ABCD1234",
    issuedAt: "2026-09-12T10:00:00Z",
    expiresAt: "2026-10-12T10:00:00Z",
    doctor: {
      name: "Dr. Roberto Gómez",
      licenseNumber: "MN 154321",
      licenseJurisdiction: "CABA",
      refepsId: "REF-998877",
      specialty: "Clínica Médica",
    },
    patient: {
      name: "Juan Pérez",
      dni: "30111222",
      cuil: "20-30111222-3",
      insurancePlan: "OSDE 310",
      address: "Av. Corrientes 1234, CABA",
    },
    items: [
      {
        name: "Amoxicilina 500mg",
        generic_name: "Amoxicilina",
        dosage: "500 mg comprimidos",
        frequency: "Cada 8 horas",
        duration: "7 días",
        instructions: "Tomar con abundante agua después de las comidas",
      },
    ],
    diagnosis: "Infección respiratoria alta (J06.9)",
    notes: "Control clínico en 7 días si persisten los síntomas",
  });

  assertEquals(pdfBytes instanceof Uint8Array, true);
  assertEquals(pdfBytes.byteLength > 1000, true);

  // Validate PDF magic number %PDF-
  const header = new TextDecoder().decode(pdfBytes.subarray(0, 5));
  assertEquals(header, "%PDF-");
});

Deno.test("pdf-helpers - generateMedicalOrderPdfBytes creates valid PDF", () => {
  const pdfBytes = generateMedicalOrderPdfBytes({
    cuir: "O-ABC12345",
    issuedAt: "2026-09-12T10:00:00Z",
    studyType: "laboratory",
    doctor: {
      name: "Dra. Laura Morales",
      licenseNumber: "MP 88776",
      licenseJurisdiction: "PBA",
      refepsId: "REF-112233",
      specialty: "Cardiología",
    },
    patient: {
      name: "María Gómez",
      dni: "28999111",
      cuil: "27-28999111-4",
      insurancePlan: "Swiss Medical SMG20",
      address: "Calle 50 456, La Plata",
    },
    practices: [
      { name: "Hemograma completo" },
      { name: "Perfil lipídico" },
      { name: "Glucemia en ayunas" },
    ],
    diagnosis: "Chequeo preventivo anual (Z00.0)",
    notes: "Ayuno estricto de 12 horas previo a la extracción",
  });

  assertEquals(pdfBytes instanceof Uint8Array, true);
  assertEquals(pdfBytes.byteLength > 1000, true);

  // Validate PDF magic number %PDF-
  const header = new TextDecoder().decode(pdfBytes.subarray(0, 5));
  assertEquals(header, "%PDF-");
});
