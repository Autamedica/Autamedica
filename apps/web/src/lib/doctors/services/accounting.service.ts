/**
 * Layer 3: Service — Doctor Accounting Business Logic
 * Tax calculations, recategorization checks, fiscal summary generation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';
import { accountingRepo } from '../lib/repos/accounting.repo';
import {
  MONOTRIBUTO_CATEGORIES_2026,
  IVA_RATE,
  IIBB_RATE_DEFAULT,
  GANANCIAS_BRACKETS_2026,
  type TaxRegime,
  type MonotributoCategory,
  type FiscalSummary,
  type DoctorFiscalProfile,
} from '../types/accounting.types';

type Client = SupabaseClient;

// ── Tax Calculation Helpers ──

export function suggestMonotributoCategory(annualIncomeInCents: number): MonotributoCategory | null {
  for (const cat of MONOTRIBUTO_CATEGORIES_2026) {
    if (annualIncomeInCents <= cat.maxAnnualIncome) {
      return cat.category;
    }
  }
  return null; // exceeds all categories → must be RI
}

export function getMonotributoMonthlyFee(category: MonotributoCategory): number {
  const cat = MONOTRIBUTO_CATEGORIES_2026.find(c => c.category === category);
  return cat?.monthlyFee ?? 0;
}

export function calculateIvaBalance(grossIncome: number, ivaCredito: number): { debito: number; credito: number; balance: number } {
  const debito = Math.round(grossIncome * IVA_RATE);
  return { debito, credito: ivaCredito, balance: debito - ivaCredito };
}

export function calculateIibb(grossIncome: number, rate: number = IIBB_RATE_DEFAULT): number {
  return Math.round(grossIncome * rate);
}

export function calculateGanancias(netAnnualIncome: number): number {
  let tax = 0;
  let remaining = netAnnualIncome;
  for (const bracket of GANANCIAS_BRACKETS_2026) {
    const taxableInBracket = Math.min(remaining, (bracket.to === Infinity ? remaining : bracket.to - bracket.from));
    if (taxableInBracket <= 0) break;
    tax += Math.round(taxableInBracket * bracket.rate);
    remaining -= taxableInBracket;
  }
  return tax;
}

export function compareRegimes(annualIncome: number, annualExpenses: number, annualIvaCredito: number): {
  monotributo: { category: MonotributoCategory | null; annualCost: number; feasible: boolean };
  responsableInscripto: { iva: number; ganancias: number; iibb: number; autonomos: number; annualCost: number };
  recommendation: TaxRegime;
  savings: number;
} {
  // Monotributo
  const category = suggestMonotributoCategory(annualIncome);
  const monotributoFeasible = category !== null;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- category is guaranteed non-null when monotributoFeasible is true
  const monotributoAnnualCost = monotributoFeasible ? getMonotributoMonthlyFee(category!) * 12 : Infinity;

  // Responsable Inscripto
  const ivaResult = calculateIvaBalance(annualIncome, annualIvaCredito);
  const netForGanancias = Math.max(0, annualIncome - annualExpenses);
  const ganancias = calculateGanancias(netForGanancias);
  const iibb = calculateIibb(annualIncome);
  const autonomosAnnual = 1_500_000 * 12; // ~$15K/mes estimado
  const riAnnualCost = ivaResult.balance + ganancias + iibb + autonomosAnnual;

  const recommendation = monotributoFeasible && monotributoAnnualCost < riAnnualCost ? 'monotributo' : 'responsable_inscripto';
  const savings = Math.abs(monotributoAnnualCost - riAnnualCost);

  return {
    monotributo: { category, annualCost: monotributoFeasible ? monotributoAnnualCost : 0, feasible: monotributoFeasible },
    responsableInscripto: { iva: ivaResult.balance, ganancias, iibb, autonomos: autonomosAnnual, annualCost: riAnnualCost },
    recommendation,
    savings,
  };
}

// ── Service Methods ──

export const accountingService = {
  async getFiscalProfile(supabase: Client, doctorId: string): Promise<DoctorFiscalProfile | null> {
    return accountingRepo.getFiscalProfile(supabase, doctorId);
  },

  async saveFiscalProfile(supabase: Client, doctorId: string, profile: Partial<DoctorFiscalProfile>): Promise<DoctorFiscalProfile> {
    return accountingRepo.upsertFiscalProfile(supabase, doctorId, profile);
  },

  async getMonthlyDashboard(supabase: Client, doctorId: string, year: number, month: number) {
    const [profile, income, expenses, obligations, summary] = await Promise.all([
      accountingRepo.getFiscalProfile(supabase, doctorId),
      accountingRepo.listIncome(supabase, doctorId, year, month),
      accountingRepo.listExpenses(supabase, doctorId, year, month),
      accountingRepo.listObligations(supabase, doctorId, year, month),
      accountingRepo.getSummary(supabase, doctorId, year, month),
    ]);

    return { profile, income, expenses, obligations, summary };
  },

  async getAnnualOverview(supabase: Client, doctorId: string, year: number) {
    const [profile, summaries, obligations] = await Promise.all([
      accountingRepo.getFiscalProfile(supabase, doctorId),
      accountingRepo.getAnnualSummaries(supabase, doctorId, year),
      accountingRepo.listObligations(supabase, doctorId, year),
    ]);

    const totalIncome = summaries.reduce((sum, s) => sum + s.totalIncome, 0);
    const totalExpenses = summaries.reduce((sum, s) => sum + s.totalExpenses, 0);
    const totalObligationsPaid = obligations.filter(o => o.paid).reduce((sum, o) => sum + (o.paidAmount ?? o.amount), 0);
    const totalObligationsPending = obligations.filter(o => !o.paid).reduce((sum, o) => sum + o.amount, 0);
    const overdue = obligations.filter(o => o.status === 'overdue');

    const comparison = compareRegimes(totalIncome, totalExpenses, 0);

    return {
      profile,
      summaries,
      totalIncome,
      totalExpenses,
      netResult: totalIncome - totalExpenses,
      totalObligationsPaid,
      totalObligationsPending,
      overdueCount: overdue.length,
      regimeComparison: comparison,
    };
  },

  async recalculateSummary(supabase: Client, doctorId: string, year: number, month: number): Promise<FiscalSummary | null> {
    const profile = await accountingRepo.getFiscalProfile(supabase, doctorId);
    if (!profile) return null;

    const [income, expenses] = await Promise.all([
      accountingRepo.listIncome(supabase, doctorId, year, month),
      accountingRepo.listExpenses(supabase, doctorId, year, month),
    ]);

    const totalIncome = income.reduce((sum, i) => sum + i.grossAmount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalRetenciones = income.reduce((sum, i) => sum + i.taxWithheld, 0);
    const totalIvaCredito = expenses.reduce((sum, e) => sum + e.ivaAmount, 0);
    const totalIvaDebito = profile.taxRegime === 'responsable_inscripto' ? Math.round(totalIncome * IVA_RATE) : 0;

    // Accumulated annual
    const prevSummaries = await accountingRepo.getAnnualSummaries(supabase, doctorId, year);
    const prevMonths = prevSummaries.filter(s => s.periodMonth < month);
    const accumulatedPrev = prevMonths.reduce((sum, s) => sum + s.totalIncome, 0);
    const accumulatedAnnualIncome = accumulatedPrev + totalIncome;

    const suggestedCategory = suggestMonotributoCategory(accumulatedAnnualIncome);
    const recategorizationNeeded = profile.taxRegime === 'monotributo'
      && profile.monotributoCategory !== null
      && suggestedCategory !== null
      && suggestedCategory !== profile.monotributoCategory;

    const summaryData: Omit<FiscalSummary, 'id' | 'createdAt' | 'updatedAt'> = {
      doctorId,
      fiscalProfileId: profile.id,
      periodYear: year,
      periodMonth: month,
      totalIncome,
      totalExpenses,
      totalIvaDebito,
      totalIvaCredito,
      ivaBalance: totalIvaDebito - totalIvaCredito,
      totalRetenciones,
      netResult: totalIncome - totalExpenses,
      accumulatedAnnualIncome,
      monotributoCategorySuggested: suggestedCategory,
      recategorizationNeeded,
    };

    await accountingRepo.upsertSummary(supabase, summaryData);
    logger.info('[accountingService] Summary recalculated', { doctorId, year, month });

    return accountingRepo.getSummary(supabase, doctorId, year, month);
  },
};
