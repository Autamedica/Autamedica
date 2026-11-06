import assert from 'node:assert/strict';
import test from 'node:test';
import { appointmentPermitsPrescription, buildMemedMobileLaunchUrl,
  validMemedMobileAppointment, verifiedBrazilLicense, validBrazilPatientIdentity } from './memed-mobile-policy.ts';

const appointment = '12345678-abcd-4d91-8a1f-1234567890ab';
test('accepts only UUID appointment identifiers, not arbitrary URLs', () => {
  assert.equal(validMemedMobileAppointment(appointment), true);
  for (const bad of ['', 'foo', '../admin', 'https://evil.tld', appointment + '#x']) {
    assert.equal(validMemedMobileAppointment(bad), false);
    assert.throws(() => buildMemedMobileLaunchUrl(bad));
  }
});
test('launch destination is fixed HTTPS, doctor portal, no bearer, CPF or patient ID', () => {
  const url = new URL(buildMemedMobileLaunchUrl(appointment));
  assert.equal(url.origin, 'https://doctor.autamedica.com');
  assert.equal(url.pathname, '/doctors/prescriptions/memed-mobile');
  assert.deepEqual([...url.searchParams.keys()], ['appointmentId']);
  assert.equal(url.searchParams.get('appointmentId'), appointment);
  assert.equal(url.hash, '');
});
test('only active/recent completed or in progress encounter is eligible', () => {
  const now=Date.parse('2026-11-06T10:00:00.000Z');
  assert.ok(appointmentPermitsPrescription('in_progress','2026-11-06T09:00:00.000Z',null,now,'telemedicine'));
  assert.ok(appointmentPermitsPrescription('completed','2026-11-06T09:00:00.000Z',null,now,'telemedicine'));
  assert.equal(appointmentPermitsPrescription('scheduled','2026-11-06T09:00:00.000Z',null,now,'telemedicine'),false);
  assert.equal(appointmentPermitsPrescription('in_progress','2026-11-04T09:00:00.000Z',null,now,'telemedicine'),false);
  assert.equal(appointmentPermitsPrescription('in_progress','2026-11-06T11:00:00.000Z',null,now,'telemedicine'),false);
});
test('CFM license must match exact doctor CRM and UF', () => {
  const d={active:true,license_type:'CRM',license_number:'123456',uf_brazil:'RS'};
  const valid=[{license_number:'123456',uf_brazil:'RS',status:'active',cfm_validation_status:'valid'}];
  assert.equal(verifiedBrazilLicense(d,valid),true);
  assert.equal(verifiedBrazilLicense(d,[{...valid[0],uf_brazil:'SC'}]),false);
  assert.equal(verifiedBrazilLicense({...d,active:false},valid),false);
  assert.equal(verifiedBrazilLicense({...d,license_type:'MP'},valid),false);
  assert.equal(verifiedBrazilLicense({...d,care_country:'AR'},valid),false);
});

test('patient identity requires real CPF checksum, possible DOB and a supported sex value', () => {
  const now = Date.parse('2026-11-06T13:00:00.000Z');
  // Fictional test checksum vector; no patient record or real transmission.
  assert.equal(validBrazilPatientIdentity('12345678909', '2000-01-01', 'F', now), true);
  assert.equal(validBrazilPatientIdentity('12345678900', '2000-01-01', 'F', now), false);
  assert.equal(validBrazilPatientIdentity('00000000000', '2000-01-01', 'F', now), false);
  assert.equal(validBrazilPatientIdentity('12345678909', '2026-02-30', 'F', now), false);
  assert.equal(validBrazilPatientIdentity('12345678909', '2099-01-01', 'F', now), false);
  assert.equal(validBrazilPatientIdentity('12345678909', '2000-01-01', 'unknown', now), false);
});

test('rejects non-telemedicine and unknown countries even with a matching CRM', () => {
  const now=Date.parse('2026-11-06T10:00:00.000Z');
  assert.equal(appointmentPermitsPrescription('in_progress','2026-11-06T09:00:00.000Z',null,now,'in_person'),false);
  assert.equal(appointmentPermitsPrescription('in_progress','2026-11-06T09:00:00.000Z',null,now,null),false);
  const doctor={active:true,license_type:'CRM',license_number:'123456',uf_brazil:'RS'};
  const license=[{license_number:'123456',uf_brazil:'RS',status:'active',cfm_validation_status:'valid'}];
  assert.equal(verifiedBrazilLicense(doctor,license),false);
  assert.equal(verifiedBrazilLicense({...doctor,care_country:'BR'},license),true);
});
