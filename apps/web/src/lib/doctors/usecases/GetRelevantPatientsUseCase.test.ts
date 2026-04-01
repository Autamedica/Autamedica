import { describe, it, expect, vi } from 'vitest';
import { GetRelevantPatientsUseCase } from './GetRelevantPatientsUseCase';
import * as alertsRepo from '../lib/repos/alerts';
import type { IPatientRepository } from '@autamedica/types';

vi.mock('../lib/repos/alerts', () => ({
  getAlertsForPatients: vi.fn(),
}));

describe('GetRelevantPatientsUseCase', () => {
  it('should prioritize patients with high alerts', async () => {
    const mockRepo: IPatientRepository = {
      findByDoctorUserId: vi.fn().mockResolvedValue([
        { id: 'p1', updatedAt: '2026-03-01' },
        { id: 'p2', updatedAt: '2026-03-01' },
      ]),
      findAllActive: vi.fn(),
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findByCompany: vi.fn(),
    } as any;

    vi.mocked(alertsRepo.getAlertsForPatients).mockResolvedValue([
      { patient_id: 'p2', severity: 'high' }
    ] as any);

    const useCase = new GetRelevantPatientsUseCase(mockRepo);
    const result = await useCase.execute('doc1');

    expect(result[0].id).toBe('p2');
    expect(result[1].id).toBe('p1');
  });
});
