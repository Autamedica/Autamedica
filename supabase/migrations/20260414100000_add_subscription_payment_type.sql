-- Add payment_type to doctor_subscriptions for Checkout Pro support
-- 'preapproval' = recurring card payments (existing flow)
-- 'checkout_pro' = one-time payments (cash, transfer, wallet)

alter table public.doctor_subscriptions
  add column if not exists payment_type text not null default 'preapproval'
  check (payment_type in ('preapproval', 'checkout_pro'));

comment on column public.doctor_subscriptions.payment_type
  is 'Payment method: preapproval (recurring card) or checkout_pro (one-time)';
