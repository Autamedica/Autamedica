/** Jordan partner commission is distinct from provider payment approval.
 * Only a trusted verified subject present in the DB ledger can be reported
 * as eligible; never derive commission from a guest phone or checkout return.
 */
export interface JordanLedgerCommission {
  status: string
  verified_subject_hash: string | null
}

export function isVerifiedJordanCommissionEligible(
  paymentStatus: string | null | undefined,
  commission: JordanLedgerCommission | null | undefined,
): boolean {
  return paymentStatus === 'approved'
    && commission?.status === 'eligible'
    && typeof commission.verified_subject_hash === 'string'
    && /^[0-9a-f]{64}$/.test(commission.verified_subject_hash)
}
