-- Allow pharmacists to see unassigned pending orders (pharmacy assignment queue)
-- and claim them by setting pharmacy_id + status = 'assigned'.

-- 1. Replace SELECT policy: pharmacists see their orders + unassigned pending
DROP POLICY IF EXISTS "dispensation_orders_select_pharmacist" ON public.dispensation_orders;
CREATE POLICY "dispensation_orders_select_pharmacist"
  ON public.dispensation_orders FOR SELECT TO authenticated
  USING (
    pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
    OR (
      pharmacy_id IS NULL
      AND status = 'pending'
      AND EXISTS (SELECT 1 FROM public.pharmacists WHERE user_id = auth.uid() AND active = true)
    )
  );

-- 2. Replace UPDATE policy: pharmacists can update their orders + claim unassigned
DROP POLICY IF EXISTS "dispensation_orders_update_pharmacist" ON public.dispensation_orders;
CREATE POLICY "dispensation_orders_update_pharmacist"
  ON public.dispensation_orders FOR UPDATE TO authenticated
  USING (
    pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
    OR (
      pharmacy_id IS NULL
      AND status = 'pending'
      AND EXISTS (SELECT 1 FROM public.pharmacists WHERE user_id = auth.uid() AND active = true)
    )
  )
  WITH CHECK (
    pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
  );

-- 3. Index for fast unassigned queue lookups
CREATE INDEX IF NOT EXISTS idx_dispensation_orders_unassigned
  ON public.dispensation_orders(status, created_at)
  WHERE pharmacy_id IS NULL AND status = 'pending' AND deleted_at IS NULL;
