/**
 * Shared business constants for the Brazil Health Reserve experience.
 * Keep presentation values aligned across patient and public web components.
 */
export const RESERVA_SAUDE = {
  monthlyPriceCents: 4_990,
  monthlyCredits: 22,
  maxCapCredits: 600,
} as const

export function formatReservaMonthlyPrice(): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(RESERVA_SAUDE.monthlyPriceCents / 100)
}
