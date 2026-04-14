/**
 * Layer 2: Repository — Billing & Subscriptions
 * Only this file talks to Supabase for billing tables.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { toCamel, toSnake, logger } from '@autamedica/shared';
import type {
  SubscriptionPlan,
  DoctorSubscription,
  DoctorSubscriptionWithPlan,
  PaymentTransaction,
  SubscriptionStatus,
  PaymentTransactionStatus,
  PaymentType,
} from '@autamedica/types';

type Client = SupabaseClient;

export const billingRepo = {
  // ── Plans ──

  async getActivePlans(supabase: Client): Promise<SubscriptionPlan[]> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('active', true)
      .order('price_cents', { ascending: true });
    if (error) { logger.error('[billingRepo] getActivePlans error', error); throw error; }
    return (data ?? []).map((row) => toCamel<SubscriptionPlan>(row));
  },

  async getPlanBySlug(supabase: Client, slug: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();
    if (error) { logger.error('[billingRepo] getPlanBySlug error', error); throw error; }
    return data ? toCamel<SubscriptionPlan>(data) : null;
  },

  // ── Subscriptions ──

  async getDoctorActiveSubscription(supabase: Client, doctorId: string): Promise<DoctorSubscriptionWithPlan | null> {
    const { data, error } = await supabase
      .from('doctor_subscriptions')
      .select('*, subscription_plans(*)')
      .eq('doctor_id', doctorId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .maybeSingle();
    if (error) { logger.error('[billingRepo] getDoctorActiveSubscription error', error); throw error; }
    if (!data) return null;

    const { subscription_plans: planRow, ...subRow } = data as Record<string, unknown>;
    const subscription = toCamel<DoctorSubscription>(subRow);
    const plan = toCamel<SubscriptionPlan>(planRow as Record<string, unknown>);
    return { ...subscription, plan };
  },

  async createSubscription(
    supabase: Client,
    input: {
      doctorId: string;
      planId: string;
      status: SubscriptionStatus;
      mercadopagoSubscriptionId: string | null;
      mercadopagoPayerId: string | null;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      paymentType?: PaymentType;
    },
  ): Promise<DoctorSubscription> {
    const { data, error } = await supabase
      .from('doctor_subscriptions')
      .insert(toSnake(input))
      .select('*')
      .single();
    if (error) { logger.error('[billingRepo] createSubscription error', error); throw error; }
    return toCamel<DoctorSubscription>(data);
  },

  async updateSubscriptionStatus(
    supabase: Client,
    subscriptionId: string,
    status: SubscriptionStatus,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const update = toSnake({
      status,
      updatedAt: new Date().toISOString(),
      ...extra,
    });
    const { error } = await supabase
      .from('doctor_subscriptions')
      .update(update)
      .eq('id', subscriptionId);
    if (error) { logger.error('[billingRepo] updateSubscriptionStatus error', error); throw error; }
  },

  async updateSubscriptionByMercadoPagoId(
    supabase: Client,
    mercadopagoSubscriptionId: string,
    updates: Record<string, unknown>,
  ): Promise<DoctorSubscription | null> {
    const { data, error } = await supabase
      .from('doctor_subscriptions')
      .update(toSnake({ ...updates, updatedAt: new Date().toISOString() }))
      .eq('mercadopago_subscription_id', mercadopagoSubscriptionId)
      .select('*')
      .maybeSingle();
    if (error) { logger.error('[billingRepo] updateSubscriptionByMercadoPagoId error', error); throw error; }
    return data ? toCamel<DoctorSubscription>(data) : null;
  },

  async cancelSubscription(supabase: Client, doctorId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('doctor_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: now,
        updated_at: now,
      })
      .eq('doctor_id', doctorId)
      .in('status', ['active', 'trialing']);
    if (error) { logger.error('[billingRepo] cancelSubscription error', error); throw error; }
  },

  // ── Transactions ──

  async createTransaction(
    supabase: Client,
    input: {
      doctorId: string;
      subscriptionId: string | null;
      amountCents: number;
      currency: string;
      status: PaymentTransactionStatus;
      mercadopagoPaymentId: string | null;
      paymentMethod: string | null;
      metadata: Record<string, unknown>;
    },
  ): Promise<PaymentTransaction> {
    const { data, error } = await supabase
      .from('payment_transactions')
      .insert(toSnake(input))
      .select('*')
      .single();
    if (error) { logger.error('[billingRepo] createTransaction error', error); throw error; }
    return toCamel<PaymentTransaction>(data);
  },

  async updateTransactionStatus(
    supabase: Client,
    mercadopagoPaymentId: string,
    status: PaymentTransactionStatus,
  ): Promise<void> {
    const { error } = await supabase
      .from('payment_transactions')
      .update({ status })
      .eq('mercadopago_payment_id', mercadopagoPaymentId);
    if (error) { logger.error('[billingRepo] updateTransactionStatus error', error); throw error; }
  },

  async getTransactionByMpId(supabase: Client, mercadopagoPaymentId: string): Promise<PaymentTransaction | null> {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('mercadopago_payment_id', mercadopagoPaymentId)
      .maybeSingle();
    if (error) { logger.error('[billingRepo] getTransactionByMpId error', error); throw error; }
    return data ? toCamel<PaymentTransaction>(data) : null;
  },

  async listDoctorTransactions(supabase: Client, doctorId: string, limit = 20): Promise<PaymentTransaction[]> {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { logger.error('[billingRepo] listDoctorTransactions error', error); throw error; }
    return (data ?? []).map((row) => toCamel<PaymentTransaction>(row));
  },
};
