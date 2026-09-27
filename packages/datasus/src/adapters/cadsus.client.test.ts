import { describe, expect, it } from 'vitest';
import { parseCadsusPdqResponse, buildCadsusPdqEnvelope } from '../adapters/cadsus.client';
import { cadsusPdqResponseXml, cadsusNoResultXml } from '../__fixtures__/cadsus.fixture';

describe('cadsus.client', () => {
  it('builds a PDQ envelope with CNS when provided', () => {
    const envelope = buildCadsusPdqEnvelope({ cns: '123456789012345' });
    expect(envelope).toContain('123456789012345');
    expect(envelope).toContain('PRPA_IN201309UV02');
    expect(envelope).not.toContain('CPF');
  });

  it('builds a PDQ envelope with CPF when no CNS', () => {
    const envelope = buildCadsusPdqEnvelope({ cpf: '98765432100' });
    expect(envelope).toContain('98765432100');
    expect(envelope).toContain('CPF');
  });

  it('parses a found response into a CadsusPerson', () => {
    const person = parseCadsusPdqResponse(cadsusPdqResponseXml);
    expect(person).not.toBeNull();
    expect(person?.cns).toBe('123456789012345');
    expect(person?.cpf).toBe('98765432100');
    expect(person?.nome).toBe('MARIA DA SILVA');
    expect(person?.nomeMae).toBe('JOAQUINA DA SILVA');
    expect(person?.sexo).toBe('F');
    expect(person?.nascimento).toBe('19800101');
  });

  it('returns null when no CNS is present', () => {
    const person = parseCadsusPdqResponse(cadsusNoResultXml);
    expect(person).toBeNull();
  });

  it('ignores non-numeric noise in CNS/CPF', () => {
    const envelope = buildCadsusPdqEnvelope({ cns: '123.456.78901-2345' });
    expect(envelope).toContain('123456789012345');
  });
});