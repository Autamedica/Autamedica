'use client';

import { useState } from 'react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';

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
    substitution_type: 'none',
    substitution_reason: '',
    pharmacy_notes: '',
  });

  const [dispensing, setDispensing] = useState(false);
  const [result, setResult] = useState<DispenseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }));

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
            substitution_type: form.substitution_type !== 'none' ? form.substitution_type : undefined,
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
    return (
      <div className="bg-white rounded-2xl shadow-am-md border border-green-200 p-8 text-center">
        <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
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
            style={{ width: `${Math.min(100, (result.total_dispensed / result.target_quantity) * 100)}%` }}
          />
        </div>
        <button
          onClick={onComplete}
          className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
        >
          Volver al listado
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleDispense} className="space-y-4">
      {isBridge && (
        <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 text-sm text-purple-800">
          <strong>Prescripción puente:</strong> la formulación y cantidad deben coincidir exactamente con la receta.
          No se permiten sustituciones.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-am-sm border border-am-surface-200 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-am-surface-900">Medicamento dispensado</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-am-surface-700 mb-1">Medicamento</label>
            <input
              type="text"
              value={form.dispensed_medication}
              onChange={set('dispensed_medication')}
              disabled={isBridge}
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm disabled:bg-am-surface-50 disabled:text-am-surface-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-am-surface-700 mb-1">Formulación</label>
            <input
              type="text"
              value={form.dispensed_formulation}
              onChange={set('dispensed_formulation')}
              disabled={isBridge}
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm disabled:bg-am-surface-50 disabled:text-am-surface-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-am-surface-700 mb-1">Cantidad (unidades)</label>
            <input
              type="number"
              value={form.dispensed_quantity}
              onChange={set('dispensed_quantity')}
              disabled={isBridge}
              min={1}
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm disabled:bg-am-surface-50 disabled:text-am-surface-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-am-surface-700 mb-1">Lote</label>
            <input
              type="text"
              value={form.batch_number}
              onChange={set('batch_number')}
              placeholder="N° de lote"
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm placeholder:text-am-surface-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-am-surface-700 mb-1">Vencimiento</label>
            <input
              type="date"
              value={form.expiry_date}
              onChange={set('expiry_date')}
              className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Substitution (only for non-bridge) */}
      {!isBridge && (
        <div className="bg-white rounded-xl shadow-am-sm border border-am-surface-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-am-surface-900">Sustitución (si aplica)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-am-surface-700 mb-1">Tipo</label>
              <select
                value={form.substitution_type}
                onChange={set('substitution_type')}
                className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="none">Sin sustitución</option>
                <option value="generic_equivalent">Equivalente genérico</option>
                <option value="therapeutic_equivalent">Equivalente terapéutico</option>
                <option value="emergency_substitute">Sustituto de emergencia</option>
              </select>
            </div>
            {form.substitution_type !== 'none' && (
              <div>
                <label className="block text-xs font-medium text-am-surface-700 mb-1">Motivo</label>
                <input
                  type="text"
                  value={form.substitution_reason}
                  onChange={set('substitution_reason')}
                  placeholder="Razón de la sustitución"
                  className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm placeholder:text-am-surface-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-xl shadow-am-sm border border-am-surface-200 p-4">
        <label className="block text-xs font-medium text-am-surface-700 mb-1">Notas de farmacia (opcional)</label>
        <textarea
          value={form.pharmacy_notes}
          onChange={set('pharmacy_notes')}
          placeholder="Indicaciones al paciente, observaciones..."
          rows={2}
          className="w-full rounded-lg border border-am-surface-200 px-3 py-2 text-sm placeholder:text-am-surface-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      <button
        type="submit"
        disabled={dispensing}
        className="w-full py-3 rounded-xl shadow-am-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
      >
        {dispensing ? (
          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Confirmar dispensación
          </>
        )}
      </button>
    </form>
  );
}
