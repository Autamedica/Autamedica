/**
 * API: Doctor Signature Upload
 *
 * POST /api/doctors/signature
 * Accepts a base64-encoded PNG/WebP image of the doctor's signature or stamp.
 * Stores it in Supabase Storage and updates the doctor record.
 *
 * Body: { type: 'signature' | 'stamp', image: string (base64 data URL) }
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { badRequest, internalError, jsonOk, notFound } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';

const MAX_IMAGE_SIZE = 500 * 1024; // 500KB
type SignatureAssetType = 'signature' | 'stamp';

function jsonError(message: string, status: number): Response {
  if (status === 400) return badRequest(message);
  if (status === 404) return notFound(message);
  return internalError(message);
}

function decodeBase64Image(image: string): {
  bytes: Uint8Array;
  format: 'png' | 'webp' | 'jpeg';
  contentType: string;
} | null {
  const match = image.match(/^data:image\/(png|webp|jpeg);base64,(.+)$/);
  if (!match) return null;

  const [, format, base64Data] = match as [string, 'png' | 'webp' | 'jpeg', string];
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return {
    bytes,
    format,
    contentType: `image/${format}`,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const userId = auth.user.id;

    const body = await request.json();
    const { type, image } = body as { type?: string; image?: string };

    if (!type || !['signature', 'stamp'].includes(type)) {
      return jsonError('invalid_signature_type', 400);
    }

    if (!image || typeof image !== 'string') {
      return jsonError('missing_image_data', 400);
    }

    const decodedImage = decodeBase64Image(image);
    if (!decodedImage) {
      return jsonError('invalid_image_format', 400);
    }

    if (decodedImage.bytes.byteLength > MAX_IMAGE_SIZE) {
      return jsonError('image_too_large', 400);
    }

    // Get doctor record
    const { data: doctor, error: doctorErr } = await admin
      .from('doctors')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (doctorErr || !doctor) {
      logger.warn('[signature-upload] Doctor profile not found', { userId, error: doctorErr });
      return jsonError('doctor_profile_not_found', 404);
    }

    // Upload to Supabase Storage
    const assetType = type as SignatureAssetType;
    const ext = decodedImage.format === 'jpeg' ? 'jpg' : decodedImage.format;
    const filePath = `${userId}/signatures/${doctor.id}/${assetType}.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from('medical-documents')
      .upload(filePath, decodedImage.bytes, {
        contentType: decodedImage.contentType,
        upsert: true,
      });

    if (uploadErr) {
      logger.error('[signature-upload] Storage error', uploadErr);
      return jsonError('signature_upload_failed', 500);
    }

    // Get public/signed URL
    const { data: urlData, error: urlErr } = await admin.storage
      .from('medical-documents')
      .createSignedUrl(filePath, 10 * 365 * 24 * 60 * 60); // 10 years

    const imageUrl = urlData?.signedUrl ?? null;
    if (urlErr || !imageUrl) {
      logger.error('[signature-upload] Signed URL error', urlErr);
      return jsonError('signature_url_failed', 500);
    }

    // Update doctor record
    const column = assetType === 'signature' ? 'signature_image_url' : 'stamp_image_url';
    const { error: updateErr } = await admin
      .from('doctors')
      .update({ [column]: imageUrl } as never)
      .eq('id', doctor.id);

    if (updateErr) {
      logger.error('[signature-upload] DB update error', updateErr);
      return jsonError('signature_profile_update_failed', 500);
    }

    logger.info('[signature-upload] Success', { doctorId: doctor.id, type: assetType });

    return jsonOk({ url: imageUrl, type: assetType });
  } catch (error) {
    logger.error('[signature-upload] Unexpected error', error);
    return jsonError('signature_internal_error', 500);
  }
};
