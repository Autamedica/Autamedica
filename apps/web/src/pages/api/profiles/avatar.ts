/**
 * API: Profile Avatar Upload
 * 
 * POST /api/profiles/avatar
 * Accepts a base64-encoded image for the user's avatar.
 * Stores it in Supabase Storage and updates the profile record.
 * 
 * Body: { image: string (base64 data URL) }
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { badRequest, internalError, jsonOk, notFound } from '@/lib/api-helpers';
import { isAuthed, withAuth } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';

const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB for avatars

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
  const auth = await withAuth(request, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const userId = auth.user.id;

    const body = await request.json();
    const { image } = body as { image?: string };

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

    // Upload to Supabase Storage
    const ext = decodedImage.format === 'jpeg' ? 'jpg' : decodedImage.format;
    const filePath = `avatars/${userId}/avatar.${ext}`;

    // We'll use 'public-assets' bucket if it exists, or 'medical-documents' as fallback
    // Actually, looking at the project, 'medical-documents' is already used for signatures.
    // For avatars, a public bucket would be better, but let's stick to 'medical-documents'
    // or try to use 'public-assets' if it's common in this repo.
    // I'll check if 'public-assets' bucket is mentioned anywhere.
    const bucketName = 'medical-documents'; 

    const { error: uploadErr } = await admin.storage
      .from(bucketName)
      .upload(filePath, decodedImage.bytes, {
        contentType: decodedImage.contentType,
        upsert: true,
      });

    if (uploadErr) {
      logger.error('[avatar-upload] Storage error', uploadErr);
      return jsonError('avatar_upload_failed', 500);
    }

    // Get signed URL (10 years)
    const { data: urlData, error: urlErr } = await admin.storage
      .from(bucketName)
      .createSignedUrl(filePath, 10 * 365 * 24 * 60 * 60);

    const imageUrl = urlData?.signedUrl ?? null;
    if (urlErr || !imageUrl) {
      logger.error('[avatar-upload] Signed URL error', urlErr);
      return jsonError('avatar_url_failed', 500);
    }

    // Update profile record
    const { error: updateErr } = await admin
      .from('profiles')
      .update({ avatar_url: imageUrl } as never)
      .eq('user_id', userId);

    if (updateErr) {
      logger.error('[avatar-upload] DB update error', updateErr);
      return jsonError('avatar_profile_update_failed', 500);
    }

    logger.info('[avatar-upload] Success', { userId });

    return jsonOk({ url: imageUrl });
  } catch (error) {
    logger.error('[avatar-upload] Unexpected error', error);
    return jsonError('avatar_internal_error', 500);
  }
};
