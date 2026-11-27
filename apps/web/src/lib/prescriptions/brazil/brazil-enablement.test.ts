import { describe, expect, it } from 'vitest';
import {
  buildBrazilEnablementSummary,
  computeEffectiveBrazilCapabilities,
  parseAdminVerifyEnablement,
  parseDoctorEnablementPatch,
} from './brazil-enablement';

describe('brazil-enablement', () => {
  it('blocks doctor self-approval statuses in PATCH parser', () => {
    const res = parseDoctorEnablementPatch({ icpBrasilStatus: 'verified' });
    expect(res.ok).toBe(false);

    const sncrRes = parseDoctorEnablementPatch({ sncrB1Status: 'verified' });
    expect(sncrRes.ok).toBe(false);
  });

  it('accepts valid doctor self-progress updates', () => {
    const res = parseDoctorEnablementPatch({
      professionalAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP',
      icpBrasilStatus: 'requested_cfm_free',
      icpProvider: 'cfm_cloud_a3',
      sncrB1Status: 'visa_requested',
      sncrVisaUf: 'sp',
      sncrVisaMunicipality: 'São Paulo',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.sncrVisaUf).toBe('SP');
      expect(res.value.icpProvider).toBe('cfm_cloud_a3');
    }
  });

  it('enforces progressive capability gating from simple -> rce_ret -> controlled_b1', () => {
    const simpleOnly = computeEffectiveBrazilCapabilities({
      doctorActive: true,
      cfmValidated: true,
      hasCpf: true,
      hasProfessionalAddress: false,
      memedLinkStatus: 'linked_untested',
      icpBrasilStatus: 'self_reported_active',
      icpExpiresAt: null,
      sncrB1Status: 'not_requested',
      sncrVisaUf: 'RS',
    });
    expect(simpleOnly).toEqual({
      canIssueSimpleRx: true,
      canIssueRceRetRx: false,
      canIssueControlledB1: false,
    });

    const fullB1 = computeEffectiveBrazilCapabilities({
      doctorActive: true,
      cfmValidated: true,
      hasCpf: true,
      hasProfessionalAddress: true,
      memedLinkStatus: 'test_emission_verified',
      icpBrasilStatus: 'verified',
      icpExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      sncrB1Status: 'verified',
      sncrVisaUf: 'RS',
    });
    expect(fullB1).toEqual({
      canIssueSimpleRx: true,
      canIssueRceRetRx: true,
      canIssueControlledB1: true,
    });
  });

  it('parses admin verification payload and builds 7-stage summary', () => {
    const parsed = parseAdminVerifyEnablement({
      memedLinkStatus: 'test_emission_verified',
      icpBrasilStatus: 'verified',
      sncrB1Status: 'verified',
      sncrVisaUf: 'rs',
      sncrReviewNotes: 'Validado com PDF de teste e guia SNCR.',
    });
    expect(parsed.ok).toBe(true);

    const summary = buildBrazilEnablementSummary({
      doctorId: 'doc-1',
      doctorActive: true,
      licenseNumber: '12345',
      ufBrazil: 'RS',
      cfmValidated: true,
      hasCpf: true,
      hasBirthDate: true,
      professionalAddress: 'Rua dos Andradas, 1000 - Porto Alegre',
      credentialRow: {
        memed_link_status: 'test_emission_verified',
        icp_brasil_status: 'verified',
        icp_provider: 'vidaas',
        sncr_b1_status: 'self_reported_active',
        sncr_visa_uf: 'RS',
        can_issue_simple_rx: true,
        can_issue_rce_ret_rx: true,
        can_issue_controlled_b1: false,
      },
    });
    expect(summary.stages).toHaveLength(7);
    expect(summary.completedStages).toBe(5);
    expect(summary.capabilities.canIssueRceRetRx).toBe(true);
    expect(summary.capabilities.canIssueControlledB1).toBe(false);
  });
});
