'use client';

import {
  CheckCircle,
  Shield,
  FileText,
  Info,
  Heart,
  Users,
  Scale,
  Stethoscope,
} from 'lucide-react';

const rights = [
  {
    title: 'Acceso libre y gratuito',
    description: 'En todo el sistema de salud (publico, obras sociales y prepagas)',
    icon: <CheckCircle className="h-5 w-5 text-green-400" />,
  },
  {
    title: 'Sin autorizacion de terceros',
    description: 'No necesitas permiso de pareja, padres ni tutores (a partir de los 16 anos)',
    icon: <Shield className="h-5 w-5 text-blue-400" />,
  },
  {
    title: 'Confidencialidad absoluta',
    description: 'Toda la informacion es privada y protegida por secreto medico',
    icon: <FileText className="h-5 w-5 text-blue-600" />,
  },
  {
    title: 'Informacion clara y completa',
    description: 'Derecho a recibir toda la informacion sobre procedimientos, riesgos y cuidados',
    icon: <Info className="h-5 w-5 text-yellow-400" />,
  },
  {
    title: 'Atencion respetuosa',
    description: 'Sin discriminacion, maltrato ni violencia obstetrica',
    icon: <Heart className="h-5 w-5 text-rose-600" />,
  },
  {
    title: 'Objecion de conciencia limitada',
    description: 'Si un medico objeta, debe derivarte inmediatamente a otro profesional',
    icon: <Users className="h-5 w-5 text-amber-700" />,
  },
];

export function RightsTab() {
  return (
    <div className="space-y-6">
      <div className="bg-am-primary-50 border-2 border-am-primary-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Scale className="h-6 w-6 text-am-primary-700 flex-shrink-0" />
          <div>
            <h2 className="heading-2 mb-2">Ley 27.610 - Tus Derechos</h2>
            <p className="text-am-primary-900 text-sm leading-relaxed">
              Sancionada el 30 de diciembre de 2020, esta ley garantiza el acceso a la interrupcion
              voluntaria del embarazo y a la atencion postaborto en todo el pais.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {rights.map((right, index) => (
          <div key={index} className="bg-white border border-stone-200 shadow-md rounded-lg p-4">
            <div className="flex items-start gap-3">
              {right.icon}
              <div>
                <h3 className="font-semibold text-[var(--au-text-primary)] mb-1">{right.title}</h3>
                <p className="text-[var(--au-text-secondary)] text-sm">{right.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-am-primary-50 border-2 border-am-primary-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-[var(--au-text-primary)] mb-4 flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-am-primary-400" />
          Deberes del Personal de Salud
        </h3>
        <ul className="space-y-3 text-sm text-am-primary-900">
          <li className="flex items-start gap-2">
            <span className="text-am-primary-400 mt-0.5">&bull;</span>
            <span>Brindar informacion completa, clara y en lenguaje comprensible</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-am-primary-400 mt-0.5">&bull;</span>
            <span>Garantizar atencion en maximo 10 dias corridos desde la solicitud</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-am-primary-400 mt-0.5">&bull;</span>
            <span>No pueden negarse si hay riesgo para la vida o salud de la persona</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-am-primary-400 mt-0.5">&bull;</span>
            <span>Si objetan por conciencia, deben derivar inmediatamente</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-am-primary-400 mt-0.5">&bull;</span>
            <span>Respetar la confidencialidad y dignidad de la persona</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
