import { describe, expect, it } from 'vitest';
import { resolvePrescriptionProviderRoute as resolve } from './prescription-provider-route';

describe('prescription provider routing by primary medical credential', () => {
  it('selects Farmalink only for an AR doctor, AR patient and AR prescription', () => {
    expect(resolve('AR', 'AR', 'AR')).toEqual({ country: 'AR', provider: 'farmalink' });
  });

  it('selects Memed only for a BR doctor, BR patient and BR prescription', () => {
    expect(resolve('BR', 'BR', 'BR')).toEqual({ country: 'BR', provider: 'memed' });
  });

  it.each([
    ['AR', 'BR', 'BR'], ['AR', 'AR', 'BR'], ['AR', 'BR', 'AR'],
    ['BR', 'AR', 'AR'], ['BR', 'BR', 'AR'], ['BR', 'AR', 'BR'],
    ['AR', 'AR', null], ['BR', 'BR', null],
    [null, 'AR', 'AR'], [null, 'BR', 'BR'],
    ['UY', 'UY', 'UY'], [undefined, undefined, undefined],
  ])('refuses incompatible or incomplete markets: %s / %s / %s', (doctor, doc, patient) => {
    expect(resolve(doctor, doc, patient)).toBeNull();
  });
});
