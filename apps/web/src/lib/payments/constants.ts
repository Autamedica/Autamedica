export const APPOINTMENT_PAYMENT_PROVIDER = 'mercadopago'
export const APPOINTMENT_PAYMENT_COMMISSION_BPS = 1800
export const DEFAULT_PAYMENT_CURRENCY = 'BRL'
export const APPOINTMENT_PAYMENT_CURRENCY = 'BRL'
export const SUPPORTED_PAYMENT_CURRENCIES = ['BRL', 'ARS', 'USD'] as const
export const MERCADOPAGO_STATEMENT_DESCRIPTOR = 'AUTAMEDICA'

export function calculatePlatformFeeAmount(grossAmount: number): number {
  return Math.round((grossAmount * APPOINTMENT_PAYMENT_COMMISSION_BPS) / 10_000)
}

export function calculateNetAmount(
  grossAmount: number,
  processorFeeAmount = 0,
): number {
  return Math.max(0, grossAmount - calculatePlatformFeeAmount(grossAmount) - processorFeeAmount)
}

