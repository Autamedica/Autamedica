/**
 * A database role or an "active" flag alone is not sufficient clinical clearance.
 * Historical placeholder credentials must not authorize patient care.
 *
 * Non-PENDING credentials still require an independent human approval process.
 */
export function hasClinicalDoctorApproval(
  doctor: { active: boolean | null; license_number: string | null } | null | undefined,
): boolean {
  if (doctor?.active !== true) return false
  const license = doctor.license_number?.trim()
  if (!license) return false
  return !/^PENDING(?:-|$)/i.test(license)
}
