-- Add onboarding tracking columns to profiles
-- onboarding_started_at: when the user first accessed the portal (grace period start)
-- onboarding_completed_at: when the user finished the onboarding wizard

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Set onboarding as completed for existing users who already have first_name populated
-- This prevents existing users from being forced through onboarding
UPDATE public.profiles
SET onboarding_completed_at = updated_at,
    onboarding_started_at = created_at
WHERE first_name IS NOT NULL
  AND first_name != ''
  AND onboarding_completed_at IS NULL;
