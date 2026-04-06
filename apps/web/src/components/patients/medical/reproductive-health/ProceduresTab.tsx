'use client';

import { CheckCircle, AlertCircle, Info, Heart, Phone } from 'lucide-react';

const methods = [
  {
    name: 'Metodo con medicamentos',
    description: 'Mifepristona + Misoprostol o solo Misoprostol',
    weeks: 'Hasta semana 12-14',
    process: 'Ambulatorio, en casa con seguimiento medico',
    duration: '4-6 horas (proceso completo puede llevar dias)',
  },
  {
    name: 'Metodo instrumental (AMEU)',
    description: 'Aspiracion Manual Endouterina',
    weeks: 'Hasta semana 12-14',
    process: 'Procedimiento en consultorio o quirofano',
    duration: '10-15 minutos',
  },
];

const expectedEffects = [
  'Sangrado (normal hasta 2 semanas)',
  'Colicos similares a menstruacion',
  'Nauseas o vomitos',
  'Dolor de cabeza',
  'Fiebre leve (primeras 24hs)',
];

const warnings = [
  'Sangrado muy abundante (mas de 2 toallas por hora durante 2 horas)',
  'Fiebre alta (mas de 38C) despues de 24 horas',
  'Dolor muy intenso que no calma con analgesicos',
  'Flujo con mal olor',
  'Mareos intensos o desmayos',
];

export function ProceduresTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 shadow-md rounded-xl p-6">
        <h2 className="text-xl font-bold text-[var(--au-text-primary)] mb-4">Metodos Disponibles</h2>
        <div className="space-y-4">
          {methods.map((method, index) => (
            <div key={index} className="bg-[var(--au-surface)] border-2 border-[var(--au-border)] rounded-lg p-4">
              <h3 className="font-bold text-[var(--au-text-primary)] mb-2">{method.name}</h3>
              <div className="space-y-2 text-sm text-[var(--au-text-secondary)]">
                <p><strong className="text-[var(--au-text-primary)]">Descripcion:</strong> {method.description}</p>
                <p><strong className="text-[var(--au-text-primary)]">Periodo:</strong> {method.weeks}</p>
                <p><strong className="text-[var(--au-text-primary)]">Proceso:</strong> {method.process}</p>
                <p><strong className="text-[var(--au-text-primary)]">Duracion:</strong> {method.duration}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
        <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
          <Info className="h-5 w-5 text-amber-600" />
          Que esperar (efectos normales)
        </h3>
        <ul className="space-y-2 text-sm text-amber-900">
          {expectedEffects.map((effect, index) => (
            <li key={index} className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <span>{effect}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          Cuando buscar atencion medica urgente
        </h3>
        <ul className="space-y-2 text-sm text-red-900">
          {warnings.map((warning, index) => (
            <li key={index} className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
        <button className="mt-4 w-full bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-semibold text-sm transition flex items-center justify-center gap-2">
          <Phone className="h-4 w-4" />
          Contactar medico de emergencia
        </button>
      </div>

      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-emerald-900 mb-4 flex items-center gap-2">
          <Heart className="h-5 w-5 text-emerald-700" />
          Cuidados posteriores
        </h3>
        <div className="space-y-3 text-sm text-emerald-900">
          <p>&bull; Descansar cuando lo necesites</p>
          <p>&bull; Evitar relaciones sexuales por 1-2 semanas</p>
          <p>&bull; No usar tampones hasta que pase el sangrado</p>
          <p>&bull; Control medico a los 10-15 dias</p>
          <p>&bull; La menstruacion vuelve en 4-6 semanas aproximadamente</p>
          <p>&bull; Puedes quedar embarazada nuevamente muy pronto, consulta sobre anticoncepcion</p>
        </div>
      </div>
    </div>
  );
}
