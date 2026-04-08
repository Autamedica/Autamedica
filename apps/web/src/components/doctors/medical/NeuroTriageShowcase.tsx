'use client';

import { NeuroStabilityCard } from './NeuroStabilityCard';

export function NeuroTriageShowcase() {
  const samples = [
    {
      score: 'GREEN' as const,
      reasons: [],
      vitals: { bloodPressure: '120/80', heartRate: 72, weight: 70 },
      dateRecorded: new Date().toISOString(),
    },
    {
      score: 'YELLOW' as const,
      reasons: ['Presión arterial ligeramente elevada.', 'Frecuencia cardíaca por encima del promedio.'],
      vitals: { bloodPressure: '138/88', heartRate: 98, weight: 72 },
      dateRecorded: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      score: 'RED' as const,
      reasons: ['Hipertensión nivel de riesgo detectada.', 'Taquicardia severa reportada.', 'Alerta de seguridad: Requiere intervención inmediata.'],
      vitals: { bloodPressure: '150/100', heartRate: 115, weight: 68 },
      dateRecorded: new Date(Date.now() - 172800000).toISOString(),
    }
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-6 bg-white rounded-3xl shadow-am-xl">
      <div className="mb-8">
        <h3 className="text-xl font-bold text-stone-900 mb-2">Triage Automático - Neurotrópicos</h3>
        <p className="text-sm text-stone-500">
          Visualización de los estados de estabilidad clínica basados en el motor de puntuación Medvi LATAM.
        </p>
      </div>
      
      {samples.map((sample, i) => (
        <NeuroStabilityCard key={i} {...sample} />
      ))}
    </div>
  );
}
