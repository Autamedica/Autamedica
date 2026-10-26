import { describe, expect, it } from 'vitest';
import { generateMedicalCertificatePdf, type MedicalCertificatePdfInput } from './pdf-medical-certificate.service';

const caseFile: MedicalCertificatePdfInput = {
  reference: 'AR-CERT-TEST-001',
  type: 'reposo_laboral',
  patientName: 'Paciente Prueba',
  patientDni: '00000000',
  doctorName: 'Doctor Demo',
  doctorLicense: 'MP-12345',
  jurisdiction: 'Santa Cruz',
  diagnosis: 'Gastroenteritis',
  treatment: 'Hidratación y reposo',
  daysOfRest: 2,
  startDate: '2026-10-26',
  endDate: '2026-10-27',
  createdAt: '2026-10-26T12:00:00Z',
};

describe('medical certificate PDF', () => {
  it('generates a private PDF explicitly marked unsigned and without a QR', () => {
    const pdf = generateMedicalCertificatePdf(caseFile);
    const text = Buffer.from(pdf).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('BORRADOR - SIN FIRMA');
    expect(text).toContain('AR-CERT-TEST-001');
    expect(text).toContain('Paciente Prueba');
    expect(text).not.toContain('https://autamedica.com/verify/');
  });

  it('generates source bytes to be signed without claiming they are signed', () => {
    const pdf = generateMedicalCertificatePdf(caseFile, 'signing-source');
    const text = Buffer.from(pdf).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).not.toContain('BORRADOR - SIN FIRMA');
    expect(text).toContain('AR-CERT-TEST-001');
  });
});
