'use client';

import { useState } from 'react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@autamedica/ui';
import { Card } from '@autamedica/ui';
import { Check, X } from 'lucide-react';

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

export function ValidationPanel({ order, onComplete }: ValidationPanelProps) {
  const [completedValidations, setCompletedValidations] = useState<Set<string>>(new Set());
  const [currentValidation, setCurrentValidation] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);

  const allValidations = [
    ...BASE_VALIDATIONS,
    ...(order.extraordinary_dose_flag
      ? EXTRA_VALIDATIONS.filter(v => v.condition === 'extraordinary_dose')
      : []),
    ...(order.prescription_type === 'transition_bridge'
      ? EXTRA_VALIDATIONS.filter(v => v.condition === 'bridge')
      : []),
    ...EXTRA_VALIDATIONS.filter(v => v.condition === 'controlled'),
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
      }
    } catch (err) {
      logger.error('[ValidationPanel] Error', err);
    } finally {
      setProcessing(false);
      setCurrentValidation(null);
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
    return (
      <Card variant="outlined" padding="lg" className="border-red-200 text-center">
        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <X className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-am-surface-900 mb-2">Orden bloqueada</h2>
        <p className="text-sm text-am-surface-500 mb-6">Una validación falló. Se requiere aclaración del prescriptor.</p>
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
