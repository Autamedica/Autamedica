import { describe, expect, it, vi } from 'vitest';

const uploadMock = vi.fn(async () => ({ data: { path: 'archives/DOC-0123456789ABCDEF0123456789ABCDEF.pdf' }, error: null }));
const patientLinkInsertMock = vi.fn(async () => ({ error: null }));
const archiveInsertMock = vi.fn(() => ({
  select: () => ({
    single: async () => ({ data: { id: 'arch-1' }, error: null }),
  }),
}));

// Minimal valid 1x1 PNG bytes for signature & stamp assets
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

vi.mock('@/lib/api-auth', () => ({
  withAuthRole: vi.fn(async () => ({ user: { id: 'user-doc-1' }, role: 'doctor' })),
  isAuthed: () => true,
}));

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    storage: {
      from: () => ({
        download: vi.fn(async () => ({
          data: { arrayBuffer: async () => PNG_BYTES.buffer },
          error: null,
        })),
        upload: uploadMock,
      }),
    },
    from: (table: string) => {
      if (table === 'doctors') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'doc-1',
                  user_id: 'user-doc-1',
                  active: true,
                  license_type: 'CRM',
                  license_number: '123456',
                  enrollment_jurisdiction: null,
                  uf_brazil: 'SP',
                  signature_image_url: 'https://proj.supabase.co/storage/v1/object/public/medical-documents/signatures/user-doc-1/sig.png',
                  stamp_image_url: 'https://proj.supabase.co/storage/v1/object/public/medical-documents/stamps/user-doc-1/stamp.png',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { first_name: 'Ana', last_name: 'Silva', role: 'doctor', active: true, deleted_at: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'medical_document_archives') {
        return { insert: archiveInsertMock };
      }
      if (table === 'medical_document_archive_patient_links') {
        return { insert: patientLinkInsertMock };
      }
      return { insert: vi.fn(async () => ({ error: null })) };
    },
  }),
}));

import { POST } from './document-archives';

describe('POST /api/doctors/document-archives integration contract', () => {
  it('uploads the original PDF to Storage and links the archive to the patient when patient_id is provided', async () => {
    const form = new FormData();
    form.set('reference', 'DOC-0123456789ABCDEF0123456789ABCDEF');
    form.set('document_date', '2026-11-19');
    form.set('patient_id', '33333333-3333-4333-8333-333333333333');
    form.set('patient_name', 'João Souza');
    form.set('patient_document', '12345678901');
    form.set('document_type', 'Atestado Médico ICP-Brasil');
    form.set(
      'authorization_statement',
      'Confirmo que emití este documento y autorizo su registro para verificación de integridad en AutaMedica.',
    );
    form.set('pdf', new File([new TextEncoder().encode('%PDF-1.7\n%mock-icp-brasil\n')], 'atestado.pdf', { type: 'application/pdf' }));

    const request = new Request('https://autamedica.com/api/doctors/document-archives', {
      method: 'POST',
      headers: { origin: 'https://autamedica.com' },
      body: form,
    });

    const response = await POST({
      request,
      locals: { runtime: { env: { PUBLIC_SUPABASE_URL: 'https://proj.supabase.co' } } },
    } as never);

    expect(response.status).toBe(201);
    expect(archiveInsertMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(patientLinkInsertMock).toHaveBeenCalledTimes(1);
  });
});
