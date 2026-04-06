'use client';

import { Video, Stethoscope } from 'lucide-react';
import { useReproductiveHealthSpecialists } from '@/hooks/patients/useReproductiveHealthSpecialists';

interface DoctorsTabProps {
  onRequestCall: () => void;
}

export function DoctorsTab({ onRequestCall }: DoctorsTabProps) {
  const { specialists, isLoading, error } = useReproductiveHealthSpecialists({ availableOnly: false });

  return (
    <div className="space-y-6">
      <div className="bg-[var(--au-surface)] border-2 border-[var(--au-border)] rounded-xl p-6">
        <h2 className="heading-2 mb-2">Consulta con Especialistas</h2>
        <p className="text-body mb-4">
          Conecta con profesionales de salud capacitados en IVE/ILE que resolveran todas tus dudas
          de forma confidencial y sin prejuicios.
        </p>
        <button
          onClick={onRequestCall}
          className="w-full btn-primary-ivory px-4 py-3 flex items-center justify-center gap-2"
        >
          <Video className="h-5 w-5" />
          Iniciar Videoconsulta Ahora
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--au-text-primary)]">Profesionales Disponibles</h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--au-border)] border-t-[var(--au-text-secondary)]" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            No se pudieron cargar los especialistas. Intenta de nuevo mas tarde.
          </div>
        ) : specialists.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-[var(--au-surface)] p-6 text-center text-sm text-[var(--au-text-tertiary)]">
            <Stethoscope className="mx-auto mb-2 h-8 w-8 text-[var(--au-text-tertiary)]" />
            No hay especialistas disponibles en este momento.
          </div>
        ) : (
          specialists.map((doctor) => {
            const isAvailable = doctor.availability_status === 'available';
            const displayName = [doctor.first_name, doctor.last_name].filter(Boolean).join(' ') || 'Sin nombre';
            return (
              <div key={doctor.id} className="bg-white border border-stone-200 shadow-md rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-12 h-12 bg-[var(--au-surface)] rounded-full flex items-center justify-center flex-shrink-0">
                      <Stethoscope className="h-6 w-6 text-[var(--au-text-secondary)]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-[var(--au-text-primary)]">{displayName}</h4>
                      <p className="text-sm text-[var(--au-text-secondary)] mb-2">{doctor.specialty || 'Sin especialidad'}</p>
                      <div className="flex items-center gap-3 text-xs text-[var(--au-text-primary)]/50">
                        {doctor.rating != null && doctor.rating > 0 && (
                          <>
                            <span>&#11088; {doctor.rating.toFixed(1)}</span>
                            <span>&bull;</span>
                          </>
                        )}
                        <span>{doctor.total_consultations ?? 0} consultas</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {isAvailable ? (
                      <>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full flex items-center gap-1 border border-emerald-400">
                          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                          Disponible
                        </span>
                        <button
                          onClick={onRequestCall}
                          className="px-3 py-1 bg-am-primary-600 hover:bg-am-primary-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1"
                        >
                          <Video className="h-3 w-3" />
                          Llamar
                        </button>
                      </>
                    ) : (
                      <span className="px-3 py-1 bg-gray-500/20 text-gray-400 text-xs font-semibold rounded-full">
                        No disponible
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="bg-am-primary-50 border-2 border-am-primary-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-[var(--au-text-primary)] mb-4">Preguntas que puedes hacer:</h3>
        <ul className="space-y-2 text-sm text-am-primary-900">
          <li>&bull; Cual es el metodo mas adecuado para mi situacion?</li>
          <li>&bull; Que puedo esperar durante y despues del procedimiento?</li>
          <li>&bull; Cuanto tiempo tomara el proceso completo?</li>
          <li>&bull; Donde se realizara el procedimiento?</li>
          <li>&bull; Necesito acompanante?</li>
          <li>&bull; Que metodos anticonceptivos puedo usar despues?</li>
          <li>&bull; Cuando puedo retomar mis actividades normales?</li>
          <li>&bull; Que senales de alerta debo vigilar?</li>
        </ul>
      </div>
    </div>
  );
}
