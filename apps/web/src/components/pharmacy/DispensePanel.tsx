'use client';

import { useState } from 'react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';
import { Button } from '@autamedica/ui';
import { Card } from '@autamedica/ui';
import { Check } from 'lucide-react';

interface DispensePanelProps {
  order: {
    id: string;
    medication: string | null;
    formulation: string | null;
    quantity_units: number | null;
    prescription_type: string;
  };
  onComplete: () => void;
}

interface DispenseResponse {
  status: string;
  total_dispensed: number;
  target_quantity: number;
  prescription_status_updated: string;
}

export function DispensePanel({ order, onComplete }: DispensePanelProps) {
  const isBridge = order.prescription_type === 'transition_bridge';

  const [form, setForm] = useState({
    dispensed_medication: order.medication ?? '',
    dispensed_formulation: order.formulation ?? '',
    dispensed_quantity: order.quantity_units ?? 0,
    batch_number: '',
    expiry_date: '',
    substitution_type: '',
    substitution_reason: '',
    pharmacy_notes: '',
  });

  const [dispensing, setDispensing] = useState(false);
  const [result, setResult] = useState<DispenseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = e.target.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value;
      setForm(prev => ({ ...prev, [key]: value }));
    };

  const handleDispense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.dispensed_medication || !form.dispensed_formulation || !form.dispensed_quantity) {
      setError('Medicamento, formulación y cantidad son obligatorios');
      return;
    }

    setDispensing(true);
    setError(null);

    try {
      const response = await fetchApi<DispenseResponse>(
        `/api/pharmacy/orders/${order.id}/dispense`,
        {
          body: {
            dispensed_medication: form.dispensed_medication,
            dispensed_formulation: form.dispensed_formulation,
            dispensed_quantity: Number(form.dispensed_quantity),
            batch_number: form.batch_number || undefined,
            expiry_date: form.expiry_date || undefined,
            substitution_type: form.substitution_type || undefined,
            substitution_reason: form.substitution_reason || undefined,
            pharmacy_notes: form.pharmacy_notes || undefined,
          },
        }
      );
      setResult(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al dispensar';
      logger.error('[DispensePanel] Error', err);
      setError(message);
    } finally {
      setDispensing(false);
    }
  };

  if (result) {
    const isComplete = result.status === 'dispensed';
    const pct = Math.min(100, (result.total_dispensed / result.target_quantity) * 100);
    return (
      <Card variant="outlined" padding="lg" className="border-green-200 text-center">
        <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-am-surface-900 mb-2">
          {isComplete ? 'Dispensación completa' : 'Dispensación parcial registrada'}
        </h2>
        <p className="text-sm text-am-surface-500 mb-2">
          {result.total_dispensed} de {result.target_quantity} unidades dispensadas
        </p>
        <div className="w-full bg-am-surface-100 rounded-full h-2 mb-6">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex gap-3 justify-center">
          {!isComplete && (
            <Button variant="primary" onClick={() => setResult(null)} className="bg-emerald-600 hover:bg-emerald-700">
              Dispensar cantidad restante
            </Button>
          )}
          <Button variant="secondary" onClick={onComplete}>
            Volver al listado
          </Button>
        </div>
      </Card>
    );
  }

  const inputClass = "w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm disabled:bg-am-surface-50 disabled:text-am-surface-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

  return (
    <form onSubmit={handleDispense} className="space-y-4">
      {isBridge && (
        <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 text-sm text-purple-800">
          <strong>Prescripción puente:</strong> la formulación y cantidad deben coincidir exactamente con la receta.
          No se permiten sustituciones.
        </div>
      )}

      <Card variant="elevated" padding="sm">
        <h3 className="text-sm font-semibold text-am-surface-900 mb-4">Medicamento dispensado</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="dispensed_medication" className="block text-xs font-medium text-am-surface-700 mb-1">Medicamento <span className="text-red-500">*</span></label>
            <input id="dispensed_medication" type="text" required value={form.dispensed_medication} onChange={set('dispensed_medication')} disabled={isBridge} className={inputClass} />
          </div>
          <div>
            <label htmlFor="dispensed_formulation" className="block text-xs font-medium text-am-surface-700 mb-1">Formulación <span className="text-red-500">*</span></label>
            <input id="dispensed_formulation" type="text" required value={form.dispensed_formulation} onChange={set('dispensed_formulation')} disabled={isBridge} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div>
            <label htmlFor="dispensed_quantity" className="block text-xs font-medium text-am-surface-700 mb-1">Cantidad (unidades) <span className="text-red-500">*</span></label>
            <input id="dispensed_quantity" type="number" required value={form.dispensed_quantity} onChange={set('dispensed_quantity')} disabled={isBridge} min={1} className={inputClass} />
          </div>
          <div>
            <label htmlFor="batch_number" className="block text-xs font-medium text-am-surface-700 mb-1">Lote</label>
            <input id="batch_number" type="text" value={form.batch_number} onChange={set('batch_number')} placeholder="N° de lote" className={inputClass} />
          </div>
          <div>
            <label htmlFor="expiry_date" className="block text-xs font-medium text-am-surface-700 mb-1">Vencimiento</label>
            <input id="expiry_date" type="date" value={form.expiry_date} onChange={set('expiry_date')} className={inputClass} />
          </div>
        </div>
      </Card>

      {!isBridge && (
        <Card variant="elevated" padding="sm">
          <h3 className="text-sm font-semibold text-am-surface-900 mb-3">Sustitución (si aplica)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-am-surface-700 mb-1">Tipo</label>
              <select value={form.substitution_type} onChange={set('substitution_type')} className={inputClass}>
                
                <option value="generic_equivalent">Equivalente genérico</option>
                <option value="therapeutic_equivalent">Equivalente terapéutico</option>
                <option value="emergency_substitute">Sustituto de emergencia</option>
              </select>
            </div>
            <div>
                <label className="block text-xs font-medium text-am-surface-700 mb-1">Motivo</label>
                <input type="text" value={form.substitution_reason} onChange={set('substitution_reason')} placeholder="Razón de la sustitución" className={inputClass} />
              </div>
          </div>
        </Card>
      )}

      <Card variant="elevated" padding="sm">
        <label className="block text-xs font-medium text-am-surface-700 mb-1">Notas de farmacia (opcional)</label>
        <textarea
          value={form.pharmacy_notes}
          onChange={set('pharmacy_notes')}
          placeholder="Indicaciones al paciente, observaciones..."
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </Card>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        loading={dispensing}
        icon={<Check className="w-4 h-4" />}
        className="bg-emerald-600 hover:bg-emerald-700"
      >
        Confirmar dispensación
      </Button>
    </form>
  );
}
