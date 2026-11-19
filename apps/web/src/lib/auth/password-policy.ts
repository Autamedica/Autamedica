/** Minimum password length enforced by the production Supabase Auth policy. */
export const MIN_PASSWORD_LENGTH = 12;

export function meetsPasswordMinimum(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
