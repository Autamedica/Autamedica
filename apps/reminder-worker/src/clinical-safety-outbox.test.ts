import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processClinicalOutboxJobs,
  generateAlarmIdempotencyKey,
  resolveClinicalAlarmPolicy,
} from './clinical-safety-outbox';

describe('Clinical Safety Outbox Background Worker', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn(),
    };
  });

  function mockOutboxQueries(events: any[], incidents: any[]) {
    const incidentQueue = [...incidents];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'clinical_outbox_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: events, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }

      if (table === 'clinical_incidents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: incidentQueue.shift() ?? null,
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  }

  describe('generateAlarmIdempotencyKey', () => {
    it('should generate a formatted key with policy window resolution', () => {
      const incidentId = 'inc-123';
      const ruleVersionId = 'rule-ver-456';
      const triggerType = 'safety_rule_evaluated';
      const now = new Date('2026-05-25T12:00:59.000Z');

      const key = generateAlarmIdempotencyKey(incidentId, ruleVersionId, triggerType, 60_000, now);
      const timeWindow = Math.floor(now.getTime() / 60_000);

      expect(key).toBe(`${incidentId}:${ruleVersionId}:${triggerType}:${timeWindow}`);
    });
  });

  describe('resolveClinicalAlarmPolicy', () => {
    it('routes critical UTI events to bedside alerts with minute-level dedupe', () => {
      const policy = resolveClinicalAlarmPolicy('uti', 'critical');

      expect(policy).toEqual({
        route: 'icu_bedside',
        priority: 1,
        dedupeWindowMs: 60_000,
        expectedActionWindowMinutes: 1,
      });
    });

    it('routes critical Guardia events to shockroom with door-to-action SLA', () => {
      const policy = resolveClinicalAlarmPolicy('guardia', 'critical');

      expect(policy.route).toBe('shockroom');
      expect(policy.priority).toBe(1);
      expect(policy.expectedActionWindowMinutes).toBe(10);
    });

    it('keeps outpatient low-risk alarms in follow-up cadence', () => {
      const policy = resolveClinicalAlarmPolicy('outpatient', 'low');

      expect(policy.route).toBe('outpatient_followup');
      expect(policy.priority).toBe(4);
      expect(policy.expectedActionWindowMinutes).toBe(7 * 24 * 60);
    });
  });

  describe('processClinicalOutboxJobs', () => {
    it('should return quickly if no pending outbox events exist', async () => {
      mockOutboxQueries([], []);

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

      mockOutboxQueries(
        [mockEvent],
        [{ setting: 'uti', severity: 'critical', condition_display: 'IAM' }]
      );

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

      mockOutboxQueries(
        [mockEvent1, mockEvent2],
        [
          { setting: 'uti', severity: 'critical', condition_display: 'IAM' },
          { setting: 'uti', severity: 'critical', condition_display: 'IAM' },
        ]
      );

      const result = await processClinicalOutboxJobs(mockSupabase as any, { dryRun: false });

      expect(result.processed).toBe(2);
      expect(result.dispatched).toBe(1); // Only the first one is dispatched
      expect(result.skipped).toBe(1);    // The second duplicate within the hour window is skipped
    });
  });
});
