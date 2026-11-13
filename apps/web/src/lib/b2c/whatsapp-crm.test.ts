import { describe, it, expect } from 'vitest';
import { normalizeArPhone, canOpenWhatsApp, isExplicitOptOut, waMeLink } from './whatsapp-crm';

describe('B2C WhatsApp Argentina safety rules', () => {
  it('normalizes 10 digit Argentina mobiles without guessing partial numbers', () => {
    expect(normalizeArPhone('11 1234-5678')).toBe('+5491112345678');
    expect(normalizeArPhone('011 1234-5678')).toBe('+5491112345678');
    expect(normalizeArPhone('+54 9 11 1234-5678')).toBe('+5491112345678');
    expect(normalizeArPhone('123')).toBe(null);
    expect(normalizeArPhone('')).toBe(null);
  });
  it('never opens chats without evidence and for excluded statuses', () => {
    const base = {consent_status:'verified',phone_status:'valid_format',phone_e164:'+5491112345678',contact_status:'pending'};
    expect(waMeLink(base)).toBe('https://wa.me/5491112345678');
    expect(canOpenWhatsApp({...base, consent_status:'pending'})).toBe(false);
    expect(canOpenWhatsApp({...base, contact_status:'do_not_contact'})).toBe(false);
    expect(canOpenWhatsApp({...base, contact_status:'no_response'})).toBe(false);
    expect(canOpenWhatsApp({...base, contact_status:'not_interested'})).toBe(false);
    expect(canOpenWhatsApp({...base, phone_status:'crossed_out'})).toBe(false);
  });
  it('recognizes only explicit opt-outs, not general message content', () => {
    expect(isExplicitOptOut('BAJA')).toBe(true);
    expect(isExplicitOptOut('No me escriban.')).toBe(true);
    expect(isExplicitOptOut('¿Cuánto cuesta?')).toBe(false);
  });
});