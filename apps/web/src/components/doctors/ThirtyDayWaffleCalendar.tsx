/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";


import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useDoctorAppointments } from "@/hooks/doctors/useDoctorAppointments";
import { Calendar, Users } from "lucide-react";
import type { JSX } from "react";

interface DayData {
  date: Date;
  isToday: boolean;
  isPast: boolean;
  dayNumber: number;
  label: string;
  appointmentsCount: number;
  appointments: any[];
}

export function ThirtyDayWaffleCalendar(): JSX.Element {
  const { appointments, loading } = useDoctorAppointments();
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);

  // Generamos los 30 días a partir de hoy
  const days: DayData[] = useMemo(() => {
    const list: DayData[] = [];
    const today = new Date();
    
    // Para alinear con el inicio de semana (Lunes=1, ..., Domingo=0)
    // Dejamos que sea un grid continuo de 30 días rodantes para un look Waffle impecable
    for (let i = 0; i < 30; i++) {
      const currentDate = new Date();
      currentDate.setDate(today.getDate() + i);

      const isToday = i === 0;
      const isPast = false; // Como empezamos desde hoy, no hay días pasados en los 30 días rodantes
      
      // Filtrar citas para este día
      const dayAppointments = appointments.filter((app: any) => {
        const appDate = new Date(app.start_time);
        return (
          appDate.getDate() === currentDate.getDate() &&
          appDate.getMonth() === currentDate.getMonth() &&
          appDate.getFullYear() === currentDate.getFullYear()
        );
      });

      const formatter = new Intl.DateTimeFormat("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      list.push({
        date: currentDate,
        isToday,
        isPast,
        dayNumber: currentDate.getDate(),
        label: formatter.format(currentDate),
        appointmentsCount: dayAppointments.length,
        appointments: dayAppointments,
      });
    }
    
    return list;
  }, [appointments]);

  // Si no hay hover, mostrar por defecto el día de hoy
  const activeDetail = hoveredDay || days[0];

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-all flex flex-col h-full justify-between">
      <div>
        {/* ── Header ── */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-900 text-white shadow-sm">
            <Calendar className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600 tracking-wide uppercase">
            30 Días Rodantes
          </span>
        </div>

        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900">
            Agenda del Mes
          </h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
            Vista moderna de disponibilidad y consultas programadas.
          </p>
        </div>

        {/* ── Waffle Grid (30 blocks) ── */}
        <div className="mt-6">
          {loading ? (
            <div className="flex h-[180px] items-center justify-center">
              <span className="text-[12px] text-neutral-400 animate-pulse">Cargando disponibilidad...</span>
            </div>
          ) : (
            <div className="grid grid-cols-6 gap-2 mx-auto max-w-[260px]">
              {days.map((day, idx) => {
                // Definir colores estilo Waffle
                let colorClass = "bg-neutral-50 border border-neutral-200/80 text-neutral-700 hover:bg-neutral-100 hover:border-neutral-300";
                let motionShadow = "shadow-none";

                if (day.isToday) {
                  // Color Púrpura (Waffle style para hoy)
                  colorClass = "bg-purple-600 border border-purple-700 text-white";
                  motionShadow = "shadow-[0_0_12px_rgba(147,51,234,0.4)]";
                } else if (day.appointmentsCount > 0) {
                  // Color Azul (Con consultas)
                  colorClass = "bg-blue-500 border border-blue-600 text-white";
                  motionShadow = "shadow-[0_0_10px_rgba(59,130,246,0.35)]";
                }

                return (
                  <motion.div
                    key={idx}
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                    whileHover={{ scale: 1.12, zIndex: 10 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className={`aspect-square w-full rounded-xl flex flex-col items-center justify-center text-[12px] font-semibold cursor-pointer select-none transition-colors duration-200 ${colorClass} ${motionShadow}`}
                  >
                    <span>{day.dayNumber}</span>
                    {day.appointmentsCount > 0 && !day.isToday && (
                      <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-white/80" />
                    )}
                    {day.isToday && (
                      <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer / Panel de Detalle Interactivo ── */}
      <div className="mt-6 border-t border-neutral-100 pt-4">
        {activeDetail && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
              {activeDetail.isToday ? "Hoy" : activeDetail.label.split(",")[0]}
            </p>
            <p className="text-[13px] font-medium text-neutral-800 mt-1 capitalize">
              {activeDetail.label.split(",").slice(1).join(",") || activeDetail.label}
            </p>
            
            <div className="mt-3 flex items-center justify-between rounded-xl bg-neutral-50 p-2.5 border border-neutral-100">
              <div className="flex items-center gap-2">
                <Users className={`h-4 w-4 ${activeDetail.appointmentsCount > 0 ? "text-blue-500" : "text-neutral-400"}`} />
                <span className="text-[12px] font-medium text-neutral-600">
                  {activeDetail.appointmentsCount === 0
                    ? "Sin consultas"
                    : `${activeDetail.appointmentsCount} ${activeDetail.appointmentsCount === 1 ? "consulta" : "consultas"}`}
                </span>
              </div>
              <a
                href="/doctors/agenda"
                className="text-[11px] font-bold text-neutral-900 hover:text-blue-600 hover:underline"
              >
                Ver agenda →
              </a>
            </div>
          </div>
        )}

        {/* ── Leyenda ── */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-neutral-400 border-t border-neutral-50 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-purple-600" />
            <span>Hoy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span>Consultas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-neutral-200" />
            <span>Libre</span>
          </div>
        </div>
      </div>
    </div>
  );
}
