/**
 * Doctor portal UI utilities.
 */

interface Profile {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

export function getDisplayName(profile: Profile | undefined): { name: string; isEmail: boolean } {
  const first = profile?.first_name?.trim()
  const last = profile?.last_name?.trim()

  if (first || last) {
    return { name: [first, last].filter(Boolean).join(' '), isEmail: false }
  }

  return { name: profile?.email ?? 'Paciente', isEmail: true }
}

export function getInitials(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName?.trim()?.[0] ?? '').toUpperCase()
  const l = (lastName?.trim()?.[0] ?? '').toUpperCase()
  return (f + l) || 'P'
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-lime-100 text-lime-700',
]

export function getAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
