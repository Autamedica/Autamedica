import { describe, it, expect, vi } from 'vitest';
import { assertElectronicCertificateEligible, issueElectronicCertificate, type ElectronicCertificateSource } from './certificate-electronic-issuance.service';
import { certificateAssetPath, assertCertificateImage } from './certificate-electronic-assets';

const source = (): ElectronicCertificateSource => ({
  certificate: { id: 'local-test', country_code: 'AR', status: 'draft', start_date: '2026-10-29',
    end_date: '2026-10-30', days_of_rest: 2, diagnosis: 'LOCAL TEST ONLY' },
  doctor: { id: 'doctor-test', user_id: 'user-test', license_type: 'MN', active: true,
    license_number: 'LOCAL', signature_image_url: 'uploaded', stamp_image_url: 'uploaded' },
  profile: { first_name: 'LOCAL', last_name: 'TEST', role: 'doctor', active: true,
    deleted_at: null, sss_validation_status: 'valid' },
  patient: { dni: 'LOCAL-TEST' }, patientProfile: { first_name: 'LOCAL', last_name: 'TEST' },
  snapshotHash: 'a'.repeat(64),
});

describe('Argentine electronic certificate boundaries', () => {
  it('accepts a validated Argentine doctor with both assets and consistent inclusive dates', () => {
    expect(() => assertElectronicCertificateEligible(source())).not.toThrow();
  });
  it.each(['BR', 'UY'])('rejects another country: %s', country => {
    const input = source(); input.certificate.country_code = country;
    expect(() => assertElectronicCertificateEligible(input)).toThrow('argentina_only');
  });
  it('rejects Brazilian CRM even on an AR draft', () => {
    const input = source(); input.doctor.license_type = 'CRM';
    expect(() => assertElectronicCertificateEligible(input)).toThrow('argentina_only');
  });
  it.each(['pending', 'pending_review', 'invalid'])('blocks unvalidated doctor: %s', state => {
    const input = source(); input.profile.sss_validation_status = state;
    expect(() => assertElectronicCertificateEligible(input)).toThrow('not_validated');
  });
  it('does not treat an uploaded signature alone as a complete issuance', () => {
    const input = source(); input.doctor.stamp_image_url = null;
    expect(() => assertElectronicCertificateEligible(input)).toThrow('signature_and_stamp_required');
  });
  it.each(['2026-02-30', '2026-13-01', 'not-a-date'])('rejects impossible dates %s', date => {
    const input = source(); input.certificate.start_date = date;
    expect(() => assertElectronicCertificateEligible(input)).toThrow('period_invalid');
  });
  it('rejects an off-by-one rest period', () => {
    const input = source(); input.certificate.end_date = '2026-10-31';
    expect(() => assertElectronicCertificateEligible(input)).toThrow('period_or_diagnosis_invalid');
  });
  it('rejects identity impersonation before any storage operation', async () => {
    const admin = { storage: { from: vi.fn() } };
    await expect(issueElectronicCertificate(admin as never, source(), 'different-user', 'https://project.supabase.co'))
      .rejects.toThrow('not_owned');
    expect(admin.storage.from).not.toHaveBeenCalled();
  });
  it('resolves only the owner-specific private asset path', () => {
    const path = 'user-test/signatures/doctor-test/signature.png';
    expect(certificateAssetPath(`https://project.supabase.co/storage/v1/object/sign/medical-documents/${path}?token=expired`,
      'https://project.supabase.co', 'user-test', 'doctor-test', 'signature')).toBe(path);
  });
  it.each([
    'https://evil.invalid/storage/v1/object/sign/medical-documents/user-test/signatures/doctor-test/signature.png',
    'https://project.supabase.co/storage/v1/object/sign/medical-documents/other/signatures/doctor-test/signature.png',
    'https://project.supabase.co/storage/v1/object/sign/medical-documents/user-test/signatures/doctor-test/stamp.png',
  ])('rejects foreign or mismatched assets', url => {
    expect(() => certificateAssetPath(url, 'https://project.supabase.co', 'user-test', 'doctor-test', 'signature')).toThrow();
  });
  it('rejects oversized, corrupt and giant-dimension image input', () => {
    expect(() => assertCertificateImage(new Uint8Array(600_000))).toThrow();
    expect(() => assertCertificateImage(new Uint8Array(24))).toThrow();
    const png = new Uint8Array(24); png.set([137,80,78,71]);
    const view = new DataView(png.buffer); view.setUint32(16, 100000); view.setUint32(20, 100000);
    expect(() => assertCertificateImage(png)).toThrow('dimensions_exceeded');
  });
});
