/**
 * Layer 2: Repository — Doctor Accounting
 * Only this file talks to Supabase for accounting tables.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { toCamel, toSnake, logger } from '@autamedica/shared';
import type {
  DoctorFiscalProfile,
  IncomeRecord,
  ExpenseRecord,
  TaxObligation,
  FiscalSummary,
} from '../../types/accounting.types';

type Client = SupabaseClient;

export const accountingRepo = {
  // ── Fiscal Profile ──

  async getFiscalProfile(supabase: Client, doctorId: string): Promise<DoctorFiscalProfile | null> {
    const { data, error } = await supabase
      .from('doctor_fiscal_profiles')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('active', true)
      .maybeSingle();
    if (error) { logger.error('[accountingRepo] getFiscalProfile error', error); throw error; }
    return data ? toCamel<DoctorFiscalProfile>(data) : null;
  },

  async upsertFiscalProfile(supabase: Client, doctorId: string, profile: Partial<DoctorFiscalProfile>): Promise<DoctorFiscalProfile> {
    const snakeData = toSnake({ ...profile, doctorId, updatedAt: new Date().toISOString() });
    const { data, error } = await supabase
      .from('doctor_fiscal_profiles')
      .upsert(snakeData, { onConflict: 'doctor_id' })
      .select('*')
      .single();
    if (error) { logger.error('[accountingRepo] upsertFiscalProfile error', error); throw error; }
    return toCamel<DoctorFiscalProfile>(data);
  },

  // ── Income ──

  async listIncome(supabase: Client, doctorId: string, year: number, month?: number): Promise<IncomeRecord[]> {
    let query = supabase
      .from('doctor_income_records')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('period_year', year)
      .order('invoice_date', { ascending: false });

    if (month) query = query.eq('period_month', month);

    const { data, error } = await query;
    if (error) { logger.error('[accountingRepo] listIncome error', error); throw error; }
    return toCamel<IncomeRecord[]>(data ?? []);
  },

  async insertIncome(supabase: Client, record: Omit<IncomeRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<IncomeRecord> {
    const { data, error } = await supabase
      .from('doctor_income_records')
      .insert(toSnake(record))
      .select('*')
      .single();
    if (error) { logger.error('[accountingRepo] insertIncome error', error); throw error; }
    return toCamel<IncomeRecord>(data);
  },

  async deleteIncome(supabase: Client, id: string, doctorId: string): Promise<void> {
    const { error } = await supabase
      .from('doctor_income_records')
      .delete()
      .eq('id', id)
      .eq('doctor_id', doctorId);
    if (error) { logger.error('[accountingRepo] deleteIncome error', error); throw error; }
  },

  // ── Expenses ──

  async listExpenses(supabase: Client, doctorId: string, year: number, month?: number): Promise<ExpenseRecord[]> {
    let query = supabase
      .from('doctor_expense_records')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('period_year', year)
      .order('created_at', { ascending: false });

    if (month) query = query.eq('period_month', month);

    const { data, error } = await query;
    if (error) { logger.error('[accountingRepo] listExpenses error', error); throw error; }
    return toCamel<ExpenseRecord[]>(data ?? []);
  },

  async insertExpense(supabase: Client, record: Omit<ExpenseRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExpenseRecord> {
    const { data, error } = await supabase
      .from('doctor_expense_records')
      .insert(toSnake(record))
      .select('*')
      .single();
    if (error) { logger.error('[accountingRepo] insertExpense error', error); throw error; }
    return toCamel<ExpenseRecord>(data);
  },

  async deleteExpense(supabase: Client, id: string, doctorId: string): Promise<void> {
    const { error } = await supabase
      .from('doctor_expense_records')
      .delete()
      .eq('id', id)
      .eq('doctor_id', doctorId);
    if (error) { logger.error('[accountingRepo] deleteExpense error', error); throw error; }
  },

  // ── Obligations ──

  async listObligations(supabase: Client, doctorId: string, year: number, month?: number): Promise<TaxObligation[]> {
    let query = supabase
      .from('doctor_tax_obligations')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('period_year', year)
      .order('due_date', { ascending: true });

    if (month) query = query.eq('period_month', month);

    const { data, error } = await query;
    if (error) { logger.error('[accountingRepo] listObligations error', error); throw error; }
    return toCamel<TaxObligation[]>(data ?? []);
  },

  async upsertObligation(supabase: Client, obligation: Omit<TaxObligation, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaxObligation> {
    const { data, error } = await supabase
      .from('doctor_tax_obligations')
      .insert(toSnake(obligation))
      .select('*')
      .single();
    if (error) { logger.error('[accountingRepo] upsertObligation error', error); throw error; }
    return toCamel<TaxObligation>(data);
  },

  async markObligationPaid(supabase: Client, id: string, doctorId: string, paidAmount: number, reference: string): Promise<void> {
    const { error } = await supabase
      .from('doctor_tax_obligations')
      .update({
        paid: true,
        paid_date: new Date().toISOString().split('T')[0],
        paid_amount: paidAmount,
        payment_reference: reference,
        status: 'paid',
      })
      .eq('id', id)
      .eq('doctor_id', doctorId);
    if (error) { logger.error('[accountingRepo] markObligationPaid error', error); throw error; }
  },

  // ── Fiscal Summary ──

  async getSummary(supabase: Client, doctorId: string, year: number, month: number): Promise<FiscalSummary | null> {
    const { data, error } = await supabase
      .from('doctor_fiscal_summaries')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle();
    if (error) { logger.error('[accountingRepo] getSummary error', error); throw error; }
    return data ? toCamel<FiscalSummary>(data) : null;
  },

  async upsertSummary(supabase: Client, summary: Omit<FiscalSummary, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const { error } = await supabase
      .from('doctor_fiscal_summaries')
      .upsert(toSnake(summary), { onConflict: 'doctor_id,period_year,period_month' });
    if (error) { logger.error('[accountingRepo] upsertSummary error', error); throw error; }
  },

  async getAnnualSummaries(supabase: Client, doctorId: string, year: number): Promise<FiscalSummary[]> {
    const { data, error } = await supabase
      .from('doctor_fiscal_summaries')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('period_year', year)
      .order('period_month', { ascending: true });
    if (error) { logger.error('[accountingRepo] getAnnualSummaries error', error); throw error; }
    return toCamel<FiscalSummary[]>(data ?? []);
  },
};
