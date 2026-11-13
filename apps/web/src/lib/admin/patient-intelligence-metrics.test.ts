import { describe, expect, it } from 'vitest';
import { coverageLabel, summarizePatientQuality } from './patient-intelligence-metrics';

describe('population metric definitions', () => {
  it.each([null, {}, { has_paid: true }, { plan: '210' }, { provider: ' ' }, []])(
    'does not infer coverage or self-payment from missing provider data: %j', info => {
      expect(coverageLabel(info)).toBe('Cobertura desconocida');
    },
  );
  it('does not count the legacy Sin especificar placeholder as a reported address', () => {
    const rows = ['Sin especificar', '  SIN ESPECIFICAR  ', ' ', null, 'Somewhere'].map(address => ({
      user_id: null, birth_date: null, insurance_info: null, address,
    }));
    expect(summarizePatientQuality(rows).quality.with_address).toBe(1);
  });
  it('accepts an explicitly recorded provider and legacy coverage names', () => {
    expect(coverageLabel({ provider: ' OSDE ', name: 'Other' })).toBe('OSDE');
    expect(coverageLabel({ obra_social: 'Legacy' })).toBe('Legacy');
  });
  it('separates enabled records from authenticated people and missing demographic fields', () => {
    const result = summarizePatientQuality([
      { user_id: 'one', birth_date: null, address: ' ', insurance_info: {} },
      { user_id: 'one', birth_date: '1990-01-01', address: 'Somewhere', insurance_info: { provider: 'Named' } },
      { user_id: null, birth_date: null, address: null, insurance_info: { has_paid: true } },
    ]);
    expect(result.quality).toEqual({
      active_records: 3, linked_records: 2, linked_users: 1, unlinked_records: 1,
      with_birth_date: 1, with_address: 1, coverage_unknown: 2,
    });
    expect(result.by_insurance).toEqual({ 'Cobertura desconocida': 2, Named: 1 });
  });
});
