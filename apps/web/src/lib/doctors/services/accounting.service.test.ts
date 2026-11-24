import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { accountingRepo } from '../lib/repos/accounting.repo';
import { accountingService, compareRegimes } from './accounting.service';

vi.mock('../lib/repos/accounting.repo', () => ({
  accountingRepo: {
    getFiscalProfile: vi.fn(),
    upsertFiscalProfile: vi.fn(),
    listIncome: vi.fn(),
    insertIncome: vi.fn(),
    deleteIncome: vi.fn(),
    listExpenses: vi.fn(),
    insertExpense: vi.fn(),
    deleteExpense: vi.fn(),
    listObligations: vi.fn(),
    upsertObligation: vi.fn(),
    markObligationPaid: vi.fn(),
    getSummary: vi.fn(),
    upsertSummary: vi.fn(),
    getAnnualSummaries: vi.fn(),
  },
}));

const fakeSupabase = {} as SupabaseClient;

describe('accounting.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('compareRegimes', () => {
    it('computes monotributo and responsable inscripto totals for feasible income', () => {
      const result = compareRegimes(500_000_00, 100_000_00, 10_000_00);

      expect(result.monotributo.feasible).toBe(true);
      expect(result.monotributo.category).toBe('A');
      expect(result.monotributo.annualCost).toBeGreaterThan(0);
      expect(result.responsableInscripto.annualCost).toBeGreaterThan(0);
      expect(['monotributo', 'responsable_inscripto']).toContain(result.recommendation);
      expect(result.savings).toBeGreaterThanOrEqual(0);
    });

    it('marks monotributo infeasible above top bracket', () => {
      const result = compareRegimes(150_000_000_00, 10_000_000_00, 0);

      expect(result.monotributo.feasible).toBe(false);
      expect(result.monotributo.category).toBeNull();
      expect(result.recommendation).toBe('responsable_inscripto');
    });
  });

  describe('getFiscalProfile', () => {
    it('returns null gracefully when fiscal profile table is missing (42P01)', async () => {
      vi.mocked(accountingRepo.getFiscalProfile).mockRejectedValue({
        code: '42P01',
        message: 'relation "public.doctor_fiscal_profiles" does not exist',
      });

      await expect(accountingService.getFiscalProfile(fakeSupabase, 'doc-1')).resolves.toBeNull();
    });

    it('rethrows unexpected database errors', async () => {
      vi.mocked(accountingRepo.getFiscalProfile).mockRejectedValue({
        code: 'XX000',
        message: 'internal error',
      });

      await expect(accountingService.getFiscalProfile(fakeSupabase, 'doc-1')).rejects.toEqual({
        code: 'XX000',
        message: 'internal error',
      });
    });
  });

  describe('getMonthlyDashboard', () => {
    it('returns an empty dashboard when accounting relations do not exist (PGRST205)', async () => {
      const missingTableError = {
        code: 'PGRST205',
        message: 'Could not find the table in the schema cache',
      };
      vi.mocked(accountingRepo.getFiscalProfile).mockRejectedValue(missingTableError);
      vi.mocked(accountingRepo.listIncome).mockRejectedValue(missingTableError);
      vi.mocked(accountingRepo.listExpenses).mockRejectedValue(missingTableError);
      vi.mocked(accountingRepo.listObligations).mockRejectedValue(missingTableError);
      vi.mocked(accountingRepo.getSummary).mockRejectedValue(missingTableError);

      const dashboard = await accountingService.getMonthlyDashboard(fakeSupabase, 'doc-1', 2026, 4);

      expect(dashboard).toEqual({
        profile: null,
        income: [],
        expenses: [],
        obligations: [],
        summary: null,
      });
    });
  });

  describe('getAnnualOverview', () => {
    it('returns a zeroed annual overview when tables are missing (42P01)', async () => {
      const missingTableError = {
        code: '42P01',
        message: 'relation "public.doctor_income_records" does not exist',
      };
      vi.mocked(accountingRepo.getFiscalProfile).mockRejectedValue(missingTableError);
      vi.mocked(accountingRepo.getAnnualSummaries).mockRejectedValue(missingTableError);
      vi.mocked(accountingRepo.listObligations).mockRejectedValue(missingTableError);

      const overview = await accountingService.getAnnualOverview(fakeSupabase, 'doc-1', 2026);

      expect(overview.profile).toBeNull();
      expect(overview.summaries).toEqual([]);
      expect(overview.totalIncome).toBe(0);
      expect(overview.totalExpenses).toBe(0);
      expect(overview.netResult).toBe(0);
      expect(overview.totalObligationsPaid).toBe(0);
      expect(overview.totalObligationsPending).toBe(0);
      expect(overview.overdueCount).toBe(0);
    });
  });
});
