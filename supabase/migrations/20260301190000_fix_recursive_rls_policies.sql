-- Fix infinite recursion in profiles RLS policies.
-- The old policies queried profiles within a policy on profiles,
-- causing "infinite recursion detected in policy for relation profiles".
-- Replace with calls to is_platform_or_org_admin() which is SECURITY DEFINER
-- and bypasses RLS.

-- Drop the recursive policies
DROP POLICY IF EXISTS "Platform admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

-- Recreate without self-referencing
CREATE POLICY "profiles_view_admin" ON public.profiles
  FOR SELECT USING (public.is_platform_or_org_admin(auth.uid()));

CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE USING (public.is_platform_or_org_admin(auth.uid()));
