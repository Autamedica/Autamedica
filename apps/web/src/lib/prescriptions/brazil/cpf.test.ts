import { describe, expect, it } from 'vitest';
import { validCpf } from './cpf';

describe('validCpf', () => {
  it.each(['52998224725', '529.982.247-25', '11144477735'])('accepts valid CPF %s', (value) => {
    expect(validCpf(value)).toBe(true);
  });

  it.each([
    '00000000000',
    '11111111111',
    '99999999999',
    '52998224724',
    '12345678900',
    '123',
    '',
    'abcdefghijk',
  ])('rejects invalid CPF %s', (value) => {
    expect(validCpf(value)).toBe(false);
  });
});
