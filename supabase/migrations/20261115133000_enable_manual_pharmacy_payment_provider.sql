-- Enable a first-class manual pilot payment rail for ARS when no AR PSP token is provisioned.
ALTER TABLE public.pharmacy_dispatch_payments
  DROP CONSTRAINT IF EXISTS pharmacy_dispatch_payments_provider_check;
ALTER TABLE public.pharmacy_dispatch_payments
  ADD CONSTRAINT pharmacy_dispatch_payments_provider_check
  CHECK (provider IN ('mercadopago','manual'));
