import { describe, it, expect, vi } from 'vitest';
import { GetRelevantPatientsUseCase } from './GetRelevantPatientsUseCase';
import type { IPatientRepository, IAlertsRepository, PatientWithProfile } from '@autamedica/types';

function createMockPatientRepo(overrides: Partial<IPatientRepository> = {}): IPatientRepository {
  return {
    findAllActive: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    findByUserId: vi.fn().mockResolvedValue(null),
    findByCompany: vi.fn().mockResolvedValue([]),
    findByDoctorUserId: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createMockAlertsRepo(overrides: Partial<IAlertsRepository> = {}): IAlertsRepository {
  return {
    getForPatients: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('GetRelevantPatientsUseCase', () => {
  it('should prioritize patients with high alerts', async () => {
    const patientRepo = createMockPatientRepo({
      findByDoctorUserId: vi.fn().mockResolvedValue([
        { id: 'p1', updated_at: '2026-03-01', created_at: '2026-03-01' } as unknown as PatientWithProfile,
        { id: 'p2', updated_at: '2026-03-01', created_at: '2026-03-01' } as unknown as PatientWithProfile,
      ]),
    });

    const alertsRepo = createMockAlertsRepo({
      getForPatients: vi.fn().mockResolvedValue([
        { patient_id: 'p2', severity: 'high' },
      ]),
    });

    const useCase = new GetRelevantPatientsUseCase({ patientRepo, alertsRepo });
    const result = await useCase.execute('doc1');

    expect(result[0].id).toBe('p2');
    expect(result[1].id).toBe('p1');
  });
});
