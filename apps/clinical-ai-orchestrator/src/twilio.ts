import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CanonicalInboundEnvelope,
  CanonicalMediaItemEnvelope,
  SupportedCommand,
  TwilioInboundForm,
} from './types.js';

function getString(form: Record<string, unknown>, key: string): string | undefined {
  const value = form[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseTwilioForm(form: Record<string, unknown>): TwilioInboundForm {
  const result: TwilioInboundForm = {};
  for (const [key, value] of Object.entries(form)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }

  return result;
}

export function computeTwilioSignature(authToken: string, url: string, form: TwilioInboundForm): string {
  const sortedKeys = Object.keys(form).sort((left, right) => left.localeCompare(right));
  let payload = url;

  for (const key of sortedKeys) {
    const value = form[key];
    if (value !== undefined) {
      payload += key + value;
    }
  }

  return createHmac('sha1', authToken).update(payload).digest('base64');
}

export function validateTwilioSignature(
  authToken: string,
  url: string,
  signature: string,
  form: TwilioInboundForm
): boolean {
  const expected = computeTwilioSignature(authToken, url, form);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature || '');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function extractMediaItems(form: TwilioInboundForm): CanonicalMediaItemEnvelope[] {
  const numMedia = Number.parseInt(form.NumMedia || '0', 10);
  if (!Number.isFinite(numMedia) || numMedia <= 0) {
    return [];
  }

  const mediaItems: CanonicalMediaItemEnvelope[] = [];
  for (let index = 0; index < numMedia; index += 1) {
    const providerMediaUrl = form[`MediaUrl${index}`];
    const contentType = form[`MediaContentType${index}`];

    if (providerMediaUrl && contentType) {
      mediaItems.push({
        providerMediaIndex: index,
        providerMediaUrl,
        contentType,
      });
    }
  }

  return mediaItems;
}

export function buildCanonicalInboundEnvelope(form: TwilioInboundForm, receivedAt: Date): CanonicalInboundEnvelope {
  const providerMessageId = form.MessageSid;
  const senderChannelId = form.From;
  const recipientChannelId = form.To;

  if (!providerMessageId || !senderChannelId || !recipientChannelId) {
    throw new Error('Missing required Twilio webhook fields');
  }

  const mediaItems = extractMediaItems(form);

  return {
    provider: 'twilio',
    providerMessageId,
    channel: 'whatsapp',
    senderChannelId,
    recipientChannelId,
    messageText: form.Body || '',
    numMedia: mediaItems.length,
    mediaItems,
    receivedAt: receivedAt.toISOString(),
    ...(form.AccountSid ? { providerAccountId: form.AccountSid } : {}),
    ...(form.WaId ? { senderWaId: form.WaId } : {}),
    ...(form.ProfileName ? { senderProfileName: form.ProfileName } : {}),
    ...(form.MessageStatus ? { messageStatus: form.MessageStatus } : {}),
  };
}

export function extractCommand(messageText: string): SupportedCommand | null {
  const normalized = messageText.trim().toLowerCase();

  if (normalized === '/finalizar') {
    return 'finalizar';
  }

  if (normalized === '/cancelar') {
    return 'cancelar';
  }

  if (normalized === '/estado') {
    return 'estado';
  }

  return null;
}

export function hasAudioMedia(form: TwilioInboundForm): boolean {
  return extractMediaItems(form).some((item) => item.contentType.startsWith('audio/'));
}

export function getTwilioMessageId(form: Record<string, unknown>): string | undefined {
  return getString(form, 'MessageSid');
}
