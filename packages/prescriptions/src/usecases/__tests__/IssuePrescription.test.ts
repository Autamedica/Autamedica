import { describe, it, expect, vi } from 'vitest';
import { IssuePrescriptionUseCase } from '../IssuePrescription';
import type { 
  IPrescriptionRepository, 
  IPrescriptionVendor, 
  IIdentityValidator,
  PrescriptionDraft,
} from '../../domain/ports';

const mockDraft: PrescriptionDraft = {
  patient: {
    patientId: 'pat-1' as any,
    cuil: '20123456789',
    dni: '12345678' as any,
    fullName: 'John Doe'
  },
  prescriber: {
    doctorId: 'doc-1' as any,
    matriculaNumber: '12345',
    matriculaType: 'MN',
    fullName: 'Dr. Smith'
  },
  organizationId: 'org-1' as any,
  items: [],
  type: 'medication',
  status: 'draft' as any
};

describe('IssuePrescriptionUseCase', () => {
  it('should issue a prescription successfully', async () => {
    const repo = {
      saveDraft: vi.fn().mockResolvedValue('pres-1'),
      markAsIssued: vi.fn().mockResolvedValue({ id: 'pres-1', cuir: 'CUIR-123' }),
      logAuditEvent: vi.fn().mockResolvedValue(undefined)
    } as unknown as IPrescriptionRepository;

    const vendor = {
      submit: vi.fn().mockResolvedValue({ 
        cuir: 'CUIR-123', 
        qrCodeContent: 'qr',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString()
      })
    } as unknown as IPrescriptionVendor;

    const identity = {
      validateDoctor: vi.fn().mockResolvedValue({ active: true }),
      validatePatient: vi.fn().mockResolvedValue({ isValid: true })
    } as unknown as IIdentityValidator;

    const useCase = new IssuePrescriptionUseCase(repo, vendor, identity);
    const result = await useCase.execute(mockDraft, 'user-1', { ip: '127.0.0.1', ua: 'test' });

    expect(result.cuir).toBe('CUIR-123');
    expect(repo.saveDraft).toHaveBeenCalled();
    expect(vendor.submit).toHaveBeenCalled();
    expect(repo.logAuditEvent).toHaveBeenCalled();
  });

  it('should throw error if doctor is not active', async () => {
    const identity = {
      validateDoctor: vi.fn().mockResolvedValue({ active: false }),
      validatePatient: vi.fn().mockResolvedValue({ isValid: true })
    } as unknown as IIdentityValidator;

    const useCase = new IssuePrescriptionUseCase({} as any, {} as any, identity);
    await expect(useCase.execute(mockDraft, 'user-1', { ip: '1', ua: 't' }))
      .rejects.toThrow('Doctor not authorized');
  });
});
