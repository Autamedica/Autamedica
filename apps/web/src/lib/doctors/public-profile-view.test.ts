import { describe, expect, it } from 'vitest';
import {
  getPublicProfileCredentials,
  getVisibleProfileSections,
  isTestimonialsEnabled,
  shouldShowTestimonials,
  toVerifiedTestimonials,
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


describe('jurisdictional verified testimonials', () => {
  const reviews = [
    { comment: 'Explicó el tratamiento con claridad.', created_at: '2026-11-20T12:00:00Z' },
    { comment: 'Fue puntual y escuchó mis dudas.' },
  ];

  it('keeps AR and BR flags independent', () => {
    expect(isTestimonialsEnabled('AR', { AR: true, BR: false })).toBe(true);
    expect(isTestimonialsEnabled('BR', { AR: true, BR: false })).toBe(false);
    expect(isTestimonialsEnabled('AR', {})).toBe(false);
  });

  it('shows testimonials only when that jurisdiction is enabled and verified comments exist', () => {
    const ar = { care_country: 'AR' as const, testimonials: reviews };
    const br = { care_country: 'BR' as const, testimonials: reviews };
    expect(shouldShowTestimonials(ar, { AR: true, BR: false })).toBe(true);
    expect(shouldShowTestimonials(br, { AR: true, BR: false })).toBe(false);
    expect(shouldShowTestimonials(ar, { AR: true })).toBe(true);
    expect(shouldShowTestimonials(ar, { AR: true })).toBe(true);
  });

  it('does not render a testimonial section when no completed-consultation comments are returned', () => {
    expect(shouldShowTestimonials(
      { care_country: 'AR', testimonials: [] },
      { AR: true, BR: true },
    )).toBe(false);
    expect(shouldShowTestimonials(
      { care_country: 'BR', testimonials: [{ comment: '  ' }] },
      { AR: true, BR: true },
    )).toBe(false);
  });

  it('normalizes only non-empty verified comment records', () => {
    expect(toVerifiedTestimonials([
      { comment: '  Buen trato.  ', created_at: '2026-11-20' },
      { comment: '' },
      null,
      { comment: 42 },
    ])).toEqual([{ comment: 'Buen trato.', created_at: '2026-11-20' }]);
  });
});
