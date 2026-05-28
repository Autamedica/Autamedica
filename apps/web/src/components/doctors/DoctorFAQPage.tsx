/**
 * DoctorFAQPage.tsx - Centro de ayuda del portal médico AutaMedica.
 * Preguntas frecuentes sobre pacientes, recetas, videollamadas y agenda.
 */
"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Search,
  HelpCircle,
  ChevronDown,
  Users,
  Pill,
  Video,
  Calendar,
  ShieldCheck,
  ExternalLink,
  Activity,
  CreditCard
} from "lucide-react";
import { faqItems } from "./DoctorFAQData";

export function DoctorFAQPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "patients" | "prescriptions" | "calls" | "agenda" | "billing">("all");
  const [openItem, setOpenItem] = useState<string | null>("atender-externo");

  const categories = [
    { id: "all", label: "Todas las guías", icon: HelpCircle },
    { id: "patients", label: "Pacientes", icon: Users },
    { id: "prescriptions", label: "Recetas", icon: Pill },
    { id: "calls", label: "Consultas", icon: Video },
    { id: "agenda", label: "Agenda", icon: Calendar },
    { id: "billing", label: "Cobros y Planes", icon: CreditCard },
  ];

  // Debounce de la consulta de búsqueda
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  // Filtrado de preguntas frecuentes
  const filteredFaqs = useMemo(() => {
    return faqItems.filter((item) => {
      const matchesCategory = activeCategory === "all" || item.category === activeCategory;
      const matchesSearch =
        debouncedSearchQuery.trim() === "" ||
        item.question.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        item.tags.some((tag) => tag.toLowerCase().includes(debouncedSearchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, debouncedSearchQuery]);

  return (
    <div className="min-h-screen bg-am-bg py-8 px-4 sm:px-6 lg:px-8 text-am-text-primary">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Banner de cabecera */}
        <div className="relative overflow-hidden rounded-xl bg-am-surface-900 px-6 py-12 shadow-xl sm:px-12 text-white">
          <div className="relative z-10 max-w-2xl space-y-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-am-doctor-500/10 px-3 py-1 text-xs font-bold text-am-doctor-400 border border-am-doctor-500/20">
              <Activity className="h-3.5 w-3.5" strokeWidth={1.5} />
              Instructivo Clínico Operativo
            </span>
            <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-white leading-tight">
              ¿Cómo te ayudamos hoy, <span className="font-semibold text-am-doctor-400">Doctor/a</span>?
            </h1>
            <p className="text-sm text-am-surface-300 leading-relaxed font-light">
              Respuestas claras sobre el uso del Consultorio Virtual de telemedicina, flujo legal de recetas electrónicas en farmacias, protección de datos personales e integración de la asistencia clínica con IA.
            </p>
          </div>
        </div>

        {/* Barra de búsqueda */}
        <div className="relative shadow-sm rounded-xl">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-am-text-tertiary">
            <Search className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Escribí tu consulta (ej. paciente externo, vademecum, SOAP, bloquear agenda...)"
            className="w-full rounded-xl border border-am-border bg-white py-4 pl-12 pr-4 text-sm text-am-text-primary placeholder:text-am-text-tertiary focus:outline-none focus:ring-2 focus:ring-am-doctor-500/20 focus:border-am-doctor-500 shadow-sm transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-xs font-semibold text-am-text-tertiary hover:text-am-text-secondary transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Pestañas de navegación por categorías */}
        <div className="flex flex-wrap gap-2 pb-2 overflow-x-auto scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id as "all" | "patients" | "prescriptions" | "calls" | "agenda" | "billing");
                  setOpenItem(null);
                }}
                className={`flex items-center gap-2 rounded-xl py-3 px-4 text-xs font-bold transition-all shadow-sm ${
                  isActive
                    ? "bg-am-surface-900 text-am-doctor-400 border border-am-surface-800 shadow-inner"
                    : "bg-white border border-am-border text-am-text-secondary hover:border-am-border-hover hover:text-am-text-primary"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Listado de guías / acordeones colapsables */}
        <div className="space-y-4">
          {filteredFaqs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-am-border bg-white p-12 text-center text-am-text-tertiary">
              <HelpCircle className="h-10 w-10 mx-auto text-am-text-tertiary mb-3" strokeWidth={1.5} />
              <p className="text-sm font-semibold">No encontramos guías que coincidan con tu búsqueda.</p>
              <p className="text-xs text-am-text-tertiary mt-1">Intentá buscar con otros términos generales como "receta" o "SOAP".</p>
            </div>
          ) : (
            filteredFaqs.map((item) => {
              const isOpen = openItem === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden bg-white shadow-sm ${
                    isOpen ? "border-am-border ring-2 ring-am-surface-100" : "border-am-border hover:border-am-border-hover hover:shadow"
                  }`}
                >
                  <button
                    onClick={() => setOpenItem(isOpen ? null : item.id)}
                    className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 font-semibold text-am-text-primary text-sm sm:text-base transition-colors hover:bg-am-surface-hover"
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex h-2 w-2 rounded-full shrink-0 ${
                        item.category === "patients" ? "bg-am-patient-400" :
                        item.category === "prescriptions" ? "bg-am-success" :
                        item.category === "calls" ? "bg-am-doctor-500" :
                        item.category === "agenda" ? "bg-am-warning" : "bg-am-primary-400"
                      }`} />
                      {item.question}
                    </span>
                    <ChevronDown
                      className={`h-5 w-5 text-am-text-tertiary transition-transform duration-200 shrink-0 ${
                        isOpen ? "rotate-180 text-am-doctor-500" : ""
                      }`}
                      strokeWidth={1.5}
                    />
                  </button>
                  
                  {isOpen && (
                    <div className="px-6 pb-6 pt-3 border-t border-am-border bg-white animate-in slide-in-from-top-4 duration-300">
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer informativo */}
        <div className="rounded-xl border border-am-border bg-white p-6 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-am-doctor-50 text-am-doctor-600 shrink-0">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="flex-1 space-y-1.5 text-center sm:text-left">
            <h4 className="text-sm font-bold text-am-text-primary uppercase tracking-wide">Validación legal permanente</h4>
            <p className="text-xs text-am-text-secondary leading-relaxed font-light">
              AutaMedica realiza una validación continua contra la base de prestadores de la Superintendencia de Servicios de Salud (SSS) y del Registro Federal de Profesionales de la Salud (REFEPS). Todas tus emisiones cumplen plenamente con la Ley Nacional de Receta Digital N° 27.553.
            </p>
          </div>
          <div className="shrink-0">
            <a
              href="/doctors/perfil"
              className="inline-flex items-center gap-1.5 rounded-full bg-am-surface-900 px-4 py-3 text-xs font-bold text-white transition-all hover:bg-am-surface-700"
            >
              <span>Ver mi Matrícula</span>
              <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
