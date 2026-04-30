'use client';

import { useState } from 'react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@autamedica/ui';
import { Card } from '@autamedica/ui';
import { Check, X } from 'lucide-react';
import { requiresStrictPrescriptionValidation } from '@/lib/prescriptions/strict-validation';

interface ValidationPanelProps {
  order: {
    id: string;
    medication: string | null;
    formulation: string | null;
    dose_mg_per_day: number | null;
    quantity_units: number | null;
    prescription_type: string;
    extraordinary_dose_flag: boolean;
    clinical_semaphore: string | null;
    semaphore_reasons: string[] | null;
  };
  onComplete: () => void;
  statusLabels: Record<string, string>;
}

interface ValidationResponse {
  status: string;
  all_passed: boolean;
  completed?: string[];
  remaining?: string[];
}

interface ClarificationResponse {
  clarificationId: string;
  orderStatus: string;
  expiresAt: string;
}

const CLARIFICATION_CATEGORY_OPTIONS = [
  { value: 'dose_verification', label: 'Verificación de dosis' },
  { value: 'formulation_mismatch', label: 'Formulación / presentación' },
  { value: 'duration_concern', label: 'Duración / cantidad' },
  { value: 'interaction_alert', label: 'Interacción o seguridad' },
  { value: 'bridge_protocol', label: 'Protocolo bridge' },
  { value: 'identity_concern', label: 'Identidad / prescriptor' },
  { value: 'other', label: 'Otro motivo' },
] as const;

type ClarificationCategory = typeof CLARIFICATION_CATEGORY_OPTIONS[number]['value'];

const BASE_VALIDATIONS = [
  { type: 'patient_identity', label: 'Identidad del paciente', description: 'Verificar DNI/CUIL del paciente' },
  { type: 'prescriber_identity', label: 'Identidad del prescriptor', description: 'Verificar matrícula del médico' },
  { type: 'medication_match', label: 'Coincidencia de medicamento', description: 'El medicamento solicitado coincide con la receta' },
  { type: 'formulation_match', label: 'Formulación correcta', description: 'La presentación farmacéutica es la indicada' },
  { type: 'quantity_check', label: 'Cantidad verificada', description: 'La cantidad solicitada es correcta' },
  { type: 'validity_check', label: 'Vigencia de la receta', description: 'La receta está dentro del período de validez' },
];

const EXTRA_VALIDATIONS = [
  { type: 'dose_check', label: 'Verificación de dosis', description: 'Dosis extraordinaria requiere revisión', condition: 'extraordinary_dose' },
  { type: 'bridge_protocol', label: 'Protocolo bridge', description: 'Prescripción puente — verificar cumplimiento', condition: 'bridge' },
  { type: 'controlled_substance', label: 'Sustancia controlada', description: 'Verificación ANMAT para sustancias controladas', condition: 'controlled' },
];

function getClarificationCategory(validationType: string): ClarificationCategory {
  switch (validationType) {
    case 'dose_check':
      return 'dose_verification';
    case 'formulation_match':
    case 'medication_match':
      return 'formulation_mismatch';
    case 'quantity_check':
    case 'validity_check':
      return 'duration_concern';
    case 'bridge_protocol':
      return 'bridge_protocol';
    case 'patient_identity':
    case 'prescriber_identity':
      return 'identity_concern';
    default:
      return 'other';
  }
}

function buildClarificationQuestion(validationType: string, order: ValidationPanelProps['order']): string {
  const medication = order.medication ?? 'la medicación indicada';

  switch (validationType) {
    case 'dose_check':
      return `Necesitamos confirmar la dosis indicada para ${medication} antes de continuar con la dispensación.`;
    case 'formulation_match':
      return `Necesitamos confirmar la formulación o presentación correcta de ${medication}.`;
    case 'medication_match':
      return `Hay una discrepancia con el medicamento informado. ¿Podés confirmar si ${medication} es el medicamento correcto?`;
    case 'quantity_check':
      return `Necesitamos confirmar la cantidad total a dispensar para ${medication}.`;
    case 'validity_check':
      return `Necesitamos confirmar la vigencia operativa de la receta para ${medication}.`;
    case 'patient_identity':
      return 'Necesitamos confirmar la identidad del paciente antes de continuar con la dispensación.';
    case 'prescriber_identity':
      return 'Necesitamos confirmar la identidad o matrícula del prescriptor antes de continuar con la dispensación.';
    case 'bridge_protocol':
      return `Necesitamos una aclaración sobre el protocolo bridge aplicado a ${medication}.`;
    default:
      return `Necesitamos una aclaración clínica o operativa para continuar con la dispensación de ${medication}.`;
  }
}

