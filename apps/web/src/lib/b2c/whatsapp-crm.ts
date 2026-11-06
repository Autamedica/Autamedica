/**
 * Minimal, non-clinical B2C WhatsApp CRM rules for Argentina.
 * No programmatic WhatsApp sending is implemented here.
 */
export const CONTACT_BLOCKS = new Set(['do_not_contact', 'not_interested', 'no_response']);

export type B2CContact = {
  consent_status: string;
  contact_status: string;
  phone_status: string;
  phone_e164: string | null;
};

export function normalizeArPhone(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const digits = String(input).replace(/[^0-9]/g, '');
  if (/^[0-9]{10}$/.test(digits)) return '+549' + digits;
  // Argentina national trunk prefix (e.g. 011 + 8-digit local number).
  if (/^0[0-9]{10}$/.test(digits)) return '+549' + digits.slice(1);
  if (/^549[0-9]{10}$/.test(digits)) return '+' + digits;
  if (/^54[0-9]{10}$/.test(digits)) return '+' + digits;
  return null;
}

export function canOpenWhatsApp(contact: B2CContact): boolean {
  return contact.consent_status === 'verified'
    && contact.phone_status === 'valid_format'
    && Boolean(contact.phone_e164)
    && !CONTACT_BLOCKS.has(contact.contact_status);
}

export function waMeLink(contact: B2CContact): string | null {
  if (!canOpenWhatsApp(contact) || !contact.phone_e164) return null;
  return 'https://wa.me/' + contact.phone_e164.replace('+', '');
}

export function isExplicitOptOut(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const value = text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[.!?]+$/g, '').trim();
  return ['baja', 'stop', 'unsubscribe', 'no me escriban', 'no quiero recibir mensajes',
    'no contactar', 'no me contacten', 'quitarme de la lista'].includes(value);
}

export const MANUAL_OUTCOMES = {
  sent: { event: 'manual_sent', status: 'contacted' },
  replied: { event: 'manual_replied', status: 'replied' },
  interested: { event: 'manual_interested', status: 'interested' },
  not_interested: { event: 'manual_not_interested', status: 'not_interested' },
  no_response: { event: 'manual_no_response', status: 'no_response' },
  opt_out: { event: 'manual_opt_out', status: 'do_not_contact' },
} as const;
