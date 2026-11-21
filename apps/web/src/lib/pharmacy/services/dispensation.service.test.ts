import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispensationRepo } from '../repos/dispensation.repo';
import { dispensationService } from './dispensation.service';

vi.mock('../repos/dispensation.repo', () => ({ dispensationRepo: {
  findPharmacist: vi.fn(), findOrderById: vi.fn(), findDispensationEvent: vi.fn(),
  insertDispensationEvent: vi.fn(), getTotalDispensed: vi.fn(),
} }));
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const deliveryId = '11111111-1111-4111-8111-111111111111';
const pharmacist = { id: 'ph', pharmacy_id: 'f', care_country: 'AR' as const, license_number: 'SYNTHETIC' };
const order = { id: 'o', pharmacy_id: 'f', care_country: 'AR', status: 'approved_for_dispensation', quantity_units: 10 };
const input = { idempotency_key: deliveryId, dispensed_medication: 'SYNTHETIC', dispensed_formulation: 'test', dispensed_quantity: 4 };
const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
  data: { id: 'f', active: true, deleted_at: null, care_country: 'AR' }, error: null,
}) }) }) }) } as unknown as SupabaseClient;

describe('dispensation delivery orchestration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(dispensationRepo.findPharmacist).mockResolvedValue(pharmacist);
    vi.mocked(dispensationRepo.findOrderById).mockResolvedValue(order as never);
    vi.mocked(dispensationRepo.findDispensationEvent).mockResolvedValue(null);
    vi.mocked(dispensationRepo.getTotalDispensed).mockResolvedValue(4);
  });
  it('requires a caller-stable delivery UUID', async () => {
    const result = await dispensationService.dispense(client, 'u', 'o', { ...input, idempotency_key: '' });
    expect(result).toEqual({ ok: false, error: { code: 'invalid_idempotency_key' } });
    expect(dispensationRepo.insertDispensationEvent).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, Number.NaN])('rejects invalid physical quantities: %s', async quantity => {
    const result = await dispensationService.dispense(client, 'u', 'o', { ...input, dispensed_quantity: quantity });
    expect(result).toEqual({ ok: false, error: { code: 'invalid_dispense_quantity' } });
  });
  it('rejects a foreign pharmacy before recording delivery', async () => {
    vi.mocked(dispensationRepo.findOrderById).mockResolvedValue({ ...order, care_country: 'BR' } as never);
    expect(await dispensationService.dispense(client, 'u', 'o', input)).toEqual({ ok: false, error: { code: 'order_not_in_pharmacy' } });
    expect(dispensationRepo.insertDispensationEvent).not.toHaveBeenCalled();
  });
  it('only succeeds after reading the state committed by PostgreSQL', async () => {
    vi.mocked(dispensationRepo.findOrderById).mockResolvedValueOnce(order as never)
      .mockResolvedValueOnce({ ...order, status: 'partially_dispensed' } as never);
    const result = await dispensationService.dispense(client, 'u', 'o', input);
    expect(result).toEqual({ ok: true, data: { status: 'partially_dispensed', total_dispensed: 4, target_quantity: 10, prescription_status_updated: 'dispensed_partial' } });
    expect(dispensationRepo.insertDispensationEvent).toHaveBeenCalledWith(client, expect.objectContaining({ id: deliveryId }));
  });
  it('rejects reusing a delivery UUID for different clinical payload', async () => {
    vi.mocked(dispensationRepo.findDispensationEvent).mockResolvedValue({ id: deliveryId, order_id: 'another-order' });
    expect(await dispensationService.dispense(client, 'u', 'o', input)).toEqual({ ok: false, error: { code: 'idempotency_conflict' } });
    expect(dispensationRepo.insertDispensationEvent).not.toHaveBeenCalled();
  });
  it('does not acknowledge success when committed state cannot be verified', async () => {
    await expect(dispensationService.dispense(client, 'u', 'o', input)).rejects.toThrow('dispensation_commit_not_verified');
  });
  it('returns a completed delivery on retry without a second physical event', async () => {
    vi.mocked(dispensationRepo.findOrderById).mockResolvedValueOnce(order as never)
      .mockResolvedValue({ ...order, status: 'partially_dispensed' } as never);
    await dispensationService.dispense(client, 'u', 'o', input);
    const recorded = vi.mocked(dispensationRepo.insertDispensationEvent).mock.calls[0][1];
    vi.mocked(dispensationRepo.findDispensationEvent).mockResolvedValue(recorded);
    expect((await dispensationService.dispense(client, 'u', 'o', input)).ok).toBe(true);
    expect(dispensationRepo.insertDispensationEvent).toHaveBeenCalledTimes(1);
  });

});
