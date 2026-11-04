-- Dedicated staging still requires DNI on every pharmacy dispatch.
-- Align nullability with production: Brazilian patients must never invent DNI.
-- The previous staging country/document CHECK enforces CPF on explicit BR cases.
ALTER TABLE public.pharmacy_dispatch_requests ALTER COLUMN patient_dni DROP NOT NULL;
