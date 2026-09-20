import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { repoMock, redfmMock } = vi.hoisted(() => {
  const methods = [
    'findPharmacist',
    'listOrdersByPharmacy',
    'listUnassignedOrders',
    'findOrderById',
    'claimOrder',
    'logAudit',
    'updateOrderStatus',
    'insertValidation',
    'getValidationsForOrder',
    'insertDispensationEvent',
    'getTotalDispensed',
    'updatePrescriptionStatus',
  ]
  const repoMock: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const m of methods) repoMock[m] = vi.fn()
  return { repoMock, redfmMock: vi.fn().mockResolvedValue(undefined) }
})

vi.mock('../repos/dispensation.repo', () => ({ dispensationRepo: repoMock }))
vi.mock('@/lib/datasus/redfm-orchestrator', () => ({
  orchestrateRedfmRegistration: (...args: unknown[]) => redfmMock(...args),
}))

import { dispensationService } from './dispensation.service'
import type { DispenseInput, ValidateInput } from './dispensation.service'

const PHARMACIST_A = { id: 'ph-1', pharmacy_id: 'farmacia-1' }
const PHARMACIST_NO_PHARMACY = { id: 'ph-9', pharmacy_id: null }

const ORDER = {
  id: 'order-1',
  prescription_id: 'rx-1',
  patient_id: 'patient-1',
  doctor_id: 'doctor-1',
  pharmacy_id: null,
  medication: 'Enalapril 10mg',
  formulation: 'Comp. 10mg',
  dose_mg_per_day: 10,
  quantity_units: 30,
  duration_days: 30,
  prescription_type: 'standard',
  status: 'pending',
  clinical_semaphore: null,
  semaphore_reasons: null,
  extraordinary_dose_flag: false,
  requires_clarification: false,
  dispense_window_start: null,
  dispense_window_end: null,
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
}

function makeSupabase(pharmacistRow: unknown = null): any {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: pharmacistRow, error: null })),
        })),
      })),
    })),
  }
}

function dispatchInput(overrides: Partial<DispenseInput> = {}): DispenseInput {
  return {
    dispensed_medication: 'Enalapril',
    dispensed_formulation: 'Comp. 10mg',
    dispensed_quantity: 30,
    batch_number: 'LOTE-1',
    expiry_date: '2028-09-01',
    ...overrides,
  }
}

function validationInput(overrides: Partial<ValidateInput> = {}): ValidateInput {
  return {
    validation_type: 'patient_identity',
    result: 'pass',
    ...overrides,
  }
}

