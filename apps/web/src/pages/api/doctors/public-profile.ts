import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { logger } from '@autamedica/shared';

const CONSENT_VERSION = 'public-doctor-profile-v1';
const EDITABLE_ARRAYS = [
  'education',
  'certifications',
  'clinical_focus_areas',
  'professional_experience',
  'academic_activity',
] as const;

type EditableArrayKey = (typeof EDITABLE_ARRAYS)[number];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

function parseLines(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (typeof value === 'string') {
    const entries = value.split('\n').map((entry) => entry.trim()).filter(Boolean);
    if (entries.length > maxItems || entries.some((entry) => entry.length > maxLength)) return null;
    return entries;
  }
  if (Array.isArray(value)) {
    if (value.length > maxItems || value.some((entry) => typeof entry !== 'string' || entry.trim().length > maxLength)) {
      return null;
    }
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  return null;
}

// Supabase's generated Database types predate the additive migration on this branch.
// The route uses a server-only admin client and a strictly allowlisted column set.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDoctor(admin: any, userId: string) {
  return admin
    .from('doctors')
    .select('id,care_country,specialty,subspecialty,bio,years_experience,education,certifications,clinical_focus_areas,professional_experience,academic_activity,public_profile_enabled,public_profile_consent_confirmed_at,public_profile_consent_version,profile:profiles!inner(first_name,last_name,avatar_url)')
    .eq('user_id', userId)
    .maybeSingle();
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAstroAdminClient(locals.runtime?.env) as any;
    const { data, error } = await getDoctor(admin, auth.user.id);
    if (error) throw error;
    if (!data) return jsonResponse({ error: 'doctor_profile_not_found' }, 404);

    return jsonResponse({
      data: {
        id: data.id,
        care_country: data.care_country,
        first_name: data.profile?.first_name ?? null,
        last_name: data.profile?.last_name ?? null,
        avatar_url: data.profile?.avatar_url ?? null,
        specialty: data.specialty,
        subspecialty: data.subspecialty,
        bio: data.bio,
        years_experience: data.years_experience,
        education: data.education,
        certifications: data.certifications,
        clinical_focus_areas: data.clinical_focus_areas,
        professional_experience: data.professional_experience,
        academic_activity: data.academic_activity,
        public_profile_enabled: data.public_profile_enabled,
        public_profile_consent_confirmed_at: data.public_profile_consent_confirmed_at,
        public_profile_consent_version: data.public_profile_consent_version,
      },
    });
  } catch (error) {
    logger.error('[api/doctors/public-profile] GET failed', error);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'invalid_body' }, 400);
    }
    const input = body as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAstroAdminClient(locals.runtime?.env) as any;
    const { data: doctor, error: doctorError } = await getDoctor(admin, auth.user.id);
    if (doctorError) throw doctorError;
    if (!doctor) return jsonResponse({ error: 'doctor_profile_not_found' }, 404);

    const patch: Record<string, unknown> = {};
    const limits: Record<EditableArrayKey, { maxItems: number; maxLength: number }> = {
      education: { maxItems: 30, maxLength: 240 },
      certifications: { maxItems: 30, maxLength: 240 },
      clinical_focus_areas: { maxItems: 20, maxLength: 120 },
      professional_experience: { maxItems: 30, maxLength: 240 },
      academic_activity: { maxItems: 30, maxLength: 240 },
    };

    for (const key of EDITABLE_ARRAYS) {
      if (key in input) {
        const parsed = parseLines(input[key], limits[key].maxItems, limits[key].maxLength);
        if (!parsed) return jsonResponse({ error: `invalid_${key}` }, 400);
        patch[key] = parsed;
      }
    }

    if (typeof input.public_profile_enabled === 'boolean') {
      if (input.public_profile_enabled) {
        const acknowledged = input.consentAcknowledged === true;
        const previouslyConfirmed = Boolean(
          doctor.public_profile_consent_confirmed_at
          && doctor.public_profile_consent_version,
        );
        if (!acknowledged && !previouslyConfirmed) {
          return jsonResponse({ error: 'public_profile_consent_required' }, 400);
        }
        patch.public_profile_enabled = true;
        if (acknowledged) {
          patch.public_profile_consent_confirmed_at = new Date().toISOString();
          patch.public_profile_consent_version = CONSENT_VERSION;
        }
      } else {
        patch.public_profile_enabled = false;
      }
    }

    if (!Object.keys(patch).length) return jsonResponse({ error: 'no_editable_fields' }, 400);

    const { data: updated, error: updateError } = await admin
      .from('doctors')
      .update(patch)
      .eq('id', doctor.id)
      .eq('user_id', auth.user.id)
      .select('id,public_profile_enabled,public_profile_consent_confirmed_at,public_profile_consent_version,education,certifications,clinical_focus_areas,professional_experience,academic_activity')
      .single();
    if (updateError) throw updateError;

    return jsonResponse({ data: updated });
  } catch (error) {
    logger.error('[api/doctors/public-profile] PATCH failed', error);
    return jsonResponse({ error: 'internal_error' }, 500);
  }
};
