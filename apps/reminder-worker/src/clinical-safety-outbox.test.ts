import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processClinicalOutboxJobs,
  generateAlarmIdempotencyKey,
} from './clinical-safety-outbox';

describe('Clinical Safety Outbox Background Worker', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };
  });

  describe('generateAlarmIdempotencyKey', () => {
    it('should generate a formatted key with hourly window resolution', () => {
      const incidentId = 'inc-123';
      const ruleVersionId = 'rule-ver-456';
      const triggerType = 'safety_rule_evaluated';

      const key = generateAlarmIdempotencyKey(incidentId, ruleVersionId, triggerType);
      const timeWindow = new Date().toISOString().substring(0, 13);

      expect(key).toBe(`${incidentId}:${ruleVersionId}:${triggerType}:${timeWindow}`);
    });
  });

  describe('processClinicalOutboxJobs', () => {
    it('should return quickly if no pending outbox events exist', async () => {
      mockSupabase.select.mockResolvedValue({ data: [], error: null });

      const result = await processClinicalOutboxJobs(mockSupabase as any, { dryRun: true });

      expect(result.processed).toBe(0);
      expect(result.dispatched).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should process pending outbox events and dispatch alerts', async () => {
      const mockEvent = {
        id: 'evt-1',
        event_type: 'safety_rule_evaluated',
        payload: {
          incident_id: 'inc-123',
          rule_version_id: 'rule-ver-456',
          recommendation: 'block_closure',
          reason: 'ECG ST elevation',
        },
        status: 'pending',
        retry_count: 0,
      };

      // Mock fetching pending events
      mockSupabase.select.mockResolvedValueOnce({ data: [mockEvent], error: null });
      // Mock fetching clinical incident details
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { setting: 'uti', severity: 'critical', condition_display: 'IAM' },
        error: null,
      });
      // Mock outbox status update
      mockSupabase.update.mockResolvedValueOnce({ data: null, error: null });

      const result = await processClinicalOutboxJobs(mockSupabase as any, { dryRun: true });

      expect(result.processed).toBe(1);
      expect(result.dispatched).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('should skip duplicate alerts and mark as processed due to alarm idempotency key match', async () => {
      const mockEvent1 = {
        id: 'evt-1',
        event_type: 'safety_rule_evaluated',
        payload: {
          incident_id: 'inc-123',
          rule_version_id: 'rule-ver-456',
          recommendation: 'block_closure',
          reason: 'ECG ST elevation',
        },
        status: 'pending',
        retry_count: 0,
      };

      const mockEvent2 = {
        id: 'evt-2',
        event_type: 'safety_rule_evaluated',
        payload: {
          incident_id: 'inc-123',
          rule_version_id: 'rule-ver-456',
          recommendation: 'block_closure',
          reason: 'ECG ST elevation',
        },
        status: 'pending',
        retry_count: 0,
      };

      // Mock fetching pending events (return both)
      mockSupabase.select.mockResolvedValueOnce({ data: [mockEvent1, mockEvent2], error: null });
      
      // Mock fetching clinical incident details twice
      mockSupabase.maybeSingle
        .mockResolvedValueOnce({
          data: { setting: 'uti', severity: 'critical', condition_display: 'IAM' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { setting: 'uti', severity: 'critical', condition_display: 'IAM' },
          error: null,
        });

      // Mock outbox status updates
      mockSupabase.update.mockResolvedValue({ data: null, error: null });

      const result = await processClinicalOutboxJobs(mockSupabase as any, { dryRun: false });

      expect(result.processed).toBe(2);
      expect(result.dispatched).toBe(1); // Only the first one is dispatched
      expect(result.skipped).toBe(1);    // The second duplicate within the hour window is skipped
    });
  });
});