export function ValidationPanel({ order, onComplete }: ValidationPanelProps) {
  const [completedValidations, setCompletedValidations] = useState<Set<string>>(new Set());
  const [currentValidation, setCurrentValidation] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [failedValidationType, setFailedValidationType] = useState<string | null>(null);
  const [clarificationCategory, setClarificationCategory] = useState<ClarificationCategory>('other');
  const [clarificationQuestion, setClarificationQuestion] = useState('');
  const [clarificationSubmitting, setClarificationSubmitting] = useState(false);
  const [clarificationError, setClarificationError] = useState<string | null>(null);

  const isControlledSubstance = requiresStrictPrescriptionValidation(order.medication ?? '');

  const allValidations = [
    ...BASE_VALIDATIONS,
    ...(order.extraordinary_dose_flag
      ? EXTRA_VALIDATIONS.filter(v => v.condition === 'extraordinary_dose')
      : []),
    ...(order.prescription_type === 'transition_bridge'
      ? EXTRA_VALIDATIONS.filter(v => v.condition === 'bridge')
      : []),
    ...(isControlledSubstance
      ? EXTRA_VALIDATIONS.filter(v => v.condition === 'controlled')
      : []),
  ];

  const handleValidate = async (validationType: string, result: 'pass' | 'fail') => {
    setProcessing(true);
    setCurrentValidation(validationType);

    try {
      const response = await fetchApi<ValidationResponse>(
        `/api/pharmacy/orders/${order.id}/validate`,
        { body: { validation_type: validationType, result } }
      );

      if (result === 'pass') {
        setCompletedValidations(prev => new Set([...prev, validationType]));
      }

      if (response.status === 'approved_for_dispensation') {
        setOrderStatus('approved_for_dispensation');
      } else if (response.status === 'blocked') {
        setOrderStatus('blocked');
        setFailedValidationType(validationType);
        setClarificationCategory(getClarificationCategory(validationType));
        setClarificationQuestion(buildClarificationQuestion(validationType, order));
        setClarificationError(null);
      }
    } catch (err) {
      logger.error('[ValidationPanel] Error', err);
    } finally {
      setProcessing(false);
      setCurrentValidation(null);
    }
  };

  const handleRequestClarification = async () => {
    if (!clarificationQuestion.trim()) {
      setClarificationError('Escribí la aclaración que necesitás enviar al prescriptor.');
      return;
    }

    setClarificationSubmitting(true);
    setClarificationError(null);

    try {
      await fetchApi<ClarificationResponse>(
        `/api/pharmacy/orders/${order.id}/clarify`,
        {
          body: {
            question: clarificationQuestion.trim(),
            question_category: clarificationCategory,
          },
        }
      );
      setOrderStatus('clarification_requested');
    } catch (err) {
      logger.error('[ValidationPanel] Clarification request error', err);
      setClarificationError(err instanceof Error ? err.message : 'No se pudo enviar la aclaración.');
    } finally {
      setClarificationSubmitting(false);
    }
  };

  if (orderStatus === 'approved_for_dispensation') {
    return (
      <Card variant="outlined" padding="lg" className="border-green-200 text-center">
        <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-am-surface-900 mb-2">Orden aprobada para dispensación</h2>
        <p className="text-sm text-am-surface-500 mb-6">Todas las validaciones pasaron exitosamente.</p>
        <Button variant="primary" onClick={onComplete} className="bg-emerald-600 hover:bg-emerald-700">
          Volver al listado
        </Button>
      </Card>
    );
  }

  if (orderStatus === 'blocked') {
    const failedValidation = allValidations.find(validation => validation.type === failedValidationType);

    return (
      <Card variant="outlined" padding="lg" className="border-red-200">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <X className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-am-surface-900 mb-2 text-center">Orden bloqueada</h2>
        <p className="text-sm text-am-surface-500 mb-6 text-center">
          La validación se frenó y ahora podés pedir una aclaración real al prescriptor desde esta misma pantalla.
        </p>

        {failedValidation && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>Validación observada:</strong> {failedValidation.label}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-am-surface-500">
              Motivo
            </label>
            <select
              value={clarificationCategory}
              onChange={(event) => setClarificationCategory(event.target.value as ClarificationCategory)}
              className="w-full rounded-xl border border-am-surface-200 bg-white px-3 py-2.5 text-sm text-am-surface-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {CLARIFICATION_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-am-surface-500">
              Consulta para el prescriptor
            </label>
            <textarea
              value={clarificationQuestion}
              onChange={(event) => setClarificationQuestion(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-am-surface-200 bg-white px-3 py-2.5 text-sm text-am-surface-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="Describí qué necesitás confirmar antes de dispensar."
            />
          </div>

          {clarificationError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {clarificationError}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onComplete} disabled={clarificationSubmitting}>
              Volver al listado
            </Button>
            <Button
              variant="primary"
              onClick={handleRequestClarification}
              disabled={clarificationSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {clarificationSubmitting ? 'Enviando aclaración...' : 'Solicitar aclaración'}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (orderStatus === 'clarification_requested') {
    return (
      <Card variant="outlined" padding="lg" className="border-orange-200 text-center">
        <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7 text-orange-600" />
        </div>
        <h2 className="text-lg font-semibold text-am-surface-900 mb-2">Aclaración enviada</h2>
        <p className="text-sm text-am-surface-500 mb-6">
          La consulta ya quedó enviada al prescriptor. La orden volverá a revisión cuando llegue la respuesta.
        </p>
        <Button variant="secondary" onClick={onComplete}>
          Volver al listado
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card variant="elevated" padding="sm">
        <h3 className="text-sm font-semibold text-am-surface-900 mb-2">Detalle de la orden</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-am-surface-400">Medicamento</span>
            <p className="text-am-surface-900 font-medium">{order.medication ?? '—'}</p>
          </div>
          <div>
            <span className="text-am-surface-400">Formulación</span>
            <p className="text-am-surface-900 font-medium">{order.formulation ?? '—'}</p>
          </div>
          <div>
            <span className="text-am-surface-400">Dosis</span>
            <p className="text-am-surface-900 font-medium">{order.dose_mg_per_day ? `${order.dose_mg_per_day} mg/día` : '—'}</p>
          </div>
          <div>
            <span className="text-am-surface-400">Cantidad</span>
            <p className="text-am-surface-900 font-medium">{order.quantity_units ? `${order.quantity_units} unidades` : '—'}</p>
          </div>
        </div>
        {order.clinical_semaphore === 'red' && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            <strong>Semáforo rojo:</strong> esta orden requiere revisión adicional antes de la dispensación.
            {order.semaphore_reasons && order.semaphore_reasons.length > 0 && (
              <ul className="list-disc list-inside mt-1">
                {order.semaphore_reasons.map((reason, i) => <li key={i}>{reason}</li>)}
              </ul>
            )}
          </div>
        )}
        {order.clinical_semaphore === 'yellow' && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 text-xs text-yellow-700">
            <strong>Semáforo amarillo:</strong> precaución — revisar con atención antes de dispensar.
            {order.semaphore_reasons && order.semaphore_reasons.length > 0 && (
              <ul className="list-disc list-inside mt-1">
                {order.semaphore_reasons.map((reason, i) => <li key={i}>{reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card variant="elevated" padding="none">
        <div className="px-4 py-3 border-b border-am-surface-200">
          <span className="text-sm font-semibold text-am-surface-900">
            Validaciones requeridas ({completedValidations.size}/{allValidations.length})
          </span>
        </div>
        <div className="divide-y divide-am-surface-100">
          {allValidations.map(validation => {
            const isCompleted = completedValidations.has(validation.type);
            const isCurrent = currentValidation === validation.type;

            return (
              <div key={validation.type} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {isCompleted ? (
                    <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-green-600" />
                    </span>
                  ) : (
                    <span className="w-6 h-6 rounded-full border-2 border-am-surface-200 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${isCompleted ? 'text-am-surface-400 line-through' : 'text-am-surface-900'}`}>
                      {validation.label}
                    </p>
                    <p className="text-xs text-am-surface-400 truncate">{validation.description}</p>
                  </div>
                </div>

                {!isCompleted && (
                  <div className="flex items-center gap-2 shrink-0">
                    {isCurrent && processing ? (
                      <div className="h-5 w-5 border-2 border-am-surface-200 border-t-emerald-600 rounded-full animate-spin" />
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleValidate(validation.type, 'pass')}
                          disabled={processing}
                          className="bg-green-50 text-green-700 hover:bg-green-100"
                        >
                          Aprobado
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleValidate(validation.type, 'fail')}
                          disabled={processing}
                          className="bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
