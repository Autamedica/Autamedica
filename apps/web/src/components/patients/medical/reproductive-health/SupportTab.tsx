'use client';

import {
  Phone,
  Heart,
  Shield,
  ExternalLink,
  MapPin,
  Calendar,
} from 'lucide-react';

const resources = [
  {
    name: 'Linea Nacional de Salud Sexual',
    contact: '0800-222-3444',
    description: 'Atencion telefonica gratuita, anonima y confidencial',
    icon: <Phone className="h-5 w-5 text-green-400" />,
  },
  {
    name: 'Consejeria IVE/ILE',
    contact: '0800-345-4266 (0800-ELIGIENDO)',
    description: 'Orientacion sobre tus derechos y acceso a servicios',
    icon: <Phone className="h-5 w-5 text-blue-400" />,
  },
  {
    name: 'Socorristas en Red',
    contact: 'socorristasenred.org',
    description: 'Acompanamiento y contencion durante todo el proceso',
    icon: <Heart className="h-5 w-5 text-rose-600" />,
  },
  {
    name: 'Linea 144',
    contact: '144',
    description: 'Atencion para victimas de violencia de genero (24hs)',
    icon: <Shield className="h-5 w-5 text-[var(--au-text-secondary)]" />,
  },
];

export function SupportTab() {
  return (
    <div className="space-y-6">
      <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-6">
        <h2 className="heading-2 mb-2">No estas sola</h2>
        <p className="text-body">
          Existen multiples organizaciones y lineas de apoyo disponibles para acompanarte
          en este proceso con informacion, contencion emocional y asesoramiento legal.
        </p>
      </div>

      <div className="space-y-4">
        {resources.map((resource, index) => (
          <div key={index} className="bg-white border border-stone-200 shadow-md rounded-xl p-4">
            <div className="flex items-start gap-3">
              {resource.icon}
              <div className="flex-1">
                <h3 className="font-semibold text-[var(--au-text-primary)] mb-1">{resource.name}</h3>
                <p className="text-[var(--au-text-primary)] font-mono text-sm mb-2">{resource.contact}</p>
                <p className="text-[var(--au-text-secondary)] text-sm">{resource.description}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-[var(--au-text-primary)]/50" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[var(--au-surface)] border-2 border-[var(--au-border)] rounded-xl p-6">
        <h3 className="heading-3 mb-4 flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-600" />
          Apoyo Emocional
        </h3>
        <p className="text-body mb-4">
          Es normal experimentar diferentes emociones. Tienes derecho a recibir acompanamiento
          psicologico antes, durante y despues del proceso.
        </p>
        <button className="w-full btn-secondary-ivory px-4 py-2 text-sm flex items-center justify-center gap-2">
          <Calendar className="h-4 w-4" />
          Solicitar Apoyo Psicologico
        </button>
      </div>

      <div className="bg-am-primary-50 border-2 border-am-primary-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-[var(--au-text-primary)] mb-4 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-am-primary-400" />
          Donde puedo acceder?
        </h3>
        <ul className="space-y-2 text-sm text-am-primary-900">
          <li>&bull; Hospitales publicos de todo el pais</li>
          <li>&bull; Centros de salud y CAPS</li>
          <li>&bull; Obras sociales (obligatorio por ley)</li>
          <li>&bull; Empresas de medicina prepaga (obligatorio por ley)</li>
        </ul>
        <p className="mt-4 text-xs text-am-primary-700">
          Si te niegan el acceso, podes denunciar en el 0800-222-3444 o hacer la denuncia en linea
          en argentina.gob.ar/salud
        </p>
      </div>
    </div>
  );
}
