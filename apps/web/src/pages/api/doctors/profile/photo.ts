/**
 * POST /api/doctors/profile/photo
 *
 * Uploads the authenticated doctor's professional avatar and stores the public
 * URL in public.profiles.avatar_url.
 */
import type { APIRoute } from 'astro';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { handleProfileAvatarUpload } from '@/lib/profiles/upload-profile-avatar';

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  return handleProfileAvatarUpload({
    request,
    locals,
    userId: auth.user.id,
    folder: 'doctor-profile',
    logTag: 'doctor-profile-photo',
  });
};
