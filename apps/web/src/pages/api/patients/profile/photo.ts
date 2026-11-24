/**
 * POST /api/patients/profile/photo
 *
 * Uploads the authenticated patient's avatar and stores the public URL in
 * public.profiles.avatar_url.
 */
import type { APIRoute } from 'astro';
import { PATIENT_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { handleProfileAvatarUpload } from '@/lib/profiles/upload-profile-avatar';

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, PATIENT_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  return handleProfileAvatarUpload({
    request,
    locals,
    userId: auth.user.id,
    folder: 'patient-profile',
    logTag: 'patient-profile-photo',
  });
};
