'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '@autamedica/shared';
import { fetchApi } from '@/lib/api-client';
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
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import type { CreateAppointmentInput, AppointmentType } from '@/lib/patients/types/appointment';
import { useModalAccessibility } from '@/hooks/patients/useModalAccessibility';
import { formatArsFromCents } from '@/lib/payments/money';

/* ── Types ───────────────────────────────────────────────── */

interface DoctorOption {
  id: string;
  specialty: string | null;
  consultation_fee: number | null;
  first_name: string | null;
  last_name: string | null;
  has_availability?: boolean;
  active_plan?: string | null;
  label: string;
  license_number?: string | null;
  avatar_url?: string | null;
  overall_score?: number;
  rank_position?: number | null;
  has_prescription_digital?: boolean;
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

function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekRange(baseDate: Date): { from: string; to: string } {
  const day = baseDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: toLocalYmd(monday),
    to: toLocalYmd(sunday),
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
    days.push(toLocalYmd(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

const APPOINTMENT_TYPES: { value: AppointmentType; label: string; icon: typeof Video; desc: string }[] = [
  { value: 'telemedicine', label: 'Telemedicina', icon: Video, desc: 'Consulta por videollamada' },
  { value: 'consultation', label: 'Presencial', icon: MapPin, desc: 'Consulta en consultorio' },
  { value: 'follow_up', label: 'Control de continuidad', icon: ArrowRight, desc: 'Revisión y renovación' },
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
    fetchApi<DoctorOption[]>('/api/patients/doctors')
      .then((data) => {
        if (cancelled) return;
        setDoctors(data ?? []);
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
      const data = await fetchApi<{ slots: SlotData[] }>(
        `/api/patients/doctors/${selectedDoctorId}/slots?from=${from}&to=${to}`,
      );
      setSlots(data?.slots ?? []);
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
        start_time: selectedSlot.start_time,
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

  const isToday = (dateStr: string) => dateStr === toLocalYmd(new Date());
  const isPastDate = (dateStr: string) => new Date(dateStr + 'T23:59:59') < new Date();
  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  const sortedDoctors = useMemo(() => {
    return [...doctors].sort((a, b) => {
      const isAPending = a.license_number?.startsWith('PENDING') || a.license_number === 'PENDING';
      const isADemo = a.license_number?.includes('DEMO');
      const isANoAvailability = a.has_availability === false;

      const isBPending = b.license_number?.startsWith('PENDING') || b.license_number === 'PENDING';
      const isBDemo = b.license_number?.includes('DEMO');
      const isBNoAvailability = b.has_availability === false;

      // Group: 0 = Active & Available, 1 = Active but no availability, 2 = Inhabilitado
      const groupA = (isAPending || isADemo) ? 2 : (isANoAvailability ? 1 : 0);
      const groupB = (isBPending || isBDemo) ? 2 : (isBNoAvailability ? 1 : 0);

      if (groupA !== groupB) {
        return groupA - groupB;
      }

      // If both are in the Active & Available group, place Eduardo da Rosa at the absolute end of this group (bypassing merit sorting for him)
      if (groupA === 0) {
        const isAEduardo = a.license_number === 'MP006402' || a.id === '080fb7ae-92b4-44d4-8941-a6db65004b9f';
        const isBEduardo = b.license_number === 'MP006402' || b.id === '080fb7ae-92b4-44d4-8941-a6db65004b9f';
        if (isAEduardo && !isBEduardo) return 1;
        if (!isAEduardo && isBEduardo) return -1;
      }

      // Inside the same group, sort by overall_score descending (merit)
      const scoreA = a.overall_score ?? 0;
      const scoreB = b.overall_score ?? 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      // Fallback to alphabetical order if merit scores are equal
      return a.label.localeCompare(b.label, 'es');
    });
  }, [doctors]);

  const activeDaySlots = selectedDay
    ? (slotsByDay.get(selectedDay) ?? []).filter((s) => s.is_available)
    : [];

  const firstAvailableDay = useMemo(() => {
    const todayStr = toLocalYmd(new Date());
    return (
      days.find((day) => day >= todayStr && (slotsByDay.get(day) ?? []).some((slot) => slot.is_available)) ?? null
    );
  }, [days, slotsByDay]);

  useEffect(() => {
    if (!selectedDoctorId) return;

    const selectedDayStillHasSlots = selectedDay
      ? (slotsByDay.get(selectedDay) ?? []).some((slot) => slot.is_available)
      : false;

    const todayStr = toLocalYmd(new Date());
    const isSelectedDayPast = selectedDay ? selectedDay < todayStr : false;

    if ((!selectedDayStillHasSlots || isSelectedDayPast) && firstAvailableDay) {
      setSelectedDay(firstAvailableDay);
      setSelectedSlot(null);
    }

    if (!firstAvailableDay) {
      setSelectedDay(null);
      setSelectedSlot(null);
    }
  }, [firstAvailableDay, selectedDay, selectedDoctorId, slotsByDay]);

  const weekLabel = `${new Date(from + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} — ${new Date(to + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;

  if (!isOpen) return null;

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
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-semibold text-stone-700" htmlFor="doctor-select">
                  Profesional
                </label>
                {!doctorsLoading && doctors.length > 0 && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
                    {doctors.length} {doctors.length === 1 ? 'disponible' : 'disponibles'}
                  </span>
                )}
              </div>
              {doctorsLoading ? (
                <div className="flex items-center gap-2 py-3 text-sm text-stone-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
                  Cargando profesionales...
                </div>
              ) : doctors.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-200 p-8 text-center">
                  <UserRound className="mx-auto mb-2 h-8 w-8 text-stone-300" />
                  <p className="text-sm text-stone-500">No se encontraron profesionales disponibles.</p>
                </div>
              ) : (
                <div className="max-h-[42dvh] space-y-2 overflow-y-auto pr-1">
                  {sortedDoctors.map((doc) => {
                    const isSelected = selectedDoctorId === doc.id;
                    const isPending = doc.license_number?.startsWith('PENDING') || doc.license_number === 'PENDING';
                    const isDemo = doc.license_number?.includes('DEMO');
                    const isNoAvailability = doc.has_availability === false;
                    const isDisabled = isPending || isDemo || isNoAvailability;
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setSelectedDoctorId(doc.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                          isDisabled
                            ? 'opacity-60 cursor-not-allowed bg-stone-50/50 border-stone-100'
                            : isSelected
                              ? 'border-stone-900 bg-stone-50'
                              : 'border-stone-100 hover:border-stone-200 hover:bg-stone-50/50'
                        }`}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full ${
                          isDisabled
                            ? 'bg-stone-100 text-stone-400'
                            : isSelected
                              ? 'bg-stone-900 text-white'
                              : 'bg-stone-100 text-stone-500'
                        }`}>
                          {doc.avatar_url ? (
                            <img src={doc.avatar_url} alt={doc.label} className="h-full w-full object-cover" />
                          ) : (
                            <UserRound className="h-5 w-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-stone-900 flex items-center gap-1.5">
                            {doc.label}
                            {!isPending && !isDemo && (
                              <svg className="h-4 w-4 text-emerald-600 shrink-0 inline-block align-middle" viewBox="0 0 24 24" fill="currentColor">
                                <title>Profesional verificado en SISA/REFEPS</title>
                                <path d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12zm-13 5l-4-4 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                              </svg>
                            )}
                            {!isPending && !isDemo && doc.has_prescription_digital && (
                              <svg className="h-4 w-4 text-sky-600 shrink-0 inline-block align-middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <title>Habilitado para emitir recetas digitales con firma y sello digital</title>
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <line x1="10" y1="9" x2="8" y2="9" />
                              </svg>
                            )}
                            {!isPending && !isDemo && doc.active_plan === 'basico' && (
                              <svg className="h-4 w-4 text-orange-600 shrink-0 inline-block align-middle" viewBox="0 0 24 24" fill="currentColor">
                                <title>Suscripción Básica activa</title>
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              </svg>
                            )}
                            {!isPending && !isDemo && doc.active_plan === 'pro' && (
                              <svg className="h-4 w-4 text-purple-600 shrink-0 inline-block align-middle" viewBox="0 0 24 24" fill="currentColor">
                                <title>Suscripción Pro activa</title>
                                <path d="M12 2L2 12l10 10 10-10L12 2z" />
                              </svg>
                            )}
                            {!isPending && !isDemo && doc.active_plan === 'premium' && (
                              <svg className="h-4 w-4 text-amber-500 shrink-0 inline-block align-middle" viewBox="0 0 24 24" fill="currentColor">
                                <title>Suscripción Premium activa</title>
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                              </svg>
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                            {doc.specialty && (
                              <p className="flex items-center gap-1">
                                <Stethoscope className="h-3 w-3" />
                                {doc.specialty}
                              </p>
                            )}
                            <p className="font-medium text-stone-700">
                              {formatArsFromCents(doc.consultation_fee)}
                            </p>
                            {isPending && (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-600/10">
                                Inhabilitado (Matrícula pendiente)
                              </span>
                            )}
                            {isDemo && (
                              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600 ring-1 ring-stone-500/10">
                                Inhabilitado (Cuenta de prueba)
                              </span>
                            )}
                            {!isPending && !isDemo && doc.has_availability === false && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-600/10 flex items-center gap-0.5 w-fit">
                                Sin horarios disponibles
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && !isDisabled && (
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

                {selectedSlot && selectedDoctor && (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 shadow-sm shadow-sky-500/5">
                    <div className="flex items-start gap-3 p-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm ring-1 ring-sky-100">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                              Pago seguro
                            </p>
                            <p className="mt-1 text-sm font-semibold text-stone-950">
                              Consulta AutaMedica
                            </p>
                          </div>
                          <p className="rounded-full bg-stone-950 px-3 py-1 text-sm font-bold text-white">
                            {formatArsFromCents(selectedDoctor.consultation_fee)}
                          </p>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600">
                          La reserva queda pendiente hasta que MercadoPago acredite el pago. Si tu caso necesita una revisión de cierre, ya está incluida.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-600">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-sky-100">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                            Revisión de cierre incluida
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-sky-100">
                            Tarjeta, dinero en cuenta o medios disponibles
                          </span>
                        </div>
                      </div>
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
                    className="w-full rounded-xl border-2 border-stone-200 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 transition-colors focus:border-stone-900 focus-visible:outline-2 focus-visible:outline-stone-900 focus-visible:ring-2 focus-visible:ring-stone-900/20 focus-visible:ring-offset-2"
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
                    className="w-full rounded-xl border-2 border-stone-200 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-500 transition-colors focus:border-stone-900 focus-visible:outline-2 focus-visible:outline-stone-900 focus-visible:ring-2 focus-visible:ring-stone-900/20 focus-visible:ring-offset-2 resize-none"
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
              {loading ? 'Abriendo checkout...' : 'Continuar al pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
