export const CENTS_PER_MAJOR_UNIT = 100

export function centsToMajorUnit(amountCents: number): number {
  return amountCents / CENTS_PER_MAJOR_UNIT
}

export function majorUnitToCents(amount: number): number {
  return Math.round(amount * CENTS_PER_MAJOR_UNIT)
}

export function formatArsFromCents(amountCents: number | null | undefined): string {
  if (!amountCents || amountCents <= 0) return 'Valor a confirmar'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(centsToMajorUnit(amountCents))
}

export function formatBrlFromCents(amountCents: number | null | undefined): string {
  if (amountCents == null || amountCents <= 0) return 'R$ 0,00'

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToMajorUnit(amountCents))
}
