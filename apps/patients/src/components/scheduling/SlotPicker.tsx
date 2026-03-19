'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { ScheduleSlot } from '@autamedica/types';

interface SlotPickerProps {
  doctorId: string;
  onSelect: (slot: ScheduleSlot) => void;
  selectedSlot: ScheduleSlot | null;
}

export function SlotPicker({ doctorId, onSelect, selectedSlot }: SlotPickerProps) {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const getDateRange = useCallback(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() + weekOffset * 7);
    if (weekOffset === 0) {
      // Start from tomorrow for current week
      start.setDate(start.getDate() + 1);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      from: formatDate(start),
      to: formatDate(end),
      startDate: start,
    };
  }, [weekOffset]);

  const fetchSlots = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true);
    setError(null);

    try {
      const { from, to } = getDateRange();
      const res = await fetch(`/api/doctors/${doctorId}/slots?from=${from}&to=${to}`);

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al cargar slots');
      }

      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar disponibilidad');
    } finally {
      setLoading(false);
    }
  }, [doctorId, getDateRange]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Group slots by date
  const slotsByDate = new Map<string, ScheduleSlot[]>();
  for (const slot of slots) {
    const existing = slotsByDate.get(slot.date) ?? [];
    existing.push(slot);
    slotsByDate.set(slot.date, existing);
  }

  const { from, to } = getDateRange();

  // Generate all dates in range
  const dates: string[] = [];
  const cursor = new Date(from);
  const endDate = new Date(to);
  while (cursor <= endDate) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div className="space-y-3">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
          disabled={weekOffset === 0}
          className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-stone-600" />
        </button>
        <div className="flex items-center gap-1.5 text-sm text-stone-600">
          <Calendar className="w-4 h-4" />
          <span>{formatDisplayDate(from)} — {formatDisplayDate(to)}</span>
        </div>
        <button
          type="button"
          onClick={() => setWeekOffset(Math.min(8, weekOffset + 1))}
          disabled={weekOffset >= 8}
          className="p-1.5 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-stone-600" />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Cargando disponibilidad...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Slots grid */}
      {!loading && !error && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {dates.map((date) => {
            const daySlots = slotsByDate.get(date) ?? [];
            const dayName = getDayName(date);

            return (
              <div key={date} className="border border-stone-200 rounded-lg p-2.5">
                <div className="text-xs font-medium text-stone-500 mb-1.5">
                  {dayName} {formatDisplayDate(date)}
                </div>
                {daySlots.length === 0 ? (
                  <p className="text-xs text-stone-400 italic">Sin disponibilidad</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {daySlots.map((slot) => {
                      const time = new Date(slot.start_time);
                      const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}`;
                      const isSelected =
                        selectedSlot?.start_time === slot.start_time &&
                        selectedSlot?.date === slot.date;

                      return (
                        <button
                          key={slot.start_time}
                          type="button"
                          onClick={() => onSelect(slot)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            isSelected
                              ? 'bg-stone-800 text-white'
                              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {timeStr}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {slots.length === 0 && !loading && (
            <div className="text-center py-6 text-stone-400 text-sm">
              No hay turnos disponibles esta semana.
              <br />
              Probá la semana siguiente o anotate en la lista de espera.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helpers
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'short' });
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
