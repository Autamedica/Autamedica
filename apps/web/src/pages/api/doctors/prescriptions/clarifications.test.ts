import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './clarifications'
import { doctorHasPatientAccess } from '@/lib/doctors/lib/resolve-room'

const { tableData, orderEqCalls, mockTable } = vi.hoisted(() => {
  const tableData: Record<string, unknown[]> = {}
  const orderEqCalls: Array<{ column: string; value: string }> = []

  function buildChain(data: unknown[]) {
    const chain: any = {
      then: (resolve: (value: unknown) => void) => {
        resolve({ data, error: null })
        return undefined
      },
    }
    chain.select = vi.fn(() => chain)
    chain.eq = vi.fn((column: string, value: string) => {
      orderEqCalls.push({ column, value })
      return chain
    })
    chain.in = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    return chain
  }

  return {
    tableData,
    orderEqCalls,
    mockTable: vi.fn((table: string) => buildChain(tableData[table] ?? [])),
  }
})

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => mockTable(table)),
  })),
}))

vi.mock('@/lib/doctors/api/doctor-context', () => ({
  resolveDoctorContext: vi.fn().mockResolvedValue({ doctorId: 'doctor-1', userId: 'user-1' }),
}))

vi.mock('@/lib/doctors/lib/resolve-room', () => ({
  doctorHasPatientAccess: vi.fn().mockResolvedValue(true),
}))

vi.mock('@autamedica/shared', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const ORDER = {
  id: 'order-1',
  prescription_id: 'rx-1',
  pharmacy_id: 'pharm-1',
  medication: 'Enalapril 10mg',
  status: 'clarification_requested',
  patient_id: 'patient-1',
}

const CLARIFICATION = {
  id: 'clarif-1',
  order_id: 'order-1',
  question: 'El paciente refiere intolerancia. Confirma la indicación de enalapril?',
  question_category: 'dose_verification',
  requested_at: '2026-09-19T10:00:00Z',
  expires_at: '2026-09-21T10:00:00Z',
  status: 'pending',
}

const PHARMACY = { id: 'pharm-1', name: 'Farmacia Central' }

beforeEach(() => {
  vi.clearAllMocks()
  orderEqCalls.length = 0
  for (const key of Object.keys(tableData)) delete tableData[key]
  tableData.dispensation_orders = [ORDER]
  tableData.dispensation_clarifications = [CLARIFICATION]
  tableData.pharmacies = [PHARMACY]
})

function makeRequest(url: string): Request {
  return new Request(url, { method: 'GET', headers: { 'x-api-key': 'test-key' } })
}

describe('API: /api/doctors/prescriptions/clarifications', () => {
  it('GET without patientId lists all pending clarifications of the doctor and skips patient access check', async () => {
    const response = await GET({ request: makeRequest('http://localhost/api/doctors/prescriptions/clarifications'), params: {}, locals: {} } as any)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toEqual({
      id: 'clarif-1',
      order_id: 'order-1',
      prescription_id: 'rx-1',
      patient_id: 'patient-1',
      medication: 'Enalapril 10mg',
      pharmacy_name: 'Farmacia Central',
      question: CLARIFICATION.question,
      question_category: 'dose_verification',
      requested_at: '2026-09-19T10:00:00Z',
      expires_at: '2026-09-21T10:00:00Z',
      order_status: 'clarification_requested',
    })

    const eqValues = orderEqCalls.filter((call) => call.column === 'doctor_id' || call.column === 'status' || call.column === 'patient_id')
    const filtered = [...new Set(eqValues.map((call) => call.column))].sort()
    expect(filtered).toEqual(['doctor_id', 'status'])
    expect(doctorHasPatientAccess).not.toHaveBeenCalled()
  })

  it('GET with patientId filters by patient and enforces patient access', async () => {
    const response = await GET({
      request: makeRequest('http://localhost/api/doctors/prescriptions/clarifications?patientId=patient-1'),
      params: {},
      locals: {},
    } as any)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data[0].prescription_id).toBe('rx-1')

    expect(doctorHasPatientAccess).toHaveBeenCalledWith(expect.anything(), 'doctor-1', 'patient-1')
    expect(orderEqCalls.some((call) => call.column === 'patient_id' && call.value === 'patient-1')).toBe(true)
  })

  it('GET without patientId returns empty list when there are no pending clarifications', async () => {
    tableData.dispensation_orders = []

    const response = await GET({ request: makeRequest('http://localhost/api/doctors/prescriptions/clarifications'), params: {}, locals: {} } as any)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual([])
    expect(doctorHasPatientAccess).not.toHaveBeenCalled()
  })
})