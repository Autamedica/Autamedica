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
import { requireSession } from '@autamedica/auth';
import { createServerClientFromRequest } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';

const MAX_IMAGE_SIZE = 500 * 1024; // 500KB

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await requireSession(request);
    const supabase = createServerClientFromRequest(request);
    const userId = session.user.id;

    const body = await request.json();
    const { type, image } = body as { type?: string; image?: string };

    if (!type || !['signature', 'stamp'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid type. Must be "signature" or "stamp"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!image || typeof image !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing image data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse base64 data URL
    const match = image.match(/^data:image\/(png|webp|jpeg);base64,(.+)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'Invalid image format. Must be PNG, WebP, or JPEG base64 data URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [, format, base64Data] = match;
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > MAX_IMAGE_SIZE) {
      return new Response(JSON.stringify({ error: `Image too large. Max ${MAX_IMAGE_SIZE / 1024}KB` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get doctor record
    const { data: doctor, error: doctorErr } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (doctorErr || !doctor) {
      return new Response(JSON.stringify({ error: 'Doctor profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Upload to Supabase Storage
    const ext = format === 'jpeg' ? 'jpg' : format;
    const filePath = `signatures/${doctor.id}/${type}.${ext}`;
    const contentType = `image/${format}`;

    const { error: uploadErr } = await supabase.storage
      .from('medical-documents')
      .upload(filePath, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadErr) {
      logger.error('[signature-upload] Storage error', uploadErr);
      return new Response(JSON.stringify({ error: 'Upload failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get public/signed URL
    const { data: urlData } = await supabase.storage
      .from('medical-documents')
      .createSignedUrl(filePath, 10 * 365 * 24 * 60 * 60); // 10 years

    const imageUrl = urlData?.signedUrl ?? null;

    // Update doctor record
    const column = type === 'signature' ? 'signature_image_url' : 'stamp_image_url';
    const { error: updateErr } = await supabase
      .from('doctors')
      .update({ [column]: imageUrl })
      .eq('id', doctor.id);

    if (updateErr) {
      logger.error('[signature-upload] DB update error', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to update profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    logger.info('[signature-upload] Success', { doctorId: doctor.id, type });

    return new Response(JSON.stringify({ url: imageUrl, type }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if ((error as { name?: string }).name === 'RedirectError') {
      const redirectUrl = (error as { url: string }).url;
      return new Response(null, { status: 302, headers: { Location: redirectUrl } });
    }

    logger.error('[signature-upload] Unexpected error', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
