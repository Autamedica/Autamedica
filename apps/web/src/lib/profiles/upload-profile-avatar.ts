import { logger } from '@autamedica/shared';
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers';
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

export async function handleProfileAvatarUpload(params: {
  request: Request;
  locals: App.Locals;
  userId: string;
  folder: 'doctor-profile' | 'patient-profile';
  logTag: string;
}): Promise<Response> {
  const { request, locals, userId, folder, logTag } = params;

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
    const ext = decodedImage.format === 'jpeg' ? 'jpg' : decodedImage.format;
    const filePath = `${userId}/${folder}/avatar.${ext}`;

    const { error: uploadError } = await admin.storage
      .from('avatars')
      .upload(filePath, decodedImage.bytes, {
        contentType: decodedImage.contentType,
        upsert: true,
        cacheControl: 'no-cache',
      });

    if (uploadError) {
      logger.error(`[${logTag}] Storage upload failed`, uploadError);
      return internalError('profile_photo_upload_failed');
    }

    const { data: publicUrlData } = admin.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const basePublicUrl = publicUrlData.publicUrl;
    if (!basePublicUrl) {
      logger.error(`[${logTag}] Public URL missing`, { userId, filePath });
      return internalError('profile_photo_url_failed');
    }

    const avatarUrl = `${basePublicUrl}?v=${Date.now()}`;

    const { error: updateError } = await admin
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (updateError) {
      logger.error(`[${logTag}] Profile update failed`, updateError);
      return internalError('profile_photo_update_failed');
    }

    return jsonOk({ avatarUrl });
  } catch (error) {
    logger.error(`[${logTag}] Unexpected error`, error);
    return internalError('profile_photo_internal_error');
  }
}
