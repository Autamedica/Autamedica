/** The database ledger is authoritative for Jordan's first paid conversion. */
export interface JordanLedgerCommission {
  status: string
  amount_minor: number
  currency: string
}

export function isJordanCommissionEligible(
  paymentStatus: string | null | undefined,
  commission: JordanLedgerCommission | null | undefined,
): boolean {
  return paymentStatus === 'approved'
    && commission?.status === 'eligible'
    && commission.amount_minor === 1000
    && commission.currency === 'BRL'
}
