/**
 * Onboarding utilities shared across patient and doctor portals.
 *
 * Onboarding is semi-mandatory:
 * - first_name and last_name are ALWAYS required (cannot be skipped)
 * - Other fields can be skipped for up to GRACE_PERIOD_DAYS days
 * - After the grace period, all fields become mandatory
 */

/** Days a user can skip optional onboarding fields before they become mandatory */
export const ONBOARDING_GRACE_PERIOD_DAYS = 7;

/**
 * Check if onboarding is required based on user_metadata.
 * Use this in middleware to decide whether to redirect to /onboarding.
 */
export function isOnboardingRequired(
  userMetadata: Record<string, unknown> | undefined | null,
): boolean {
  if (!userMetadata) return true;
  return userMetadata.onboarding_completed !== true;
}

/**
 * Check if the 7-day grace period has expired since onboarding started.
 */
export function isGracePeriodExpired(startedAt: string | null | undefined): boolean {
  if (!startedAt) return false;
  const started = new Date(startedAt);
  if (isNaN(started.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - started.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= ONBOARDING_GRACE_PERIOD_DAYS;
}
