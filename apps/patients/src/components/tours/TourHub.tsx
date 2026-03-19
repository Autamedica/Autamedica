'use client';

import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';

/**
 * Hub centralizado para acceder a todos los tours guiados
 */
interface TourHubProps {
  variant?: 'floating' | 'sidebar';
}

export function TourHub({ variant = 'floating' }: TourHubProps) {
  const [isOpen, setIsOpen] = useState(false);

  const tours = [
    {
      id: 'onboarding',
      title: '🏥 Tour Principal',
      description: 'Conoce todas las funcionalidades de AutaMedica (2 min)',
      color: 'blue',
      storageKey: 'autamedica_onboarding_completed',
    },
    {
      id: 'anamnesis',
      title: '🩺 Anamnesis Digital',
      description: 'Aprende a completar tu historia clínica paso a paso',
      color: 'green',
      storageKey: 'autamedica_anamnesis_tour_completed',
    },
    {
      id: 'preventive',
      title: '🛡️ Salud Preventiva',
      description: 'Chequeos y screenings según tu edad y género',
      color: 'emerald',
      storageKey: 'autamedica_preventive_tour_completed',
    },
    {
      id: 'reproductive',
      title: '💜 Salud Reproductiva',
      description: 'IVE/ILE según Ley 27.610 - Tus derechos',
      color: 'purple',
      storageKey: 'autamedica_reproductive_tour_completed',
    },
    {
      id: 'appointments',
      title: '📅 Agendar Citas',
      description: 'Cómo reservar consultas con especialistas',
      color: 'orange',
      storageKey: 'autamedica_appointments_tour_completed',
    },
    {
      id: 'telemedicine',
      title: '🎥 Telemedicina',
      description: 'Prepárate para videollamadas con tu médico',
      color: 'cyan',
      storageKey: 'autamedica_telemedicine_tour_completed',
    },
    {
      id: 'community',
      title: '💬 Comunidad',
      description: 'Conecta con otros pacientes y comparte experiencias',
      color: 'blue',
      storageKey: 'autamedica_community_tour_completed',
    },
    {
      id: 'actions',
      title: '⚡ Acciones Rápidas',
      description: 'Gestiona tu salud con herramientas instantáneas',
      color: 'amber',
      storageKey: 'autamedica_actions_tour_completed',
    },
  ];

  const resetTour = (storageKey: string) => {
    localStorage.removeItem(storageKey);
    window.location.reload();
  };

  const resetAllTours = () => {
    tours.forEach(tour => localStorage.removeItem(tour.storageKey));
    window.location.reload();
  };

  const isSidebar = variant === 'sidebar';
  const wrapperClassName = isSidebar ? 'relative w-full' : 'fixed left-4 bottom-4 z-40';
  const buttonClassName = isSidebar
    ? 'flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900'
    : 'flex h-12 w-12 items-center justify-center rounded-full border-2 border-stone-300 bg-white text-stone-700 shadow-xl transition-all hover:scale-110 hover:border-stone-600 hover:text-stone-900';
  const menuClassName = isSidebar
    ? 'absolute bottom-[calc(100%+0.75rem)] left-0 right-0 z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-300 bg-white shadow-2xl'
    : 'fixed left-4 bottom-20 z-40 w-80 rounded-2xl border border-stone-300 bg-white shadow-2xl';

  return (
    <div className={wrapperClassName}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClassName}
        aria-label="Centro de ayuda"
        title="Guías interactivas"
      >
        <BookOpen className="h-5 w-5" />
        {isSidebar ? <span className="text-sm font-medium">Guías interactivas</span> : null}
      </button>

      {/* Tours menu */}
      {isOpen && (
        <div className={menuClassName}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-stone-200 p-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900">📚 Guías Interactivas</h3>
              <p className="text-xs text-stone-600">Aprende a usar AutaMedica</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tours list */}
          <div className="max-h-96 overflow-y-auto p-3">
            <div className="space-y-2">
              {tours.map((tour) => {
                const completed = localStorage.getItem(tour.storageKey);
                return (
                  <button
                    key={tour.id}
                    onClick={() => resetTour(tour.storageKey)}
                    className={`w-full rounded-lg border p-3 text-left transition hover:scale-[1.02] ${
                      completed
                        ? 'border-green-300 bg-green-50 hover:bg-green-100'
                        : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-stone-900">{tour.title}</p>
                        <p className="text-xs text-stone-600 mt-0.5">{tour.description}</p>
                      </div>
                      {completed && (
                        <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          ✓ Visto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 mt-2">
                      {completed ? 'Click para ver de nuevo' : 'Click para iniciar'}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Reset all button */}
            <button
              onClick={resetAllTours}
              className="mt-3 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
            >
              🔄 Reiniciar todas las guías
            </button>
          </div>

          {/* Footer */}
          <div className="border-t border-stone-200 bg-stone-50 p-3">
            <p className="text-center text-xs text-stone-600">
              💡 Tip: También puedes preguntarle a <strong>Auta AI</strong> cualquier duda
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
