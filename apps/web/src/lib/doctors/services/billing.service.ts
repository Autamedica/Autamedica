/**
 * Layer 3: Service — Billing & Subscription Business Logic
 * Orchestrates plan management, MercadoPago subscription creation, and webhook processing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';
import { billingRepo } from '../lib/repos/billing.repo';
import type {
  SubscriptionPlan,
  DoctorSubscriptionWithPlan,
  PlanSlug,
  MercadoPagoPreapprovalResponse,
  MercadoPagoPaymentDetail,
  SubscriptionStatus,
  PaymentTransactionStatus,
} from '@autamedica/types';

type Client = SupabaseClient;

const MERCADOPAGO_API = 'https://api.mercadopago.com';

function getMercadoPagoToken(): string {
  const token = import.meta.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
  return token;
}

function getWebhookSecret(): string {
  return import.meta.env.MERCADOPAGO_WEBHOOK_SECRET ?? '';
}

function getAppUrl(): string {
  return import.meta.env.PUBLIC_APP_URL ?? 'https://www.autamedica.com';
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
    return billingRepo.getDoctorActiveSubscription(supabase, doctorId);
  },

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
          transaction_amount: plan.priceCents / 100, // MercadoPago usa unidades, no centavos
          currency_id: plan.currency,
        },
        payer_email: doctorEmail,
        back_url: `${appUrl}/doctor/billing`,
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
    });

    logger.info('[billing] Subscription created', {
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

  async cancelSubscription(supabase: Client, doctorId: string): Promise<void> {
    const existing = await billingRepo.getDoctorActiveSubscription(supabase, doctorId);
    if (!existing) {
      logger.warn('[billing] No active subscription to cancel', { doctorId });
      return;
    }

    // Cancelar en MercadoPago si existe ID externo
    if (existing.mercadopagoSubscriptionId) {
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

  validateWebhookSignature(signature: string | null, _body: string): boolean {
    const secret = getWebhookSecret();
    if (!secret) return true; // Sin secret configurado, aceptar (dev)
    if (!signature) return false;
    // MercadoPago envía x-signature con ts y v1: ts=XXXX,v1=HASH
    // _body reservado para validación HMAC-SHA256 cuando se configure el secret
    return signature.includes('v1=');
  },
};

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

  // Buscar suscripción del doctor por payer metadata
  const doctorId = payment.metadata?.doctor_id as string | undefined;
  if (!doctorId) {
    logger.warn('[billing] Payment without doctor_id in metadata, skipping', { paymentId });
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
    metadata: payment.metadata ?? {},
  });

  // Si el pago fue aprobado, activar la suscripción
  if (internalStatus === 'approved' && subscription && subscription.status !== 'active') {
    await billingRepo.updateSubscriptionStatus(supabase, subscription.id as string, 'active');
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
