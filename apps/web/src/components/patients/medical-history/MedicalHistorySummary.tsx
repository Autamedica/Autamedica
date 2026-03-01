'use client';

/** Local UI type for medical history summary (not exported from @autamedica/types) */
interface MedicalHistorySummaryData {
  active_conditions_count: number;
  active_medications_count: number;
  known_allergies_count: number;
  last_encounter_date?: string;
  critical_allergies: string[];
  chronic_conditions: string[];
  current_medications: string[];
}

interface MedicalHistorySummaryProps {
  summary: MedicalHistorySummaryData;
  className?: string;
}

export function MedicalHistorySummary({ summary, className = '' }: MedicalHistorySummaryProps) {
  const formatDate = (date?: string): string => {
    if (!date) return 'Sin datos';
    return new Date(date).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getSummaryCards = () => [
    {
      title: 'Condiciones Activas',
      value: summary.active_conditions_count,
      icon: '🩺',
      color: summary.active_conditions_count > 3 ? 'border-red-500 bg-red-50' : 'border-blue-500 bg-blue-500/10',
      description: `${summary.active_conditions_count} condiciones requieren seguimiento`
    },
    {
      title: 'Medicamentos Activos',
      value: summary.active_medications_count,
      icon: '💊',
      color: 'border-green-500 bg-green-500/10',
      description: `${summary.active_medications_count} medicamentos en curso`
    },
    {
      title: 'Alergias Conocidas',
      value: summary.known_allergies_count,
      icon: '⚠️',
      color: summary.known_allergies_count > 0 ? 'border-yellow-500 bg-yellow-500/10' : 'border-gray-500 bg-gray-500/10',
      description: summary.known_allergies_count > 0 ? 'Revisar antes de prescribir' : 'Sin alergias reportadas'
    },
    {
      title: 'Última Consulta',
      value: formatDate(summary.last_encounter_date),
      icon: '📅',
      color: 'border-purple-500 bg-purple-500/10',
      description: summary.last_encounter_date ? 'Fecha de última atención' : 'Sin consultas registradas'
    }
  ];

  return (
    <div className={`w-full space-y-6 ${className}`}>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {getSummaryCards().map((card, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border backdrop-blur-sm ${card.color}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">
                  {typeof card.value === 'number' ? card.value : card.value}
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-medium text-white text-sm mb-1">{card.title}</h3>
              <p className="text-white/70 text-xs">{card.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Critical Information Alerts */}
      {(summary.critical_allergies.length > 0 || summary.chronic_conditions.length > 0) && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center">
            <span className="mr-2">🚨</span>
            Información Crítica
          </h2>

          {/* Critical Allergies */}
          {summary.critical_allergies.length > 0 && (
            <div className="p-4 rounded-lg border border-red-500 bg-red-50 backdrop-blur-sm">
              <h3 className="font-medium text-red-800 mb-2 flex items-center">
                <span className="mr-2">⚠️</span>
                Alergias Críticas
              </h3>
              <div className="space-y-1">
                {summary.critical_allergies.map((allergy: string, index: number) => (
                  <div key={index} className="text-red-900 text-sm">
                    • {allergy}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chronic Conditions */}
          {summary.chronic_conditions.length > 0 && (
            <div className="p-4 rounded-lg border border-orange-500 bg-orange-50 backdrop-blur-sm">
              <h3 className="font-medium text-orange-800 mb-2 flex items-center">
                <span className="mr-2">🔄</span>
                Condiciones Crónicas
              </h3>
              <div className="space-y-1">
                {summary.chronic_conditions.map((condition: string, index: number) => (
                  <div key={index} className="text-orange-900 text-sm">
                    • {condition}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current Medications */}
      {summary.current_medications.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center">
            <span className="mr-2">💊</span>
            Medicamentos Actuales
          </h2>

          <div className="p-4 rounded-lg border border-green-500 bg-green-500/10 backdrop-blur-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {summary.current_medications.map((medication: string, index: number) => (
                <div key={index} className="text-green-200 text-sm p-2 rounded bg-black/20">
                  • {medication}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center">
          <span className="mr-2">⚡</span>
          Acciones Rápidas
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 transition-colors text-left">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">📝</span>
              <div>
                <h3 className="font-medium text-white">Actualizar Historia</h3>
                <p className="text-white/60 text-sm">Agregar nueva información médica</p>
              </div>
            </div>
          </button>

          <button className="p-4 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 transition-colors text-left">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">📄</span>
              <div>
                <h3 className="font-medium text-white">Generar Resumen</h3>
                <p className="text-white/60 text-sm">Crear resumen para médico</p>
              </div>
            </div>
          </button>

          <button className="p-4 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 transition-colors text-left">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">📊</span>
              <div>
                <h3 className="font-medium text-white">Ver Completa</h3>
                <p className="text-white/60 text-sm">Historia clínica detallada</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Health Score Indicator */}
      <div className="p-6 rounded-lg border border-white/20 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Estado de Salud General</h3>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-400">Estable</div>
            <div className="text-sm text-white/60">Último análisis</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-white/70">Riesgo cardiovascular</span>
            <span className="text-green-400">Bajo</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/70">Cumplimiento medicamentos</span>
            <span className="text-green-400">Alto</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/70">Control rutinario</span>
            <span className="text-yellow-400">Pendiente</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/20">
          <p className="text-white/70 text-sm">
            Tu estado de salud general es estable. Se recomienda mantener el seguimiento médico regular y el cumplimiento del tratamiento actual.
          </p>
        </div>
      </div>
    </div>
  );
}