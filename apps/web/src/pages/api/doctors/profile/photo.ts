/**
 * POST /api/doctors/profile/photo
 *
 * Uploads the authenticated doctor's professional avatar and stores the public
 * URL in public.profiles.avatar_url.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

function decodeImage(image: string): {
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
    const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
    const image = body?.image;

    if (typeof image !== 'string') {
      return badRequest('missing_image_data');
    }

    const decodedImage = decodeImage(image);
    if (!decodedImage) {
      return badRequest('invalid_image_format');
    }

    if (decodedImage.bytes.byteLength > MAX_IMAGE_SIZE) {
      return badRequest('image_too_large');
    }

    const admin = createAstroAdminClient(locals.runtime?.env);
    const userId = auth.user.id;
    const ext = decodedImage.format === 'jpeg' ? 'jpg' : decodedImage.format;
    const filePath = `${userId}/doctor-profile/avatar.${ext}`;

    const { error: uploadError } = await admin.storage
      .from('avatars')
      .upload(filePath, decodedImage.bytes, {
        contentType: decodedImage.contentType,
        upsert: true,
        cacheControl: 'no-cache',
      });

    if (uploadError) {
      logger.error('[doctor-profile-photo] Storage upload failed', uploadError);
      return internalError('profile_photo_upload_failed');
    }

    const { data: publicUrlData } = admin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = publicUrlData.publicUrl;
    if (!avatarUrl) {
      logger.error('[doctor-profile-photo] Public URL missing', { userId, filePath });
      return internalError('profile_photo_url_failed');
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) {
      logger.error('[doctor-profile-photo] Profile update failed', updateError);
      return internalError('profile_photo_update_failed');
    }

    return jsonOk({ avatarUrl });
  } catch (error) {
    logger.error('[doctor-profile-photo] Unexpected error', error);
    return internalError('profile_photo_internal_error');
  }
};
