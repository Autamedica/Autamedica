const GRACE_PERIOD_DAYS = 7

export type OnboardingStatus =
  | { state: 'completed' }
  | { state: 'grace_period'; daysRemaining: number }
  | { state: 'expired' }

export function getOnboardingStatus(
  onboardingCompletedAt: string | null | undefined,
  createdAt: string | undefined,
): OnboardingStatus {
  if (onboardingCompletedAt) {
    return { state: 'completed' }
  }

  if (!createdAt) {
    return { state: 'expired' }
  }

  const created = new Date(createdAt)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const daysRemaining = GRACE_PERIOD_DAYS - diffDays

  if (daysRemaining > 0) {
    return { state: 'grace_period', daysRemaining }
  }

  return { state: 'expired' }
}
