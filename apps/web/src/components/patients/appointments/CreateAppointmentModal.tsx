'use client';

import { useCallback, useEffect, useState } from 'react';
import { logger } from '@autamedica/shared';
import { X, Calendar, Clock, ChevronLeft, ChevronRight, User, Stethoscope } from 'lucide-react';
import type { CreateAppointmentInput, AppointmentType } from '@/lib/patients/types/appointment';
import { useModalAccessibility } from '@/hooks/patients/useModalAccessibility';

/* ── Types ───────────────────────────────────────────────── */

interface DoctorOption {
  id: string;
  specialty: string | null;
  first_name: string | null;
  last_name: string | null;
  label: string;
}

interface SlotData {
  doctor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location: string | null;
  is_available: boolean;
}

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateAppointmentInput) => Promise<void>;
}

/* ── Helpers ─────────────────────────────────────────────── */

function getWeekRange(baseDate: Date): { from: string; to: string } {
  const day = baseDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString().split('T')[0],
    to: sunday.toISOString().split('T')[0],
  };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDaysInRange(from: string, to: string): string[] {
  const days: string[] = [];
  const current = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (current <= end) {
    days.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return days;
}

/* ── Component ───────────────────────────────────────────── */

export function CreateAppointmentModal({
  isOpen,
  onClose,
  onSubmit,
}: CreateAppointmentModalProps) {
  const [loading, setLoading] = useState(false);

  // Doctor selection
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');

  // Slots
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [weekBase, setWeekBase] = useState(() => new Date());
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null);

  // Form fields (not driven by slot)
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('telemedicine');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const { modalRef } = useModalAccessibility({ isOpen, onClose });

  /* ── Fetch doctors ───────────────────────────────────── */

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setDoctorsLoading(true);

    fetch('/api/patients/doctors', { credentials: 'include' })
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setDoctors(result.data ?? []);
        }
      })
      .catch((err) => logger.error('[CreateAppointmentModal] Error fetching doctors:', err))
      .finally(() => {
        if (!cancelled) setDoctorsLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen]);

  /* ── Fetch slots when doctor or week changes ────────── */

  const { from, to } = getWeekRange(weekBase);

  const fetchSlots = useCallback(async () => {
    if (!selectedDoctorId) {
      setSlots([]);
      return;
    }

    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/patients/doctors/${selectedDoctorId}/slots?from=${from}&to=${to}`,
        { credentials: 'include' },
      );
      const result = await res.json();
      if (result.success) {
        setSlots(result.data?.slots ?? []);
      } else {
        setSlots([]);
      }
    } catch (err) {
      logger.error('[CreateAppointmentModal] Error fetching slots:', err);
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedDoctorId, from, to]);

  useEffect(() => {
    if (isOpen) {
      fetchSlots();
    }
  }, [isOpen, fetchSlots]);

  /* ── Week navigation ─────────────────────────────────── */

  const goToPreviousWeek = () => {
    const prev = new Date(weekBase);
    prev.setDate(prev.getDate() - 7);
    // Don't go before today
    if (prev >= new Date(new Date().toDateString())) {
      setWeekBase(prev);
      setSelectedSlot(null);
    }
  };

  const goToNextWeek = () => {
    const next = new Date(weekBase);
    next.setDate(next.getDate() + 7);
    setWeekBase(next);
    setSelectedSlot(null);
  };

  /* ── Reset on close/doctor change ─────────────────── */

  useEffect(() => {
    if (!isOpen) {
      setSelectedDoctorId('');
      setSelectedSlot(null);
      setSlots([]);
      setAppointmentType('telemedicine');
      setReason('');
      setNotes('');
      setWeekBase(new Date());
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedSlot(null);
  }, [selectedDoctorId]);

  /* ── Submit ──────────────────────────────────────────── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !selectedDoctorId) return;

    setLoading(true);
    try {
      await onSubmit({
        doctor_id: selectedDoctorId,
        scheduled_at: selectedSlot.start_time,
        duration_minutes: selectedSlot.duration_minutes,
        type: appointmentType,
        reason,
        notes,
      });
    } catch (error) {
      logger.error('Error al crear cita:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  /* ── Slots grouped by day ────────────────────────────── */

  const days = getDaysInRange(from, to);
  const slotsByDay = new Map<string, SlotData[]>();
  for (const day of days) {
    slotsByDay.set(day, []);
  }
  for (const slot of slots) {
    const day = slot.date;
    const existing = slotsByDay.get(day);
    if (existing) {
      existing.push(slot);
    }
  }

  const isToday = (dateStr: string) =>
    dateStr === new Date().toISOString().split('T')[0];

  const isPastDate = (dateStr: string) =>
    new Date(dateStr + 'T23:59:59') < new Date();

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

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
        aria-labelledby="modal-title"
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <h2 id="modal-title" className="text-xl font-bold text-stone-900">
            Nueva Cita Médica
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5 text-stone-600" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* ── Step 1: Doctor Selection ──────────────── */}
          <div>
            <label
              className="block text-sm font-medium text-stone-700 mb-2"
              htmlFor="doctor-select"
            >
              <User className="h-4 w-4 inline mr-2" aria-hidden="true" />
              Profesional Médico
            </label>
            {doctorsLoading ? (
              <div className="flex items-center gap-2 text-stone-500 text-sm py-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-stone-500" />
                Cargando profesionales...
              </div>
            ) : (
              <select
                id="doctor-select"
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-800 focus:border-transparent"
                required
                aria-required="true"
              >
                <option value="">Seleccionar profesional...</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.label}
                    {doc.specialty ? ` — ${doc.specialty}` : ''}
                  </option>
                ))}
              </select>
            )}
            {selectedDoctor?.specialty && (
              <p className="mt-1 text-xs text-stone-500 flex items-center gap-1">
                <Stethoscope className="h-3 w-3" aria-hidden="true" />
                {selectedDoctor.specialty}
              </p>
            )}
          </div>

          {/* ── Step 2: Weekly Slot Calendar ──────────── */}
          {selectedDoctorId && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-stone-700">
                  <Calendar className="h-4 w-4 inline mr-2" aria-hidden="true" />
                  Horarios Disponibles
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPreviousWeek}
                    className="p-1 rounded hover:bg-stone-100 transition-colors disabled:opacity-30"
                    disabled={isPastDate(from)}
                    aria-label="Semana anterior"
                  >
                    <ChevronLeft className="h-4 w-4 text-stone-600" />
                  </button>
                  <span className="text-xs text-stone-500 min-w-[140px] text-center">
                    {new Date(from + 'T12:00:00').toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {' — '}
                    {new Date(to + 'T12:00:00').toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={goToNextWeek}
                    className="p-1 rounded hover:bg-stone-100 transition-colors"
                    aria-label="Semana siguiente"
                  >
                    <ChevronRight className="h-4 w-4 text-stone-600" />
                  </button>
                </div>
              </div>

              {slotsLoading ? (
                <div className="flex items-center justify-center py-8 text-stone-500 text-sm">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-stone-500 mr-2" />
                  Cargando horarios...
                </div>
              ) : (
                <>
                  {/* Desktop: 7-column grid */}
                  <div className="hidden md:grid grid-cols-7 gap-1 border border-stone-200 rounded-lg overflow-hidden">
                    {days.map((day) => {
                      const daySlots = (slotsByDay.get(day) ?? []).filter((s) => s.is_available);
                      const past = isPastDate(day);

                      return (
                        <div key={day} className="min-h-[120px]">
                          <div
                            className={`px-2 py-1.5 text-center text-xs font-medium border-b ${
                              isToday(day)
                                ? 'bg-stone-800 text-white'
                                : 'bg-stone-50 text-stone-600'
                            }`}
                          >
                            {formatDate(day)}
                          </div>
                          <div className="p-1 space-y-1 max-h-[200px] overflow-y-auto">
                            {past ? (
                              <p className="text-[10px] text-stone-300 text-center py-2">Pasado</p>
                            ) : daySlots.length === 0 ? (
                              <p className="text-[10px] text-stone-300 text-center py-2">
                                Sin horarios
                              </p>
                            ) : (
                              daySlots.map((slot) => {
                                const isSelected =
                                  selectedSlot?.start_time === slot.start_time;
                                return (
                                  <button
                                    key={slot.start_time}
                                    type="button"
                                    onClick={() => setSelectedSlot(slot)}
                                    className={`w-full text-xs px-1.5 py-1 rounded transition-colors ${
                                      isSelected
                                        ? 'bg-stone-800 text-white'
                                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                    }`}
                                  >
                                    {formatTime(slot.start_time)}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mobile: vertical list by day */}
                  <div className="md:hidden space-y-3">
                    {days.map((day) => {
                      const daySlots = (slotsByDay.get(day) ?? []).filter((s) => s.is_available);
                      const past = isPastDate(day);
                      if (past || daySlots.length === 0) return null;

                      return (
                        <div key={day}>
                          <p
                            className={`text-xs font-medium mb-1.5 ${
                              isToday(day) ? 'text-stone-900' : 'text-stone-600'
                            }`}
                          >
                            {formatDate(day)}
                            {isToday(day) && (
                              <span className="ml-1 text-stone-400">(hoy)</span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {daySlots.map((slot) => {
                              const isSelected =
                                selectedSlot?.start_time === slot.start_time;
                              return (
                                <button
                                  key={slot.start_time}
                                  type="button"
                                  onClick={() => setSelectedSlot(slot)}
                                  className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                                    isSelected
                                      ? 'bg-stone-800 text-white'
                                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                  }`}
                                >
                                  {formatTime(slot.start_time)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {days.every(
                      (day) =>
                        isPastDate(day) ||
                        (slotsByDay.get(day) ?? []).filter((s) => s.is_available).length === 0,
                    ) && (
                      <p className="text-sm text-stone-400 text-center py-4">
                        No hay horarios disponibles esta semana
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Selected slot summary */}
              {selectedSlot && (
                <div className="mt-3 flex items-center gap-2 p-3 bg-stone-50 border border-stone-200 rounded-lg text-sm">
                  <Clock className="h-4 w-4 text-stone-500" aria-hidden="true" />
                  <span className="text-stone-700">
                    {new Date(selectedSlot.start_time).toLocaleDateString('es-AR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                    {' a las '}
                    {formatTime(selectedSlot.start_time)}
                    {' — '}
                    {selectedSlot.duration_minutes} min
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Type, Reason, Notes ──────────── */}
          {selectedSlot && (
            <>
              <div>
                <label htmlFor="appointment-type" className="block text-sm font-medium text-stone-700 mb-2">
                  Tipo de Cita
                </label>
                <select
                  id="appointment-type"
                  value={appointmentType}
                  onChange={(e) => setAppointmentType(e.target.value as AppointmentType)}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-800 focus:border-transparent"
                >
                  <option value="telemedicine">Telemedicina</option>
                  <option value="in_person">Presencial</option>
                  <option value="follow_up">Seguimiento</option>
                  <option value="emergency">Emergencia</option>
                </select>
              </div>

              <div>
                <label htmlFor="appointment-reason" className="block text-sm font-medium text-stone-700 mb-2">
                  Motivo de la Consulta
                </label>
                <input
                  id="appointment-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ej: Consulta general, dolor de cabeza..."
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-800 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="appointment-notes" className="block text-sm font-medium text-stone-700 mb-2">
                  Notas Adicionales (opcional)
                </label>
                <textarea
                  id="appointment-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Información adicional que el médico deba saber..."
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-800 focus:border-transparent resize-none"
                />
              </div>
            </>
          )}

          {/* ── Buttons ──────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 text-stone-700 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !selectedSlot || !selectedDoctorId}
              className="flex-1 px-4 py-2 text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creando...' : 'Crear Cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
