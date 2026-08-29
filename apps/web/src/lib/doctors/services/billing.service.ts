/**
 * Layer 3: Service — Billing & Subscription Business Logic
 * Orchestrates plan management, MercadoPago subscription creation, and webhook processing.
 * Supports two payment methods: preapproval (recurring cards) and checkout_pro (one-time).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';
import { billingRepo } from '../lib/repos/billing.repo';
import type {
  SubscriptionPlan,
  DoctorSubscriptionWithPlan,
  PlanSlug,
  MercadoPagoPreapprovalResponse,
  MercadoPagoPreferenceResponse,
  MercadoPagoPaymentDetail,
  SubscriptionStatus,
  PaymentTransactionStatus,
} from '@autamedica/types';

type Client = SupabaseClient;

import { getRuntimeEnvValue } from '@/lib/runtime-env';
import { MERCADOPAGO_STATEMENT_DESCRIPTOR } from '@/lib/payments/constants';

const MERCADOPAGO_API = 'https://api.mercadopago.com';

function getMercadoPagoToken(): string {
  const token = getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN') ?? import.meta.env?.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
  return token;
}

function getWebhookSecret(): string {
  return getRuntimeEnvValue('MERCADOPAGO_WEBHOOK_SECRET') ?? import.meta.env?.MERCADOPAGO_WEBHOOK_SECRET ?? '';
}

function getAppUrl(): string {
  return getRuntimeEnvValue('PUBLIC_APP_URL') ?? import.meta.env?.PUBLIC_APP_URL ?? 'https://www.autamedica.com';
}

async function mpFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getMercadoPagoToken();
  const res = await fetch(`${MERCADOPAGO_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error('[billing] MercadoPago API error', { status: res.status, body, path });
    throw new Error(`MercadoPago API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// Mapeo de estados MercadoPago → estados internos
function mapMpSubscriptionStatus(mpStatus: string): SubscriptionStatus {
  const mapping: Record<string, SubscriptionStatus> = {
    authorized: 'active',
    paused: 'past_due',
    cancelled: 'cancelled',
    pending: 'trialing',
  };
  return mapping[mpStatus] ?? 'trialing';
}

function mapMpPaymentStatus(mpStatus: string): PaymentTransactionStatus {
  const mapping: Record<string, PaymentTransactionStatus> = {
    approved: 'approved',
    rejected: 'rejected',
    refunded: 'refunded',
    in_process: 'pending',
    pending: 'pending',
  };
  return mapping[mpStatus] ?? 'pending';
}

export const billingService = {
  async getPlans(supabase: Client): Promise<SubscriptionPlan[]> {
    return billingRepo.getActivePlans(supabase);
  },

  async getDoctorSubscription(supabase: Client, doctorId: string): Promise<DoctorSubscriptionWithPlan | null> {
    const sub = await billingRepo.getDoctorActiveSubscription(supabase, doctorId);
    if (!sub) return null;

    // Lazy expiry check for checkout_pro subscriptions
    if (
      sub.paymentType === 'checkout_pro' &&
      sub.status === 'active' &&
      sub.currentPeriodEnd &&
      new Date(sub.currentPeriodEnd) < new Date()
    ) {
      await billingRepo.updateSubscriptionStatus(supabase, sub.id as string, 'past_due');
      return { ...sub, status: 'past_due' };
    }

    return sub;
  },

  /** Create a recurring subscription via MercadoPago Preapproval (card only) */
  async createSubscription(
    supabase: Client,
    doctorId: string,
    planSlug: PlanSlug,
    doctorEmail: string,
  ): Promise<{ subscriptionId: string; initPoint: string }> {
    const plan = await billingRepo.getPlanBySlug(supabase, planSlug);
    if (!plan) throw new Error(`Plan "${planSlug}" not found or inactive`);

    // Cancelar suscripción activa previa si existe
    const existing = await billingRepo.getDoctorActiveSubscription(supabase, doctorId);
    if (existing) {
      await billingRepo.cancelSubscription(supabase, doctorId);
      logger.info('[billing] Cancelled existing subscription before creating new', {
        doctorId,
        oldPlan: existing.plan.slug,
        newPlan: planSlug,
      });
    }

    // Crear suscripción en MercadoPago (preapproval)
    const appUrl = getAppUrl();
    const mpResponse = await mpFetch<MercadoPagoPreapprovalResponse>('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: `AutaMedica - ${plan.name}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: plan.priceCents / 100,
          currency_id: plan.currency,
        },
        payer_email: doctorEmail,
        back_url: `${appUrl}/doctors/subscription`,
        external_reference: doctorId,
        status: 'pending',
      }),
    });

    // Persistir suscripción local
    const now = new Date().toISOString();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await billingRepo.createSubscription(supabase, {
      doctorId,
      planId: plan.id as string,
      status: 'trialing',
      mercadopagoSubscriptionId: mpResponse.id,
      mercadopagoPayerId: String(mpResponse.payer_id),
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd.toISOString(),
      paymentType: 'preapproval',
    });

    logger.info('[billing] Preapproval subscription created', {
      doctorId,
      planSlug,
      subscriptionId: subscription.id,
      mpSubscriptionId: mpResponse.id,
    });

    return {
      subscriptionId: subscription.id,
      initPoint: mpResponse.init_point,
    };
  },

  /** Create a one-time payment via MercadoPago Checkout Pro (all payment methods) */
  async createCheckoutProSubscription(
    supabase: Client,
    doctorId: string,
    planSlug: PlanSlug,
    doctorEmail: string,
  ): Promise<{ subscriptionId: string; initPoint: string }> {
    const plan = await billingRepo.getPlanBySlug(supabase, planSlug);
    if (!plan) throw new Error(`Plan "${planSlug}" not found or inactive`);

    // Cancelar suscripción activa previa si existe
    const existing = await billingRepo.getDoctorActiveSubscription(supabase, doctorId);
    if (existing) {
      await billingRepo.cancelSubscription(supabase, doctorId);
      logger.info('[billing] Cancelled existing subscription before creating checkout_pro', {
        doctorId,
        oldPlan: existing.plan.slug,
        newPlan: planSlug,
      });
    }

    const appUrl = getAppUrl();
    const mpResponse = await mpFetch<MercadoPagoPreferenceResponse>('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          title: `AutaMedica - ${plan.name}`,
          description: `Suscripcion mensual - ${plan.name}`,
          quantity: 1,
          unit_price: plan.priceCents / 100,
          currency_id: plan.currency,
        }],
        payer: { email: doctorEmail },
        back_urls: {
          success: `${appUrl}/doctors/subscription?payment=success`,
          failure: `${appUrl}/doctors/subscription?payment=failure`,
          pending: `${appUrl}/doctors/subscription?payment=pending`,
        },
        auto_return: 'approved',
        statement_descriptor: MERCADOPAGO_STATEMENT_DESCRIPTOR,
        external_reference: `${doctorId}|${plan.id}`,
        notification_url: `${appUrl}/api/doctors/billing/webhook`,
      }),
    });

    const now = new Date().toISOString();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await billingRepo.createSubscription(supabase, {
      doctorId,
      planId: plan.id as string,
      status: 'trialing',
      mercadopagoSubscriptionId: mpResponse.id,
      mercadopagoPayerId: null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd.toISOString(),
      paymentType: 'checkout_pro',
    });

    logger.info('[billing] Checkout Pro subscription created', {
      doctorId,
      planSlug,
      subscriptionId: subscription.id,
      mpPreferenceId: mpResponse.id,
    });

    return {
      subscriptionId: subscription.id,
      initPoint: mpResponse.init_point,
    };
  },

  async cancelSubscription(supabase: Client, doctorId: string): Promise<void> {
    const existing = await billingRepo.getDoctorActiveSubscription(supabase, doctorId);
    if (!existing) {
      logger.warn('[billing] No active subscription to cancel', { doctorId });
      return;
    }

    // Solo cancelar en MercadoPago para suscripciones preapproval
    if (existing.mercadopagoSubscriptionId && existing.paymentType !== 'checkout_pro') {
      try {
        await mpFetch(`/preapproval/${existing.mercadopagoSubscriptionId}`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'cancelled' }),
        });
      } catch (err) {
        logger.error('[billing] Failed to cancel MP subscription (proceeding with local cancel)', err);
      }
    }

    await billingRepo.cancelSubscription(supabase, doctorId);
    logger.info('[billing] Subscription cancelled', { doctorId, subscriptionId: existing.id });
  },

  async handlePaymentWebhook(
    supabase: Client,
    type: string,
    dataId: string,
  ): Promise<void> {
    if (type === 'payment') {
      await handlePaymentNotification(supabase, dataId);
    } else if (type === 'subscription_preapproval') {
      await handleSubscriptionUpdate(supabase, dataId);
    } else {
      logger.info('[billing] Unhandled webhook type', { type, dataId });
    }
  },

  async validateWebhookSignature(input: {
    signature: string | null;
    requestId: string | null;
    dataId: string | null;
  }): Promise<boolean> {
    const secret = getWebhookSecret();
    if (!secret || !input.signature || !input.requestId || !input.dataId) return false;

    const { ts, v1 } = parseMercadoPagoSignature(input.signature);
    if (!ts || !v1) return false;

    const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${ts};`;
    const expected = await hmacSha256Hex(secret, manifest);

    return constantTimeEqual(expected, v1);
  },
};

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

function parseMercadoPagoSignature(signature: string): { ts: string | null; v1: string | null } {
  return signature.split(',').reduce<{ ts: string | null; v1: string | null }>(
    (acc, part) => {
      const [rawKey, ...rawValue] = part.split('=');
      const key = rawKey?.trim();
      const value = rawValue.join('=').trim();
      if (key === 'ts') acc.ts = value;
      if (key === 'v1') acc.v1 = value;
      return acc;
    },
    { ts: null, v1: null },
  );
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function handlePaymentNotification(supabase: Client, paymentId: string): Promise<void> {
  const payment = await mpFetch<MercadoPagoPaymentDetail>(`/v1/payments/${paymentId}`);
  const internalStatus = mapMpPaymentStatus(payment.status);

  // Buscar si ya existe la transacción
  const existing = await billingRepo.getTransactionByMpId(supabase, String(payment.id));
  if (existing) {
    await billingRepo.updateTransactionStatus(supabase, String(payment.id), internalStatus);
    logger.info('[billing] Payment transaction updated', { paymentId, status: internalStatus });
    return;
  }

  // Resolver doctorId: metadata (preapproval) o external_reference (checkout_pro)
  let doctorId = payment.metadata?.doctor_id as string | undefined;
  let planId: string | undefined;

  if (!doctorId && payment.external_reference) {
    const parts = payment.external_reference.split('|');
    doctorId = parts[0];
    planId = parts[1];
  }

  if (!doctorId) {
    logger.warn('[billing] Payment without doctor identification, skipping', { paymentId });
    return;
  }

  const subscription = await billingRepo.getDoctorActiveSubscription(supabase, doctorId);

  await billingRepo.createTransaction(supabase, {
    doctorId,
    subscriptionId: (subscription?.id as string) ?? null,
    amountCents: Math.round(payment.transaction_amount * 100),
    currency: payment.currency_id,
    status: internalStatus,
    mercadopagoPaymentId: String(payment.id),
    paymentMethod: payment.payment_method_id,
    metadata: { ...payment.metadata, external_reference: payment.external_reference, planId },
  });

  // Si el pago fue aprobado, activar la suscripción
  if (internalStatus === 'approved' && subscription && subscription.status !== 'active') {
    const extra: Record<string, unknown> = {};
    // Para checkout_pro, resetear el período de 30 días desde la fecha de pago
    if (subscription.paymentType === 'checkout_pro') {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      extra.currentPeriodStart = now.toISOString();
      extra.currentPeriodEnd = periodEnd.toISOString();
    }
    await billingRepo.updateSubscriptionStatus(supabase, subscription.id as string, 'active', extra);
    logger.info('[billing] Subscription activated via payment', { doctorId, subscriptionId: subscription.id });
  }

  logger.info('[billing] Payment transaction created', { paymentId, doctorId, status: internalStatus });
}

async function handleSubscriptionUpdate(supabase: Client, preapprovalId: string): Promise<void> {
  const mpSub = await mpFetch<{ id: string; status: string; external_reference: string }>(
    `/preapproval/${preapprovalId}`,
  );

  const internalStatus = mapMpSubscriptionStatus(mpSub.status);
  const updated = await billingRepo.updateSubscriptionByMercadoPagoId(supabase, preapprovalId, {
    status: internalStatus,
    ...(internalStatus === 'cancelled' ? { cancelledAt: new Date().toISOString() } : {}),
  });

  if (updated) {
    logger.info('[billing] Subscription status updated from MP webhook', {
      preapprovalId,
      status: internalStatus,
      doctorId: updated.doctorId,
    });
  } else {
    logger.warn('[billing] Subscription not found for MP preapproval update', { preapprovalId });
  }
}
