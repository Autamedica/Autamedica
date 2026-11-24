import { describe, expect, it } from 'vitest';
import {
  getPublicProfileCredentials,
  getVisibleProfileSections,
  toEditorialEntries,
  toStringEntries,
} from './public-profile-view';

describe('public doctor profile view model', () => {
  it('formats only AR MN/MP credentials', () => {
    const credentials = getPublicProfileCredentials({
      care_country: 'AR',
      licenses: [
        { license_type: 'MN', license_number: '12345' },
        { license_type: 'MP', license_number: '67890' },
        { license_type: 'CRM', license_number: 'ignored' },
      ],
      rqe_number: 'not-public-in-AR',
    });

    expect(credentials).toEqual({
      licenses: ['MN 12345', 'MP 67890'],
      rqe: '',
      verified: true,
    });
  });

  it('formats BR CRM by UF and keeps RQE separate from verified CRM', () => {
    const credentials = getPublicProfileCredentials({
      care_country: 'BR',
      uf_brazil: 'rs',
      licenses: [{ license_type: 'CRM', license_number: '123456' }],
      rqe_number: '98765',
    });

    expect(credentials).toEqual({
      licenses: ['CRM/RS 123456'],
      rqe: '98765',
      verified: true,
    });
  });

  it('hides all optional sections for a minimum profile', () => {
    expect(getVisibleProfileSections({
      care_country: 'AR',
      bio: null,
      years_experience: 0,
      education: [],
      certifications: [],
      clinical_focus_areas: [],
      professional_experience: [],
      academic_activity: [],
      licenses: [{ license_type: 'MN', license_number: '321' }],
    })).toEqual({
      practice: false,
      education: false,
      experience: false,
      academic: false,
      verification: true,
    });
  });

  it('renders optional sections only when real content exists', () => {
    expect(getVisibleProfileSections({
      care_country: 'BR',
      bio: 'Cardiologia clínica.',
      years_experience: 12,
      education: [{ degree: 'Medicina', university: 'UFRGS', year: '2010' }],
      certifications: [],
      clinical_focus_areas: ['Hipertensão'],
      professional_experience: [{ hospital: 'Hospital Regional', position: 'Médico' }],
      academic_activity: [],
      licenses: [],
    })).toEqual({
      practice: true,
      education: true,
      experience: true,
      academic: false,
      verification: false,
    });
  });

  it('normalizes object and string entries without exposing empty placeholders', () => {
    expect(toEditorialEntries([{ degree: 'Medicina', university: 'UFRGS', year: '2010' }, null]))
      .toEqual([{ title: 'Medicina', institution: 'UFRGS', period: '2010', detail: undefined }]);
    expect(toStringEntries(['Hipertensão', '', { label: 'Prevenção' }]))
      .toEqual(['Hipertensão', 'Prevenção']);
  });
});
