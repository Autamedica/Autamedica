"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@autamedica/auth/client";
import type {
  DoctorAvailability,
  DoctorAvailabilityInsert,
  DayOfWeek,
  AvailabilityOverride,
  AvailabilityOverrideInsert,
} from "@autamedica/types";
import { DAY_OF_WEEK_LABELS } from "@autamedica/types";
import {
  Clock,
  Plus,
  Trash2,
  Save,
  Calendar,
  CalendarOff,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";

interface AvailabilityManagerProps {
  doctorId: string;
}

type Tab = "weekly" | "overrides";

export default function AvailabilityManager({ doctorId }: AvailabilityManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("weekly");
  const [availability, setAvailability] = useState<DoctorAvailability[]>([]);
  const [overrides, setOverrides] = useState<AvailabilityOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [supabase, setSupabase] = useState<ReturnType<typeof createBrowserClient> | null>(null);

  useEffect(() => {
    const client = createBrowserClient();
    setSupabase(client);
  }, []);

  const fetchData = useCallback(async () => {
    if (!supabase || !doctorId) return;
    setLoading(true);
    setError(null);

    try {
      const [availRes, overridesRes] = await Promise.all([
        supabase
          .from("doctor_availability")
          .select("*")
          .eq("doctor_id", doctorId)
          .order("day_of_week")
          .order("start_time"),
        supabase
          .from("doctor_availability_overrides")
          .select("*")
          .eq("doctor_id", doctorId)
          .gte("override_date", new Date().toISOString().split("T")[0])
          .order("override_date"),
      ]);

      if (availRes.error) throw availRes.error;
      if (overridesRes.error) throw overridesRes.error;

      setAvailability((availRes.data ?? []) as unknown as DoctorAvailability[]);
      setOverrides((overridesRes.data ?? []) as unknown as AvailabilityOverride[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar disponibilidad");
    } finally {
      setLoading(false);
    }
  }, [supabase, doctorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  // ============================
  // Weekly Availability CRUD
  // ============================

  const addSlot = async (dayOfWeek: DayOfWeek, startTime: string, endTime: string, slotDuration: number) => {
    if (!supabase) return;
    clearMessages();
    setSaving(true);

    try {
      const insert: DoctorAvailabilityInsert = {
        doctor_id: doctorId as import("@autamedica/types").UUID,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        slot_duration: slotDuration,
        is_active: true,
      };

      const { error: err } = await supabase
        .from("doctor_availability")
        .insert(insert as never);

      if (err) throw err;
      setSuccess("Horario agregado");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agregar horario");
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async (id: string) => {
    if (!supabase) return;
    clearMessages();
    setSaving(true);

    try {
      const { error: err } = await supabase
        .from("doctor_availability")
        .delete()
        .eq("id", id);

      if (err) throw err;
      setSuccess("Horario eliminado");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const toggleSlotActive = async (id: string, isActive: boolean) => {
    if (!supabase) return;
    clearMessages();

    try {
      const { error: err } = await supabase
        .from("doctor_availability")
        .update({ is_active: !isActive } as never)
        .eq("id", id);

      if (err) throw err;
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  // ============================
  // Overrides CRUD
  // ============================

  const addOverride = async (override: AvailabilityOverrideInsert) => {
    if (!supabase) return;
    clearMessages();
    setSaving(true);

    try {
      const { error: err } = await supabase
        .from("doctor_availability_overrides")
        .insert(override as never);

      if (err) throw err;
      setSuccess("Excepción agregada");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agregar excepción");
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async (id: string) => {
    if (!supabase) return;
    clearMessages();

    try {
      const { error: err } = await supabase
        .from("doctor_availability_overrides")
        .delete()
        .eq("id", id);

      if (err) throw err;
      setSuccess("Excepción eliminada");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar excepción");
    }
  };

  // ============================
  // Preset: Lunes a Viernes 9-17
  // ============================

  const applyPreset = async () => {
    if (!supabase) return;
    clearMessages();
    setSaving(true);

    try {
      // Delete existing
      await supabase
        .from("doctor_availability")
        .delete()
        .eq("doctor_id", doctorId);

      // Insert Mon-Fri 9-17
      const inserts: DoctorAvailabilityInsert[] = [];
      for (let day = 1; day <= 5; day++) {
        inserts.push({
          doctor_id: doctorId as import("@autamedica/types").UUID,
          day_of_week: day as DayOfWeek,
          start_time: "09:00",
          end_time: "13:00",
          slot_duration: 30,
          is_active: true,
        });
        inserts.push({
          doctor_id: doctorId as import("@autamedica/types").UUID,
          day_of_week: day as DayOfWeek,
          start_time: "14:00",
          end_time: "17:00",
          slot_duration: 30,
          is_active: true,
        });
      }

      const { error: err } = await supabase
        .from("doctor_availability")
        .insert(inserts as never);

      if (err) throw err;
      setSuccess("Horario Lun-Vie 9-13 / 14-17 aplicado");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aplicar preset");
    } finally {
      setSaving(false);
    }
  };

  // ============================
  // Group availability by day
  // ============================

  const slotsByDay = new Map<DayOfWeek, DoctorAvailability[]>();
  for (let d = 0; d <= 6; d++) {
    slotsByDay.set(d as DayOfWeek, []);
  }
  for (const slot of availability) {
    const existing = slotsByDay.get(slot.day_of_week as DayOfWeek) ?? [];
    existing.push(slot);
    slotsByDay.set(slot.day_of_week as DayOfWeek, existing);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando disponibilidad...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-slate-900">
            Gestión de Disponibilidad
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={applyPreset}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-md transition-colors disabled:opacity-50"
          >
            Lun-Vie 9-17
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-500 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("weekly")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
            activeTab === "weekly"
              ? "bg-violet-600 text-white"
              : "text-slate-400 hover:text-slate-700"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Horario Semanal
        </button>
        <button
          onClick={() => setActiveTab("overrides")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors ${
            activeTab === "overrides"
              ? "bg-violet-600 text-white"
              : "text-slate-400 hover:text-slate-700"
          }`}
        >
          <CalendarOff className="w-4 h-4" />
          Excepciones
          {overrides.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-orange-500/20 text-orange-400 rounded-full">
              {overrides.length}
            </span>
          )}
        </button>
      </div>

      {/* Weekly Tab */}
      {activeTab === "weekly" && (
        <div className="space-y-3">
          {([1, 2, 3, 4, 5, 6, 0] as DayOfWeek[]).map((day) => (
            <DayRow
              key={day}
              day={day}
              slots={slotsByDay.get(day) ?? []}
              onAdd={addSlot}
              onRemove={removeSlot}
              onToggle={toggleSlotActive}
              saving={saving}
            />
          ))}
        </div>
      )}

      {/* Overrides Tab */}
      {activeTab === "overrides" && (
        <OverridesPanel
          doctorId={doctorId}
          overrides={overrides}
          onAdd={addOverride}
          onRemove={removeOverride}
          saving={saving}
        />
      )}
    </div>
  );
}

// ==========================================
// DayRow Component
// ==========================================

function DayRow({
  day,
  slots,
  onAdd,
  onRemove,
  onToggle,
  saving,
}: {
  day: DayOfWeek;
  slots: DoctorAvailability[];
  onAdd: (day: DayOfWeek, start: string, end: string, duration: number) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  saving: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("13:00");
  const [newDuration, setNewDuration] = useState(30);

  const handleAdd = async () => {
    await onAdd(day, newStart, newEnd, newDuration);
    setAdding(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-slate-700">
          {DAY_OF_WEEK_LABELS[day]}
        </h3>
        <button
          onClick={() => setAdding(!adding)}
          className="p-1 text-slate-400 hover:text-violet-400 transition-colors"
          title="Agregar bloque"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {slots.length === 0 && !adding && (
        <p className="text-xs text-slate-500 italic">Sin horario configurado</p>
      )}

      {/* Existing slots */}
      <div className="space-y-1.5">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className={`flex items-center justify-between p-2 rounded-md text-sm transition-colors ${
              slot.is_active
                ? "bg-slate-50 text-slate-700"
                : "bg-white text-slate-500 line-through"
            }`}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => onToggle(slot.id, slot.is_active)}
                className={`w-3 h-3 rounded-full border-2 transition-colors ${
                  slot.is_active
                    ? "bg-emerald-500 border-emerald-500"
                    : "bg-transparent border-slate-500"
                }`}
                title={slot.is_active ? "Desactivar" : "Activar"}
              />
              <span className="font-mono">
                {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
              </span>
              <span className="text-xs text-slate-500">
                ({slot.slot_duration} min)
              </span>
              {slot.location && (
                <span className="text-xs text-violet-400">{slot.location}</span>
              )}
            </div>
            <button
              onClick={() => onRemove(slot.id)}
              className="p-1 text-slate-500 hover:text-red-400 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-slate-50 rounded-md">
          <input
            type="time"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            className="bg-white border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 w-24"
          />
          <span className="text-slate-500">-</span>
          <input
            type="time"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
            className="bg-white border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 w-24"
          />
          <select
            value={newDuration}
            onChange={(e) => setNewDuration(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded px-2 py-1 text-sm text-slate-700"
          >
            <option value={15}>15 min</option>
            <option value={20}>20 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs rounded transition-colors disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// OverridesPanel Component
// ==========================================

function OverridesPanel({
  doctorId,
  overrides,
  onAdd,
  onRemove,
  saving,
}: {
  doctorId: string;
  overrides: AvailabilityOverride[];
  onAdd: (override: AvailabilityOverrideInsert) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  saving: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");

  const handleAdd = async () => {
    await onAdd({
      doctor_id: doctorId as import("@autamedica/types").UUID,
      override_date: date,
      is_available: isAvailable,
      start_time: isAvailable ? startTime : null,
      end_time: isAvailable ? endTime : null,
      reason: reason || null,
    });
    setAdding(false);
    setDate("");
    setReason("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Vacaciones, feriados, guardias extra u horarios especiales para días puntuales.
        </p>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="bg-white border border-slate-200 rounded px-2 py-1 text-sm text-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tipo</label>
              <select
                value={isAvailable ? "available" : "unavailable"}
                onChange={(e) => setIsAvailable(e.target.value === "available")}
                className="bg-white border border-slate-200 rounded px-2 py-1 text-sm text-slate-700"
              >
                <option value="unavailable">No disponible</option>
                <option value="available">Horario especial</option>
              </select>
            </div>
            {isAvailable && (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Desde</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-white border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 w-24"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Hasta</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="bg-white border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 w-24"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo (ej: Vacaciones, Feriado, Guardia)"
              className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-sm text-slate-700 placeholder:text-slate-500"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !date}
              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs rounded transition-colors disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Existing overrides */}
      {overrides.length === 0 && !adding && (
        <p className="text-sm text-slate-500 italic text-center py-6">
          Sin excepciones programadas
        </p>
      )}

      <div className="space-y-2">
        {overrides.map((o) => (
          <div
            key={o.id}
            className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
              o.is_available
                ? "bg-violet-50 border-violet-200 text-violet-600"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            <div className="flex items-center gap-3">
              {o.is_available ? (
                <Calendar className="w-4 h-4" />
              ) : (
                <CalendarOff className="w-4 h-4" />
              )}
              <span className="font-medium">{o.override_date}</span>
              {o.is_available && o.start_time && o.end_time && (
                <span className="font-mono text-xs">
                  {o.start_time.substring(0, 5)} - {o.end_time.substring(0, 5)}
                </span>
              )}
              {!o.is_available && (
                <span className="text-xs">No disponible</span>
              )}
              {o.reason && (
                <span className="text-xs opacity-70">— {o.reason}</span>
              )}
            </div>
            <button
              onClick={() => onRemove(o.id)}
              className="p-1 hover:text-red-300 transition-colors opacity-60 hover:opacity-100"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
