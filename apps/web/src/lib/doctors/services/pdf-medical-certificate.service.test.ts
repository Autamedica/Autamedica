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

  it('omits confidential diagnosis in both draft preview and signing source', () => {
    const privateCase = {
      ...caseFile,
      diagnosis: 'CONFIDENTIAL-DIAGNOSIS-NEVER-IN-PDF',
      hideDiagnosis: true,
    };
    for (const mode of ['draft', 'signing-source'] as const) {
      const pdf = generateMedicalCertificatePdf(privateCase, mode);
      const documentText = Buffer.from(pdf).toString('latin1');
      expect(documentText).not.toContain('CONFIDENTIAL-DIAGNOSIS-NEVER-IN-PDF');
      expect(documentText).not.toContain('DIAGNOSTICO');
    }
  });

  it('generates source bytes to be signed without claiming they are signed', () => {
    const pdf = generateMedicalCertificatePdf(caseFile, 'signing-source');
    const text = Buffer.from(pdf).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).not.toContain('BORRADOR - SIN FIRMA');
    expect(text).toContain('AR-CERT-TEST-001');
  });
  it('renders an electronic certificate with both assets and an accurate signature label', () => {
    const image = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAHgAAAAeCAIAAABoq03CAAAC4klEQVR4nO2Yz0syQRjHxzdB9FIXzfQf6Ba4BC0ruutuewk6BNUtIgi6FB36A7qFCN28aOwShHiQwkuoRWBkduqYgbc2guygF7OG8umwtLy4uhL0Tsk7n9PM+J3nGT7sD1YbACDKv+fPTx/gf4GKJgQVTQgqmhBUNCGoaEJ0ET0yMtKxoqoqwzAsyzIMs7+/ry8mk8lAIBAOh2dmZjRNM8J7e3sOh+Px8bFXNYTQ0dERz/M8z9vtdn2QyWRcLhf/ye7uLkLo+vpalmVBEKanpzVN67rrGxyQAUwMDw//Pc3lchzH1et1AKjX6xzHnZycFAoFQRCen58B4Pj4OBKJGPnZ2dmtrS1FUbpWs+hlTk5MTGiaBgCZTGZhYcEi+fvpL1oUxcvLS2NaKpUkSZJluVwuG4urq6sYYwBoNpuiKN7e3s7NzXWtZtHLnBwbG6tWqwCAMT4/P7dI/n76i/b5fK1Wy5i2Wi2fz+f3+19eXsx7Dw8PY7EYAAQCgdfXV3M1i17mpKqqXq93ZWXl7OzM4oQDwZdfhgBgs9ne39+7/prNZg8ODqamph4eHorF4pcqY4yNZ3S5XEYILS8v39zcBIPBzc3N7e3trx71d2F233G9SJJUKpWM6cXFhSzLoVDo6upKX2m320tLSwDw9vbGsqy+mMvlNjY2zNUsenUka7Wa0bdWq42OjvZKDgT9RefzeY7jGo0GfL4MT09P0+m0JEn60yOVSi0uLgJAsVhcW1vTdzWbzfHxcXM1i14dyaenJ7/ff3d3BwCVSmVycrJXciCwm69xjHEwGNTHHMdFo9H7+3tBEBwOB8Z4fX1dFEWEULVaZRjG7XZ7PJ54PI4QymazkUhE3+hyuTweT6VSMVfrdW/pjw59zLLszs5OIpGYn593Op1DQ0OKonzbXfwT2ID+TUoE+mVICCqaEFQ0IahoQlDRhKCiCUFFE4KKJgQVTQgqmhBUNCGoaEJQ0YSgognxAe6iy0k3B59dAAAAAElFTkSuQmCC', 'base64'));
    const pdf = generateMedicalCertificatePdf({ ...caseFile, electronicSignature: {
      signature: image, stamp: image, confirmedAt: '2026-10-29T22:00:00Z',
    } }, 'electronic');
    const text = Buffer.from(pdf).toString('latin1');
    expect(text).toContain('/Subtype /Image');
    expect(text).not.toContain('BORRADOR - SIN FIRMA');
    expect(text).not.toContain('Original pendiente de firma');
    expect(text).toContain('No es firma digital certificada');
  });

  it('cannot render issued electronic mode without confirmation assets', () => {
    expect(() => generateMedicalCertificatePdf(caseFile, 'electronic')).toThrow('confirmation_required');
  });

  it('shows a patient-authorized CID in a Brazilian draft but hides clinical narrative', () => {
    const pdf = generateMedicalCertificatePdf({
      ...caseFile,
      countryCode: 'BR',
      reference: 'BR-CERT-TEST-001',
      diagnosis: 'PRIVATE-CONFIDENTIAL-DIAGNOSIS',
      treatment: 'PRIVATE-TREATMENT-DATA',
      observations: 'PRIVATE-OBSERVATIONS-DATA',
      hideDiagnosis: true,
      cid10Code: 'J06.9',
      cidPatientRequested: true,
      cidConsentRecordedAt: '2026-11-01T12:00:00Z',
    });
    const text = Buffer.from(pdf).toString('latin1');
    expect(text).toContain('J06.9');
    expect(text).not.toContain('PRIVATE-CONFIDENTIAL-DIAGNOSIS');
    expect(text).not.toContain('PRIVATE-TREATMENT-DATA');
    expect(text).not.toContain('PRIVATE-OBSERVATIONS-DATA');
  });

  it('never includes a Brazilian CID without recorded patient consent', () => {
    const pdf = generateMedicalCertificatePdf({
      ...caseFile,
      countryCode: 'BR',
      diagnosis: 'PRIVATE-DIAGNOSIS',
      cid10Code: 'J06.9',
      cidPatientRequested: false,
      cidConsentRecordedAt: null,
    });
    const text = Buffer.from(pdf).toString('latin1');
    expect(text).not.toContain('J06.9');
    expect(text).not.toContain('PRIVATE-DIAGNOSIS');
  });

});

