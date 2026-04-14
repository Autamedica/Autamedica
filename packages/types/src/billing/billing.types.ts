/**
 * Billing & Subscription types for the monetization layer.
 * All monetary amounts in integer cents (minor units).
 */
import type { UUID, ISODateString } from '../core/brand.types';

export type PlanSlug = 'basico' | 'pro' | 'premium';
export type PlanInterval = 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing';
export type PaymentTransactionStatus = 'pending' | 'approved' | 'rejected' | 'refunded';
export type PaymentType = 'preapproval' | 'checkout_pro';

export interface SubscriptionPlan {
  id: UUID;
  name: string;
  slug: PlanSlug;
  priceCents: number;
  currency: string;
  interval: PlanInterval;
  features: string[];
  active: boolean;
  createdAt: ISODateString;
}

export interface DoctorSubscription {
  id: UUID;
  doctorId: UUID;
  planId: UUID;
  status: SubscriptionStatus;
  mercadopagoSubscriptionId: string | null;
  mercadopagoPayerId: string | null;
  currentPeriodStart: ISODateString | null;
  currentPeriodEnd: ISODateString | null;
  cancelledAt: ISODateString | null;
  paymentType: PaymentType;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PaymentTransaction {
  id: UUID;
  doctorId: UUID;
  subscriptionId: UUID | null;
  amountCents: number;
  currency: string;
  status: PaymentTransactionStatus;
  mercadopagoPaymentId: string | null;
  paymentMethod: string | null;
  metadata: Record<string, unknown>;
  createdAt: ISODateString;
}

export interface DoctorSubscriptionWithPlan extends DoctorSubscription {
  plan: SubscriptionPlan;
}

/** Payload sent by MercadoPago webhook */
export interface MercadoPagoWebhookPayload {
  id: number;
  live_mode: boolean;
  type: string;
  date_created: string;
  action: string;
  data: {
    id: string;
  };
  user_id: string;
}

/** Shape returned by MercadoPago preapproval (subscription) API */
export interface MercadoPagoPreapprovalResponse {
  id: string;
  payer_id: number;
  status: string;
  init_point: string;
  date_created: string;
  auto_recurring: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id: string;
  };
}

/** Shape returned by MercadoPago Checkout Pro preference creation */
export interface MercadoPagoPreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

/** Shape returned by MercadoPago payment detail */
export interface MercadoPagoPaymentDetail {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  currency_id: string;
  payment_method_id: string;
  external_reference: string;
  payer: {
    id: number;
    email: string;
  };
  metadata: Record<string, unknown>;
}
