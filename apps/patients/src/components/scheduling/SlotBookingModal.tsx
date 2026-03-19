'use client';

import { useState } from 'react';
import { X, Calendar, Loader2 } from 'lucide-react';
import { useSupabase } from '@autamedica/auth/react';
import { logger } from '@autamedica/shared';
import type { ScheduleSlot } from '@autamedica/types';
import { useModalAccessibility } from '@/hooks/useModalAccessibility';
import { SlotPicker } from './SlotPicker';
import { WaitlistButton } from './WaitlistButton';

interface SlotBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctorId: string;
  doctorName?: string;
  onBooked?: () => void;
}

type AppointmentType = 'telemedicine' | 'consultation' | 'follow_up' | 'emergency';

export function SlotBookingModal({
  isOpen,
  onClose,
  doctorId,
  doctorName,
  onBooked,
}: SlotBookingModalProps) {
  const supabase = useSupabase();
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('telemedicine');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { modalRef } = useModalAccessibility({ isOpen, onClose });

  if (!isOpen) return null;

  const handleBook = async () => {
    if (!selectedSlot) return;
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData, error: authError } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null }, error: null };

      if (authError) {
        throw authError;
      }

      const accessToken = sessionData.session?.access_token;

      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          doctor_id: doctorId,
          scheduled_at: selectedSlot.start_time,
          duration_minutes: selectedSlot.duration_minutes,
          type: appointmentType,
          notes: [reason, notes].filter(Boolean).join(' — ') || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al agendar turno');
      }

      onBooked?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al agendar';
      setError(msg);
      logger.error(`SlotBookingModal error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-200">
          <div>
            <h2 id="booking-modal-title" className="text-lg font-bold text-stone-900">
              Agendar Turno
            </h2>
            {doctorName && (
              <p className="text-sm text-stone-500 mt-0.5">
                Dr. {doctorName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5 text-stone-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Slot Picker */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              <Calendar className="h-4 w-4 inline mr-1.5" />
              Seleccioná un turno disponible
            </label>
            <SlotPicker
              doctorId={doctorId}
              onSelect={setSelectedSlot}
              selectedSlot={selectedSlot}
            />
          </div>

          {/* Selected slot summary */}
          {selectedSlot && (
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-sm">
              <span className="font-medium text-stone-800">Turno seleccionado: </span>
              <span className="text-stone-600">
                {new Date(selectedSlot.start_time).toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}{' '}
                a las{' '}
                {new Date(selectedSlot.start_time).toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {' '}({selectedSlot.duration_minutes} min)
              </span>
            </div>
          )}

          {/* Appointment type */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Tipo de consulta
            </label>
            <select
              value={appointmentType}
              onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-800 focus:border-transparent"
            >
              <option value="telemedicine">Telemedicina</option>
              <option value="consultation">Presencial</option>
              <option value="follow_up">Seguimiento</option>
              <option value="emergency">Emergencia</option>
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Motivo de consulta
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Dolor de cabeza, control anual..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-800 focus:border-transparent"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Notas adicionales (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Información que el médico deba conocer..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-stone-800 focus:border-transparent resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2.5">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm text-stone-700 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleBook}
              disabled={loading || !selectedSlot}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Agendando...
                </>
              ) : (
                'Confirmar Turno'
              )}
            </button>
          </div>

          {/* Waitlist */}
          <div className="border-t border-stone-200 pt-4">
            <p className="text-xs text-stone-500 mb-2">
              ¿No encontrás turno disponible?
            </p>
            <WaitlistButton doctorId={doctorId} doctorName={doctorName} />
          </div>
        </div>
      </div>
    </div>
  );
}