describe('dispensationService', () => {
  const supabase = makeSupabase()

  beforeEach(() => {
    vi.clearAllMocks()
    repoMock.findPharmacist.mockResolvedValue(PHARMACIST_A)
    repoMock.findOrderById.mockResolvedValue(ORDER)
    repoMock.getTotalDispensed.mockResolvedValue(0)
    repoMock.getValidationsForOrder.mockResolvedValue([])
  })

  describe('filterStatuses', () => {
    it('mantiene solo estados válidos del circuito', () => {
      const filtered = dispensationService.filterStatuses(['pending', 'hackeado', 'dispensed', 'borrar_todo'])
      expect(filtered).toEqual(['pending', 'dispensed'])
    })
  })

  describe('claimOrder', () => {
    it('devuelve not_pharmacist si el usuario no es farmacéutico', async () => {
      repoMock.findPharmacist.mockResolvedValue(null)

      const result = await dispensationService.claimOrder(supabase, 'u-1', 'order-1')

      expect(result).toEqual({ ok: false, error: { code: 'not_pharmacist' } })
    })

    it('devuelve not_pharmacist si el farmacéutico no tiene farmacia asignada', async () => {
      repoMock.findPharmacist.mockResolvedValue(PHARMACIST_NO_PHARMACY)

      const result = await dispensationService.claimOrder(supabase, 'u-1', 'order-1')

      expect(result).toEqual({ ok: false, error: { code: 'not_pharmacist' } })
    })

    it('devuelve order_not_found si la orden no existe', async () => {
      repoMock.findOrderById.mockResolvedValue(null)

      const result = await dispensationService.claimOrder(supabase, 'u-1', 'order-desconocida')

      expect(result).toEqual({ ok: false, error: { code: 'order_not_found' } })
    })

    it('devuelve order_not_in_pharmacy si la orden ya tiene farmacia asignada', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-2' })

      const result = await dispensationService.claimOrder(supabase, 'u-1', 'order-1')

      expect(result).toEqual({ ok: false, error: { code: 'order_not_in_pharmacy' } })
    })

    it('devuelve invalid_status si la orden no está pending', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, status: 'assigned' })

      const result = await dispensationService.claimOrder(supabase, 'u-1', 'order-1')

      expect(result).toEqual({
        ok: false,
        error: { code: 'invalid_status', status: 'assigned' },
      })
    })

    it('reclama la orden atómicamente, la asigna a la farmacia y audita', async () => {
      const result = await dispensationService.claimOrder(supabase, 'u-1', 'order-1')

      expect(result).toEqual({ ok: true, data: { status: 'assigned' } })
      expect(repoMock.claimOrder).toHaveBeenCalledWith(supabase, 'order-1', 'farmacia-1')
      expect(repoMock.logAudit).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({
          order_id: 'order-1',
          event_type: 'order_assigned',
          actor_id: 'u-1',
          actor_role: 'pharmacist',
          details: { pharmacy_id: 'farmacia-1' },
        }),
      )
    })
  })

  describe('validate', () => {
    it('devuelve invalid_validation_type para un tipo de validación inexistente', async () => {
      const result = await dispensationService.validate(supabase, 'u-1', 'order-1', {
        validation_type: 'hack_espacial',
        result: 'pass',
      })

      expect(result).toEqual({ ok: false, error: { code: 'invalid_validation_type' } })
    })

    it('devuelve invalid_result para un resultado inválido', async () => {
      const result = await dispensationService.validate(
        supabase,
        'u-1',
        'order-1',
        validationInput({ result: 'posiblemente' }),
      )

      expect(result).toEqual({ ok: false, error: { code: 'invalid_result' } })
    })

    it('devuelve override_requires_reason si el override no trae motivo', async () => {
      const result = await dispensationService.validate(
        supabase,
        'u-1',
        'order-1',
        validationInput({ result: 'overridden' }),
      )

      expect(result).toEqual({ ok: false, error: { code: 'override_requires_reason' } })
    })

    it('devuelve order_not_in_pharmacy si la orden no pertenece a la farmacia', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-otra' })

      const result = await dispensationService.validate(
        supabase,
        'u-1',
        'order-1',
        validationInput(),
      )

      expect(result).toEqual({ ok: false, error: { code: 'order_not_in_pharmacy' } })
    })

    it('devuelve invalid_status si la orden no es validable', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'dispensed' })

      const result = await dispensationService.validate(
        supabase,
        'u-1',
        'order-1',
        validationInput(),
      )

      expect(result).toEqual({
        ok: false,
        error: { code: 'invalid_status', status: 'dispensed' },
      })
    })

    it('bloquea la orden cuando una validación falla', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'under_review' })

      const result = await dispensationService.validate(
        supabase,
        'u-1',
        'order-1',
        validationInput({ validation_type: 'patient_identity', result: 'fail' }),
      )

      expect(result).toEqual({
        ok: true,
        data: { status: 'blocked', all_passed: false, completed: [], remaining: [] },
      })
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(supabase, 'order-1', 'blocked')
      expect(repoMock.logAudit).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({ event_type: 'order_blocked' }),
      )
    })

    it('auto-transiciona assigned → under_review antes de guardar la validación', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'assigned' })

      await dispensationService.validate(supabase, 'u-1', 'order-1', validationInput())

      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(supabase, 'order-1', 'under_review')
    })

    it('aprueba para despacho cuando todas las validaciones requeridas pasan', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'under_review' })
      repoMock.getValidationsForOrder.mockResolvedValue([
        { validation_type: 'patient_identity', result: 'pass' },
        { validation_type: 'prescriber_identity', result: 'pass' },
        { validation_type: 'medication_match', result: 'pass' },
        { validation_type: 'formulation_match', result: 'pass' },
        { validation_type: 'quantity_check', result: 'pass' },
        { validation_type: 'validity_check', result: 'pass' },
      ])

      const result = await dispensationService.validate(
        supabase,
        'u-1',
        'order-1',
        validationInput(),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data.status).toBe('approved_for_dispensation')
      expect(result.data.all_passed).toBe(true)
      expect(result.data.remaining).toEqual([])
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(
        supabase,
        'order-1',
        'approved_for_dispensation',
      )
    })
  })

  describe('dispense', () => {
    it('devuelve missing_fields si faltan campos obligatorios', async () => {
      const result = await dispensationService.dispense(supabase, 'u-1', 'order-1', {
        ...dispatchInput(),
        dispensed_medication: '',
      })

      expect(result).toEqual({ ok: false, error: { code: 'missing_fields' } })
    })

    it('devuelve invalid_dispense_quantity si la cantidad no es válida', async () => {
      const result = await dispensationService.dispense(
        supabase,
        'u-1',
        'order-1',
        dispatchInput({ dispensed_quantity: -5 }),
      )

      expect(result).toEqual({ ok: false, error: { code: 'invalid_dispense_quantity' } })
    })

    it('trata la cantidad 0 como campo faltante por la precedencia del servicio', async () => {
      const result = await dispensationService.dispense(
        supabase,
        'u-1',
        'order-1',
        dispatchInput({ dispensed_quantity: 0 }),
      )

      expect(result).toEqual({ ok: false, error: { code: 'missing_fields' } })
    })

    it('devuelve order_not_found si la orden no existe', async () => {
      repoMock.findOrderById.mockResolvedValue(null)

      const result = await dispensationService.dispense(supabase, 'u-1', 'order-x', dispatchInput())

      expect(result).toEqual({ ok: false, error: { code: 'order_not_found' } })
    })

    it('devuelve order_not_in_pharmacy si la orden es de otra farmacia', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-otra' })

      const result = await dispensationService.dispense(supabase, 'u-1', 'order-1', dispatchInput())

      expect(result).toEqual({ ok: false, error: { code: 'order_not_in_pharmacy' } })
    })

    it('devuelve invalid_status si la orden no está aprobada para despacho', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'under_review' })

      const result = await dispensationService.dispense(supabase, 'u-1', 'order-1', dispatchInput())

      expect(result).toEqual({
        ok: false,
        error: { code: 'invalid_status', status: 'under_review' },
      })
    })

    it('devuelve bridge_formulation_mismatch si la formulación no coincide en un puente', async () => {
      repoMock.findOrderById.mockResolvedValue({
        ...ORDER,
        pharmacy_id: 'farmacia-1',
        status: 'approved_for_dispensation',
        prescription_type: 'transition_bridge',
      })

      const result = await dispensationService.dispense(
        supabase,
        'u-1',
        'order-1',
        dispatchInput({ dispensed_formulation: 'Otro. 5mg' }),
      )

      expect(result).toEqual({ ok: false, error: { code: 'bridge_formulation_mismatch' } })
    })

    it('devuelve bridge_quantity_mismatch si la cantidad no coincide en un puente', async () => {
      repoMock.findOrderById.mockResolvedValue({
        ...ORDER,
        pharmacy_id: 'farmacia-1',
        status: 'approved_for_dispensation',
        prescription_type: 'transition_bridge',
      })

      const result = await dispensationService.dispense(
        supabase,
        'u-1',
        'order-1',
        dispatchInput({ dispensed_quantity: 15 }),
      )

      expect(result).toEqual({ ok: false, error: { code: 'bridge_quantity_mismatch' } })
    })

    it('devuelve dispense_quantity_exceeds_remaining si supera lo pendiente', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'approved_for_dispensation' })
      repoMock.getTotalDispensed.mockResolvedValue(28)

      const result = await dispensationService.dispense(
        supabase,
        'u-1',
        'order-1',
        dispatchInput({ dispensed_quantity: 5 }),
      )

      expect(result).toEqual({ ok: false, error: { code: 'dispense_quantity_exceeds_remaining' } })
    })

    it('cierra el despacho con status dispensed y actualiza la receta a dispensed_total', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'approved_for_dispensation' })

      const result = await dispensationService.dispense(supabase, 'u-1', 'order-1', dispatchInput())

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data).toEqual({
        status: 'dispensed',
        total_dispensed: 30,
        target_quantity: 30,
        prescription_status_updated: 'dispensed_total',
      })
      expect(repoMock.insertDispensationEvent).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({
          order_id: 'order-1',
          pharmacy_id: 'farmacia-1',
          dispense_status: 'dispensed',
          dispensed_quantity: 30,
        }),
      )
      expect(repoMock.updateOrderStatus).toHaveBeenCalledWith(supabase, 'order-1', 'dispensed')
      expect(repoMock.updatePrescriptionStatus).toHaveBeenCalledWith(supabase, 'rx-1', 'dispensed_total')
      expect(repoMock.logAudit).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({ event_type: 'dispensation_executed' }),
      )
    })

    it('cierra el despacho como parcial y actualiza la receta a dispensed_partial', async () => {
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'approved_for_dispensation' })

      const result = await dispensationService.dispense(
        supabase,
        'u-1',
        'order-1',
        dispatchInput({ dispensed_quantity: 28 }),
      )

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data.status).toBe('partially_dispensed')
      expect(result.data.total_dispensed).toBe(28)
      expect(result.data.prescription_status_updated).toBe('dispensed_partial')
      expect(repoMock.updatePrescriptionStatus).toHaveBeenCalledWith(supabase, 'rx-1', 'dispensed_partial')
    })

    it('registra el despacho en RNDS (REDFM) sin bloquear el cierre', async () => {
      const supabaseConFarmacia = makeSupabase({ license_number: 'CRF-RS-1234', name: 'Farmacia Central' })
      repoMock.findOrderById.mockResolvedValue({ ...ORDER, pharmacy_id: 'farmacia-1', status: 'approved_for_dispensation' })

      const result = await dispensationService.dispense(
        supabaseConFarmacia,
        'u-1',
        'order-1',
        dispatchInput(),
      )

      expect(result.ok).toBe(true)
      await vi.waitFor(() => {
        expect(redfmMock).toHaveBeenCalledWith(
          expect.objectContaining({
            dispenseOrderId: 'order-1',
            prescriptionId: 'rx-1',
            farmaceutico: expect.objectContaining({ conselhoNumero: 'CRF-RS-1234' }),
          }),
          supabaseConFarmacia,
        )
      })
    })
  })
})