import { describe, expect, it } from 'vitest';
import { buildInvestorXlsx } from './investor-xlsx';

describe('buildInvestorXlsx', () => {
  it('creates an OOXML workbook ZIP with an investor sheet and filters', () => {
    const bytes = buildInvestorXlsx([{
      organization_name: 'Fondo Health & Tech',
      contact_name: 'Ana Pérez',
      role_title: 'Partner',
      country_code: 'AR',
      stage_focus: ['Seed', 'Serie A'],
      fit_score: 92,
      priority: 'A',
      status: 'qualified',
      linkedin_url: 'https://www.linkedin.com/in/ana-perez',
    }]);

    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const archiveText = new TextDecoder().decode(bytes);
    expect(archiveText).toContain('[Content_Types].xml');
    expect(archiveText).toContain('xl/workbook.xml');
    expect(archiveText).toContain('xl/worksheets/sheet1.xml');
    expect(archiveText).toContain('Inversores');
    expect(archiveText).toContain('Fondo Health &amp; Tech');
    expect(archiveText).toContain('Ana Pérez');
    expect(archiveText).toContain('autoFilter');
  });

  it('creates a valid empty workbook without losing its header row', () => {
    const bytes = buildInvestorXlsx([]);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(bytes)).toContain('Fondo / Organización');
  });
});
