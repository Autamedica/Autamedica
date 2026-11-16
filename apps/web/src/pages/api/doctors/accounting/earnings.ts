import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { internalError, jsonOk, badRequest } from '@/lib/api-helpers'
import { doctorsRepo } from '@/lib/doctors/lib/repos/doctors'

const PAGE_SIZE = 1000
const MAX_PAGES = 50
const SUPPORTED_CURRENCIES = ['BRL', 'ARS'] as const

type Currency = typeof SUPPORTED_CURRENCIES[number]
type EarningsAggregate = Record<Currency, {
  pending: number
  paid: number
  cancelled: number
  refunded: number
  accrued: number
}>

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth
  try {
    const doctorId = await doctorsRepo.resolveIdByUserId(auth.user.id, auth.supabase)
    if (!doctorId) return badRequest('doctor_not_found')
    const db = auth.supabase as unknown as SupabaseClient

    // Read every page for accurate per-doctor balances; only the 100 newest
    // rows are sent to the UI table to keep the client payload bounded.
    const allRows: Array<{
      id: string
      gross_amount: number
      net_amount: number
      currency: string
      status: string
      created_at: string
      paid_at: string | null
      metadata: Record<string, unknown>
      dispatch_request_id: string | null
      appointment_id: string | null
    }> = []
    let truncated = false

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * PAGE_SIZE
      const { data, error } = await db.from('doctor_earnings')
        .select('id, gross_amount, net_amount, currency, status, created_at, paid_at, metadata, dispatch_request_id, appointment_id')
        .eq('doctor_id', doctorId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      const rows = (data ?? []) as typeof allRows
      allRows.push(...rows.filter((row) => SUPPORTED_CURRENCIES.includes(row.currency as Currency)))
      if (rows.length < PAGE_SIZE) break
      if (page === MAX_PAGES - 1) truncated = true
    }

    const summary: EarningsAggregate = {
      BRL: { pending: 0, paid: 0, cancelled: 0, refunded: 0, accrued: 0 },
      ARS: { pending: 0, paid: 0, cancelled: 0, refunded: 0, accrued: 0 },
    }
    const completedDispatchIds = new Set<string>()

    for (const row of allRows) {
      const currency = row.currency as Currency
      const amount = Number(row.net_amount) || 0
      const currencySummary = summary[currency]
      if (row.status === 'pending' || row.status === 'paid') {
        currencySummary[row.status] += amount
        currencySummary.accrued += amount
      } else if (row.status === 'cancelled' || row.status === 'refunded') {
        currencySummary[row.status] += amount
      }
      if (row.dispatch_request_id) completedDispatchIds.add(row.dispatch_request_id)
    }

    return jsonOk({
      earnings: allRows.slice(0, 100),
      summary,
      completedDispatchCount: completedDispatchIds.size,
      totalCount: allRows.length,
      historyTruncated: truncated,
    })
  } catch (error) {
    logger.error('[accounting/earnings] GET failed', error)
    return internalError('doctor_earnings_unavailable')
  }
}
