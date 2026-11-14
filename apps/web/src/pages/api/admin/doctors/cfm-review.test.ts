import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  role: 'admin',
  license: {
    id: 'license-1',
    doctor_id: 'doctor-1',
    license_type: 'CRM',
    uf_brazil: 'RS',
    cfm_evidence_path: null as string | null,
  },
  createAdmin: vi.fn(),
  upload: vi.fn(),
  rpc: vi.fn(),
  reviewedLicense: null as Record<string, unknown> | null,
}));

vi.mock('@autamedica/shared', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: state.createAdmin }));

import { POST } from './cfm-review';

function makeRequest(options: { status?: string; notes?: string; evidence?: File | null } = {}) {
  const form = new FormData();
  form.set('licenseId', 'license-1');
  form.set('status', options.status ?? 'valid');
  form.set('reviewNotes', options.notes ?? 'Consulta oficial CFM realizada e dados conferidos.');
  if (options.evidence) form.set('evidence', options.evidence);
  return new Request('https://autamedica.test/api/admin/doctors/cfm-review', {
    method: 'POST',
    headers: { authorization: 'Bearer test-admin' },
    body: form,
  });
}

async function invoke(request: Request) {
  return POST({
    request,
    locals: { runtime: { env: {} }, session: { user: { id: 'reviewer-1' } } },
  } as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
  state.role = 'admin';
  state.license = {
    id: 'license-1',
    doctor_id: 'doctor-1',
    license_type: 'CRM',
    uf_brazil: 'RS',
    cfm_evidence_path: null,
  };
  state.upload.mockReset().mockResolvedValue({ data: { path: 'stored/path.pdf' }, error: null });
  state.rpc.mockReset().mockImplementation((_functionName: string, args: {
    p_cfm_status: string;
    p_license_status: string;
    p_reason: string;
    p_evidence_path: string | null;
    p_actor_id: string;
  }) => {
    state.reviewedLicense = {
      ...state.license,
      cfm_validation_status: args.p_cfm_status,
      status: args.p_license_status,
      cfm_review_notes: args.p_reason,
      cfm_reviewed_by: args.p_actor_id,
      cfm_reviewed_at: '2026-11-14T00:00:00.000Z',
      cfm_last_checked_at: '2026-11-14T00:00:00.000Z',
      cfm_evidence_path: args.p_evidence_path,
    };
    return Promise.resolve({ error: null });
  });
  state.reviewedLicense = null;
  state.createAdmin.mockReset().mockReturnValue({
    auth: { getUser: vi.fn() },
    rpc: state.rpc,
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { role: state.role }, error: null }) }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.license, error: null }),
            single: async () => ({ data: state.reviewedLicense ?? state.license, error: null }),
          }),
        }),
      };
    },
    storage: {
      from: () => ({
        upload: state.upload,
        createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.test/signed-proof' }, error: null }),
        remove: async () => ({ error: null }),
      }),
    },
  });
});

describe('POST /api/admin/doctors/cfm-review', () => {
  it('rejects non-admin staff before reading or uploading evidence', async () => {
    state.role = 'doctor';
    const response = await invoke(makeRequest({
      evidence: new File(['%PDF-1.7'], 'proof.pdf', { type: 'application/pdf' }),
    }));
    expect(response.status).toBe(401);
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('requires an evidence file before marking a CRM valid', async () => {
    const response = await invoke(makeRequest());
    expect(response.status).toBe(400);
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('accepts an authenticated, evidenced manual review and activates only the reviewed CRM', async () => {
    const response = await invoke(makeRequest({
      evidence: new File(['%PDF-1.7\nCFM proof'], 'proof.pdf', { type: 'application/pdf' }),
    }));
    const payload = await response.json() as { success?: boolean; data?: { license?: { cfm_evidence_url?: string } } };
    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(state.upload).toHaveBeenCalledOnce();
    expect(state.rpc).toHaveBeenCalledWith('admin_review_cfm_license', expect.objectContaining({
      p_license_id: 'license-1',
      p_cfm_status: 'valid',
      p_license_status: 'active',
      p_reason: 'Consulta oficial CFM realizada e dados conferidos.',
      p_actor_id: 'reviewer-1',
      p_evidence_path: expect.stringMatching(/^doctor-1\\/license-1\\/.+\\.pdf$/),
    }));
    expect(payload.data?.license?.cfm_evidence_url).toBe('https://storage.test/signed-proof');
  });

  it('rejects a declared PDF whose file signature is not PDF', async () => {
    const response = await invoke(makeRequest({
      evidence: new File(['not a document'], 'proof.pdf', { type: 'application/pdf' }),
    }));
    expect(response.status).toBe(400);
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('does not allow the manual CFM workflow to update a non-CRM license', async () => {
    state.license = { ...state.license, license_type: 'MP' };
    const response = await invoke(makeRequest({
      evidence: new File(['%PDF-1.7'], 'proof.pdf', { type: 'application/pdf' }),
    }));
    expect(response.status).toBe(400);
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
