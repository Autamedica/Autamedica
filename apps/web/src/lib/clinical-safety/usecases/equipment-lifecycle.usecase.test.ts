import { describe, expect, it, vi } from 'vitest';
import {
  checkDeviceAvailabilityUseCase,
  updateEquipmentStatusUseCase,
} from './equipment-lifecycle.usecase';
import type { IEquipmentSafetyRepository, MedicalEquipment } from '@autamedica/types/ports';

const baseDevice: MedicalEquipment = {
  id: 'eq-1',
  serial_number: 'VENT-001',
  model_name: 'Vent X',
  brand: 'AutaMed',
  device_type: 'ventilator',
  current_status: 'validation_pending',
  current_setting: 'uti',
  installed_at: '2026-01-01T00:00:00.000Z',
  last_calibrated_at: '2026-01-01T00:00:00.000Z',
  next_calibration_due: '2026-12-01T00:00:00.000Z',
  operating_hours: 100,
  organization_id: 'org-1',
  snomed_device_code: '706172005',
};

function makeRepo(overrides: Partial<IEquipmentSafetyRepository> = {}): IEquipmentSafetyRepository {
  return {
    getEquipmentById: vi.fn().mockResolvedValue(baseDevice),
    getEquipmentBySerialNumber: vi.fn(),
    updateEquipmentStatus: vi.fn().mockResolvedValue({ ...baseDevice, current_status: 'active' }),
    createEquipmentIncident: vi.fn().mockResolvedValue({
      id: 'incident-created',
      equipment_id: 'eq-1',
      reporter_id: 'actor-1',
      assigned_technician_id: null,
      severity: 'low',
      status: 'open',
      reported_at: '2026-05-25T00:00:00.000Z',
      resolved_at: null,
      next_verification_due: null,
      technical_summary: null,
      calibration_certificate_url: 'https://cert.local/cal.pdf',
      closed_at: null,
    }),
    getOpenIncidentForEquipment: vi.fn().mockResolvedValue({
      id: 'incident-open',
      equipment_id: 'eq-1',
      reporter_id: 'actor-1',
      assigned_technician_id: null,
      severity: 'medium',
      status: 'open',
      reported_at: '2026-05-25T00:00:00.000Z',
      resolved_at: null,
      next_verification_due: null,
      technical_summary: null,
      calibration_certificate_url: 'https://cert.local/cal.pdf',
      closed_at: null,
    }),
    resolveIncident: vi.fn().mockResolvedValue({ id: 'incident-open' } as any),
    logEquipmentEvent: vi.fn().mockResolvedValue({ id: 'event-1', incident_id: 'incident-open' } as any),
    getEventsForIncident: vi.fn(),
    ...overrides,
  };
}

describe('equipment lifecycle use cases', () => {
  it('blocks validation_pending -> active without a calibration certificate', async () => {
    const repo = makeRepo({
      getOpenIncidentForEquipment: vi.fn().mockResolvedValue({
        id: 'incident-open',
        calibration_certificate_url: null,
      } as any),
    });

    await expect(updateEquipmentStatusUseCase(
      { supabase: {} as any, equipmentSafetyRepo: repo },
      { equipmentId: 'eq-1', targetStatus: 'active', actorId: 'actor-1', notes: 'ok' }
    )).rejects.toThrow('certificado de calibración');

    expect(repo.updateEquipmentStatus).not.toHaveBeenCalled();
    expect(repo.logEquipmentEvent).not.toHaveBeenCalled();
  });

  it('logs active transition against a real incident before resolving it', async () => {
    const repo = makeRepo();

    await updateEquipmentStatusUseCase(
      { supabase: {} as any, equipmentSafetyRepo: repo },
      {
        equipmentId: 'eq-1',
        targetStatus: 'active',
        actorId: 'actor-1',
        notes: 'calibracion validada',
      }
    );

    expect(repo.updateEquipmentStatus).toHaveBeenCalledWith(
      'eq-1',
      'active',
      expect.objectContaining({
        lastCalibratedAt: expect.any(String),
        nextCalibrationDue: expect.any(String),
      })
    );
    expect(repo.logEquipmentEvent).toHaveBeenCalledWith(expect.objectContaining({
      incident_id: 'incident-open',
      action_type: 'verify',
      is_resolved: true,
    }));
    expect(repo.resolveIncident).toHaveBeenCalledWith('incident-open', expect.objectContaining({
      status: 'resolved',
    }));
  });

  it('creates an audit incident when status changes without an open equipment ticket', async () => {
    const repo = makeRepo({
      getOpenIncidentForEquipment: vi.fn().mockResolvedValue(null),
      updateEquipmentStatus: vi.fn().mockResolvedValue({ ...baseDevice, current_status: 'review_required' }),
      logEquipmentEvent: vi.fn().mockResolvedValue({ id: 'event-2', incident_id: 'incident-created' } as any),
    });

    await updateEquipmentStatusUseCase(
      { supabase: {} as any, equipmentSafetyRepo: repo },
      {
        equipmentId: 'eq-1',
        targetStatus: 'review_required',
        actorId: 'actor-1',
        notes: 'alarma de bomba',
      }
    );

    expect(repo.createEquipmentIncident).toHaveBeenCalledWith(expect.objectContaining({
      equipment_id: 'eq-1',
      reporter_id: 'actor-1',
      status: 'open',
    }));
    expect(repo.logEquipmentEvent).toHaveBeenCalledWith(expect.objectContaining({
      incident_id: 'incident-created',
      action_type: 'diagnose',
      is_resolved: false,
    }));
  });

  it('locks out active equipment with expired calibration', async () => {
    const repo = makeRepo({
      getEquipmentById: vi.fn().mockResolvedValue({
        ...baseDevice,
        current_status: 'active',
        next_calibration_due: '2020-01-01T00:00:00.000Z',
      }),
    });

    const result = await checkDeviceAvailabilityUseCase(
      { supabase: {} as any, equipmentSafetyRepo: repo },
      { equipmentId: 'eq-1' }
    );

    expect(result.isAvailable).toBe(false);
    expect(result.backupDeviceSuggested).toBe(true);
    expect(result.reason).toContain('BLOQUEO DE SEGURIDAD');
  });
});
