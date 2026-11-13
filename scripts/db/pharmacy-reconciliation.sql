-- Read-only reconciliation inventory. Run through an authorized restricted export.
-- Internal identifiers only; never publish the result in GitHub, telemetry or campaigns.
-- A signature audit entry/hash/URL is not cryptographic verification.
BEGIN TRANSACTION READ ONLY;

WITH events AS (
  SELECT o.prescription_id, count(e.id) AS event_count,
    coalesce(sum(e.dispensed_quantity), 0) AS recorded_quantity
  FROM public.dispensation_orders o
  LEFT JOIN public.dispensation_events e ON e.order_id = o.id
  GROUP BY o.prescription_id
), signatures AS (
  SELECT prescription_id, count(*) FILTER (
    WHERE event_type = 'ACT_DIGITAL_SIGNATURE' AND signature_hash IS NOT NULL
  ) AS signature_audit_entries
  FROM public.prescription_audit_events GROUP BY prescription_id
)
SELECT rx.id AS prescription_id, rx.doctor_id, rx.patient_id,
  rx.country_code AS prescription_country, d.care_country AS physician_country,
  p.care_country AS patient_country, rx.status AS recorded_status,
  rx.signed_pdf_url IS NOT NULL AS has_pdf,
  coalesce(s.signature_audit_entries, 0) AS signature_audit_entries,
  CASE WHEN rx.status = 'draft' THEN 'draft'
    WHEN rx.status IN ('signed', 'sent', 'dispensed_partial', 'dispensed_total') THEN 'recorded_as_issued'
    ELSE 'status_requires_review' END AS document_classification,
  CASE WHEN rx.country_code IS DISTINCT FROM d.care_country
    OR rx.country_code IS DISTINCT FROM p.care_country
    OR rx.country_code NOT IN ('AR', 'BR') OR rx.country_code IS NULL
    THEN 'jurisdiction_requires_clinician_review' ELSE 'jurisdiction_agrees' END AS jurisdiction_review,
  'not_cryptographically_verified_by_this_inventory' AS signature_verification,
  coalesce(e.event_count, 0) AS structured_delivery_events,
  coalesce(e.recorded_quantity, 0) AS recorded_delivered_quantity,
  rx.status IN ('dispensed_partial', 'dispensed_total') AND coalesce(e.event_count, 0) = 0
    AS delivery_status_without_structured_evidence,
  'preserve_original_pending_authorized_clinical_review' AS action
FROM public.prescriptions rx
LEFT JOIN public.doctors d ON d.id = rx.doctor_id
LEFT JOIN public.patients p ON p.id = rx.patient_id
LEFT JOIN events e ON e.prescription_id = rx.id
LEFT JOIN signatures s ON s.prescription_id = rx.id
ORDER BY rx.id;

SELECT 'dispatch' AS source, id AS request_id, status::text AS historical_status,
  care_country, 'do_not_reactivate_unknown_jurisdiction' AS action
FROM public.pharmacy_dispatch_requests WHERE care_country IS NULL
UNION ALL
SELECT 'consultation_legacy', id, status::text, care_country,
  'retired_queue_preserve_history_no_reactivation'
FROM public.pharmacy_consultation_requests WHERE care_country IS NULL;

SELECT care_country, count(*) AS directory_records,
  count(*) FILTER (WHERE user_id IS NOT NULL) AS linked_accounts,
  count(*) FILTER (WHERE user_id IS NULL) AS imported_without_account,
  count(*) FILTER (WHERE user_id IS NOT NULL AND active) AS active_linked_records
FROM public.doctors GROUP BY care_country ORDER BY care_country;

ROLLBACK;
