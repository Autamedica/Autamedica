-- Add the payment-wait state before any migration uses the new enum label.
ALTER TYPE public.dispatch_request_status ADD VALUE IF NOT EXISTS 'pending_payment';
