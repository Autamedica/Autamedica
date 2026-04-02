'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@autamedica/shared';
import {
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  UserRound,
  Stethoscope,
  Video,
  MapPin,
  MessageSquare,
  ArrowRight,
  Check,
} from 'lucide-react';
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

function formatDayShort(dateStr: string): { weekday: string; day: string } {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    weekday: d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
    day: d.toLocaleDateString('es-AR', { day: 'numeric' }),
  };
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

const APPOINTMENT_TYPES: { value: AppointmentType; label: string; icon: typeof Video; desc: string }[] = [
  { value: 'telemedicine', label: 'Telemedicina', icon: Video, desc: 'Consulta por videollamada' },
  { value: 'in_person', label: 'Presencial', icon: MapPin, desc: 'Consulta en consultorio' },
  { value: 'follow_up', label: 'Seguimiento', icon: ArrowRight, desc: 'Control posterior' },
  { value: 'emergency', label: 'Urgencia', icon: Clock, desc: 'Atención prioritaria' },
];

/* ── Component ───────────────────────────────────────────── */

export function CreateAppointmentModal({
  isOpen,
  onClose,
  onSubmit,
}: CreateAppointmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [weekBase, setWeekBase] = useState(() => new Date());
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null);
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('telemedicine');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
        if (result.success) setDoctors(result.data ?? []);
      })
      .catch((err) => logger.error('[CreateAppointmentModal] Error:', err))
      .finally(() => { if (!cancelled) setDoctorsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  /* ── Fetch slots ──────────────────────────────────────── */

  const { from, to } = getWeekRange(weekBase);

  const fetchSlots = useCallback(async () => {
    if (!selectedDoctorId) { setSlots([]); return; }
    setSlotsLoading(true);
    try {
      const res = await fetch(
        `/api/patients/doctors/${selectedDoctorId}/slots?from=${from}&to=${to}`,
        { credentials: 'include' },
      );
      const result = await res.json();
      setSlots(result.success ? (result.data?.slots ?? []) : []);
    } catch (err) {
      logger.error('[CreateAppointmentModal] Slots error:', err);
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedDoctorId, from, to]);

  useEffect(() => { if (isOpen) fetchSlots(); }, [isOpen, fetchSlots]);

  /* ── Week navigation ──────────────────────────────────── */

  const goToPreviousWeek = () => {
    const prev = new Date(weekBase);
    prev.setDate(prev.getDate() - 7);
    if (prev >= new Date(new Date().toDateString())) {
      setWeekBase(prev);
      setSelectedSlot(null);
      setSelectedDay(null);
    }
  };

  const goToNextWeek = () => {
    const next = new Date(weekBase);
    next.setDate(next.getDate() + 7);
    setWeekBase(next);
    setSelectedSlot(null);
    setSelectedDay(null);
  };

  /* ── Reset ────────────────────────────────────────────── */

  useEffect(() => {
    if (!isOpen) {
      setSelectedDoctorId('');
      setSelectedSlot(null);
      setSelectedDay(null);
      setSlots([]);
      setAppointmentType('telemedicine');
      setReason('');
      setNotes('');
      setWeekBase(new Date());
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedSlot(null);
    setSelectedDay(null);
  }, [selectedDoctorId]);

  /* ── Submit ───────────────────────────────────────────── */

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

  /* ── Computed ──────────────────────────────────────────── */

  const days = useMemo(() => getDaysInRange(from, to), [from, to]);
  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, SlotData[]>();
    for (const day of days) grouped.set(day, []);
    for (const slot of slots) {
      const existing = grouped.get(slot.date);
      if (existing) existing.push(slot);
    }
    return grouped;
  }, [days, slots]);

  const isToday = (dateStr: string) => dateStr === new Date().toISOString().split('T')[0];
  const isPastDate = (dateStr: string) => new Date(dateStr + 'T23:59:59') < new Date();
  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  const activeDaySlots = selectedDay
    ? (slotsByDay.get(selectedDay) ?? []).filter((s) => s.is_available)
    : [];

  const firstAvailableDay = useMemo(() => (
    days.find((day) => (slotsByDay.get(day) ?? []).some((slot) => slot.is_available)) ?? null
  ), [days, slotsByDay]);

  useEffect(() => {
    if (!selectedDoctorId) return;

    const selectedDayStillHasSlots = selectedDay
      ? (slotsByDay.get(selectedDay) ?? []).some((slot) => slot.is_available)
      : false;

    if (!selectedDayStillHasSlots && firstAvailableDay) {
      setSelectedDay(firstAvailableDay);
      setSelectedSlot(null);
    }

    if (!firstAvailableDay) {
      setSelectedDay(null);
      setSelectedSlot(null);
    }
  }, [firstAvailableDay, selectedDay, selectedDoctorId, slotsByDay]);

  const weekLabel = `${new Date(from + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} — ${new Date(to + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="flex max-h-[95dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 id="modal-title" className="text-lg font-bold text-stone-900">
              Nueva cita
            </h2>
            {selectedDoctor && (
              <p className="mt-0.5 text-xs text-stone-500">
                con {selectedDoctor.label}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-5">

            {/* Doctor selection */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-stone-700" htmlFor="doctor-select">
                Profesional
              </label>
              {doctorsLoading ? (
                <div className="flex items-center gap-2 py-3 text-sm text-stone-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
                  Cargando profesionales...
                </div>
              ) : (
                <div className="space-y-2">
                  {doctors.map((doc) => {
                    const isSelected = selectedDoctorId === doc.id;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => setSelectedDoctorId(doc.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                          isSelected
                            ? 'border-stone-900 bg-stone-50'
                            : 'border-stone-100 hover:border-stone-200 hover:bg-stone-50/50'
                        }`}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          isSelected ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'
                        }`}>
                          <UserRound className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-900 truncate">{doc.label}</p>
                          {doc.specialty && (
                            <p className="flex items-center gap-1 text-xs text-stone-500">
                              <Stethoscope className="h-3 w-3" />
                              {doc.specialty}
                            </p>
                          )}
                        </div>
                        {isSelected && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-white">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Week calendar */}
            {selectedDoctorId && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-stone-700">Fecha</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={goToPreviousWeek}
                      disabled={isPastDate(from)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-30"
                      aria-label="Semana anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-[120px] text-center text-xs font-medium text-stone-500">
                      {weekLabel}
                    </span>
                    <button
                      type="button"
                      onClick={goToNextWeek}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-600"
                      aria-label="Semana siguiente"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {slotsLoading ? (
                  <div className="flex items-center justify-center py-10 text-sm text-stone-500">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500 mr-2" />
                    Cargando horarios...
                  </div>
                ) : (
                  <>
                    {/* Day pills */}
                    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
                      {days.map((day) => {
                        const { weekday, day: dayNum } = formatDayShort(day);
                        const daySlots = (slotsByDay.get(day) ?? []).filter((s) => s.is_available);
                        const past = isPastDate(day);
                        const hasSlots = daySlots.length > 0;
                        const isActive = selectedDay === day;
                        const today = isToday(day);

                        return (
                          <button
                            key={day}
                            type="button"
                            disabled={past || !hasSlots}
                            onClick={() => { setSelectedDay(day); setSelectedSlot(null); }}
                            className={`flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl px-2.5 py-2 text-center transition-all ${
                              isActive
                                ? 'bg-stone-900 text-white shadow-sm'
                                : past || !hasSlots
                                  ? 'text-stone-500'
                                  : 'text-stone-600 hover:bg-stone-100'
                            }`}
                          >
                            <span className="text-[10px] font-medium uppercase tracking-wide">
                              {weekday}
                            </span>
                            <span className={`text-lg font-bold leading-none ${today && !isActive ? 'text-sky-700' : ''}`}>
                              {dayNum}
                            </span>
                            {hasSlots && !past && (
                              <span className={`mt-0.5 h-1 w-1 rounded-full ${isActive ? 'bg-white' : 'bg-emerald-400'}`} />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Time slots for selected day */}
                    {selectedDay && activeDaySlots.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-2 text-xs font-medium text-stone-500">
                          {activeDaySlots.length} horarios disponibles
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {activeDaySlots.map((slot) => {
                            const isSelected = selectedSlot?.start_time === slot.start_time;
                            return (
                              <button
                                key={slot.start_time}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                                  isSelected
                                    ? 'bg-stone-900 text-white shadow-sm'
                                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                }`}
                              >
                                {formatTime(slot.start_time)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {selectedDay && activeDaySlots.length === 0 && (
                      <p className="mt-4 text-center text-sm text-stone-500">
                        Sin horarios este día
                      </p>
                    )}

                    {!selectedDay && (
                      <p className="mt-4 text-center text-sm text-stone-500">
                        Seleccioná un día para ver horarios
                      </p>
                    )}
                  </>
                )}

                {/* Selected summary */}
                {selectedSlot && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                      <Check className="h-4 w-4 text-emerald-700" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-900 capitalize">
                        {new Date(selectedSlot.start_time).toLocaleDateString('es-AR', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                      <p className="text-xs text-emerald-700">
                        {formatTime(selectedSlot.start_time)} — {selectedSlot.duration_minutes} min
                        {selectedSlot.location ? ` · ${selectedSlot.location}` : ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Type + Reason (reveal after slot selected) */}
            {selectedSlot && (
              <>
                <div>
                  <p className="mb-2 text-sm font-semibold text-stone-700">Tipo de consulta</p>
                  <div className="grid grid-cols-2 gap-2">
                    {APPOINTMENT_TYPES.map((t) => {
                      const isSelected = appointmentType === t.value;
                      const TIcon = t.icon;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setAppointmentType(t.value)}
                          className={`flex items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all ${
                            isSelected
                              ? 'border-stone-900 bg-stone-50'
                              : 'border-stone-100 hover:border-stone-200'
                          }`}
                        >
                          <TIcon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-stone-900' : 'text-stone-500'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-900 truncate">{t.label}</p>
                            <p className="text-[11px] text-stone-500 truncate">{t.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="appointment-reason" className="mb-2 block text-sm font-semibold text-stone-700">
                    Motivo
                  </label>
                  <input
                    id="appointment-reason"
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ej: Consulta general, dolor de cabeza..."
                    className="w-full rounded-xl border-2 border-stone-200 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 transition-colors focus:border-stone-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="appointment-notes" className="mb-2 block text-sm font-semibold text-stone-700">
                    <MessageSquare className="mr-1 inline h-3.5 w-3.5 text-stone-500" />
                    Notas <span className="font-normal text-stone-500">(opcional)</span>
                  </label>
                  <textarea
                    id="appointment-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Información adicional para el médico..."
                    className="w-full rounded-xl border-2 border-stone-200 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 transition-colors focus:border-stone-900 focus:outline-none resize-none"
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 flex gap-3 border-t border-stone-100 bg-white p-5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition-all hover:bg-stone-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !selectedSlot || !selectedDoctorId}
              className="flex-1 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Agendando...' : 'Confirmar cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
