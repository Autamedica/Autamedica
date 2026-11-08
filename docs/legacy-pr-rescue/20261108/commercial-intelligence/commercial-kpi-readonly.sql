-- AutaMedica | Auditoría comercial de solo lectura
-- Fecha de revisión: 2026-11-01
-- Ejecutar con un rol autorizado (no conceder acceso anon/authenticated).
-- No hay modificaciones, IDs de pacientes, emails, diagnósticos ni URLs clínicas.
-- Fuente de verdad: Supabase. No interpretar status=approved como liquidación bancaria.

-- 1) Embudo de operaciones: snapshots agregados no equivalen a cohortes.
SELECT 'patients_registered' AS metric, COUNT(*) AS value
FROM public.patients
UNION ALL
SELECT 'distinct_patients_with_appointment', COUNT(DISTINCT patient_id)
FROM public.appointments WHERE deleted_at IS NULL
UNION ALL
SELECT 'appointments', COUNT(*)
FROM public.appointments WHERE deleted_at IS NULL
UNION ALL
SELECT 'appointments_completed', COUNT(*)
FROM public.appointments WHERE status = 'completed' AND deleted_at IS NULL
UNION ALL
SELECT 'pharmacy_dispatch_completed', COUNT(*)
FROM public.pharmacy_dispatch_requests WHERE status = 'completed'
UNION ALL
SELECT 'telemedicine_sessions_ended', COUNT(*)
FROM public.telemedicine_sessions WHERE ended_at IS NOT NULL;

-- 2) Distribución temporal de citas: conteos, sin datos de pacientes.
SELECT date_trunc('month', created_at)::date AS cohort_month,
       status, COUNT(*) AS appointments
FROM public.appointments
WHERE deleted_at IS NULL
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3) Cobros: separar moneda, estado, evidencias del proveedor y relación clínica.
-- gross_amount es un importe almacenado por el sistema. Verificar unidad y
-- conciliación antes de sumar como ingreso contable.
SELECT ap.currency, ap.status AS payment_status, COALESCE(a.status, 'unlinked') AS appointment_status,
       COUNT(*) AS payment_records,
       COUNT(*) FILTER (WHERE ap.provider_payment_id IS NOT NULL) AS with_provider_confirmation_id,
       COUNT(*) FILTER (WHERE ap.paid_at IS NOT NULL) AS with_paid_timestamp,
       SUM(ap.gross_amount) AS raw_amount_not_reconciled
FROM public.appointment_payments ap
LEFT JOIN public.appointments a ON a.id = ap.appointment_id
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- 4) Cobros efectuados y consultas terminadas: no inferir a partir de la tabla sola.
SELECT COUNT(*) FILTER (WHERE a.status = 'completed') AS completed_appointments,
       COUNT(*) FILTER (WHERE a.status = 'completed' AND ap.status = 'approved') AS completed_with_approved_record,
       COUNT(*) FILTER (WHERE a.status = 'completed' AND ap.id IS NULL) AS completed_without_payment_record
FROM public.appointments a
LEFT JOIN public.appointment_payments ap ON ap.appointment_id = a.id
WHERE a.deleted_at IS NULL;

-- 5) CRM: contactos importados no son oportunidades calificadas.
SELECT (SELECT COUNT(*) FROM growth_os.crm_accounts) AS crm_accounts,
       (SELECT COUNT(*) FROM growth_os.crm_activities) AS crm_activities,
       (SELECT COUNT(*) FROM growth_os.crm_opportunities) AS crm_opportunities,
       (SELECT COUNT(*) FROM growth_os.crm_accounts
        WHERE last_contacted_at IS NOT NULL) AS accounts_with_contact_timestamp,
       (SELECT COUNT(*) FROM growth_os.leads WHERE first_utm_source IN ('public.profiles','imported_txt')) AS synced_or_imported_leads;

-- 6) Activación: tabla dedicada puede no estar siendo alimentada.
SELECT COUNT(*) AS activation_rows,
       COUNT(*) FILTER (WHERE appointment_booked_at IS NOT NULL) AS booked,
       COUNT(*) FILTER (WHERE consultation_done_at IS NOT NULL) AS consultations_done,
       COUNT(*) FILTER (WHERE source_channel IS NOT NULL) AS source_known
FROM growth_os.patient_activation;

-- Métricas NO disponibles con estos datos:
-- - visitantes únicos reales (Cloudflare RUM no es GA4)
-- - usuario por canal -> pago (no existe una relación consentida y validada)
-- - ingresos BRL reales por canal, costo fiscal/por pasarela, CAC y margen neto
-- - tasa de re-compra real, sin filtrar datos de prueba
-- - facturación B2B fuera del CRM
-- No unir pagos con información sanitaria para enviarla a analytics.
