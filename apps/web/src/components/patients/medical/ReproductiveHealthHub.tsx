'use client';

import { useState } from 'react';
import {
  Heart,
  Shield,
  FileText,
  AlertCircle,
  Phone,
  Video,
  Clock,
  Info,
  ChevronRight,
  Stethoscope,
} from 'lucide-react';
import { OverviewTab } from './reproductive-health/OverviewTab';
import { RightsTab } from './reproductive-health/RightsTab';
import { ProceduresTab } from './reproductive-health/ProceduresTab';
import { DoctorsTab } from './reproductive-health/DoctorsTab';
import { SupportTab } from './reproductive-health/SupportTab';

interface ReproductiveHealthHubProps {
  onRequestConsultation?: () => void;
  className?: string;
}

type TabId = 'overview' | 'rights' | 'procedures' | 'doctors' | 'support';

const tabs: { id: TabId; label: string; icon: typeof Info }[] = [
  { id: 'overview', label: 'Que es la IVE?', icon: Info },
  { id: 'rights', label: 'Mis Derechos Legales', icon: Shield },
  { id: 'procedures', label: 'Metodos Disponibles', icon: FileText },
  { id: 'doctors', label: 'Medicos Especializados', icon: Stethoscope },
  { id: 'support', label: 'Acompanamiento Emocional', icon: Heart },
];

export function ReproductiveHealthHub({ onRequestConsultation, className = '' }: ReproductiveHealthHubProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showUrgentContact, setShowUrgentContact] = useState(false);

  const handleEmergencyCall = () => {
    setShowUrgentContact(true);
    if (onRequestConsultation) {
      onRequestConsultation();
    }
  };

  return (
    <div className={`w-full p-6 ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-br from-[var(--au-surface)] to-white border-2 border-[var(--au-border)] rounded-2xl p-6 shadow-lg mb-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center">
              <Heart className="h-7 w-7 text-rose-600" />
            </div>
          </div>
          <div className="flex-1">
            <h1 className="heading-1 mb-2">Interrupcion Voluntaria del Embarazo (IVE)</h1>
            <p className="text-body leading-relaxed mb-3">
              Acceso a informacion confiable, acompanamiento emocional y atencion medica profesional
              para la interrupcion del embarazo.
            </p>
            <div className="bg-am-primary-50 border border-am-primary-200 rounded-lg p-3 mb-4">
              <h3 className="heading-3 text-am-primary-900 mb-2 flex items-center gap-2">
                <Info className="h-4 w-4" />
                En que consiste este servicio?
              </h3>
              <ul className="text-sm text-am-primary-800 space-y-1">
                <li>&bull; Consulta medica gratuita y confidencial</li>
                <li>&bull; Informacion sobre metodos disponibles (medicamentos o procedimiento quirurgico)</li>
                <li>&bull; Acompanamiento psicologico antes, durante y despues</li>
                <li>&bull; <strong>Sin necesidad de denuncia policial o autorizacion judicial</strong></li>
                <li>&bull; Es tu derecho segun la <strong>Ley 27.610</strong> (Argentina)</li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleEmergencyCall}
                className="flex items-center gap-2 bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg font-semibold text-sm transition shadow-md"
              >
                <Video className="h-4 w-4" />
                Consulta Medica Ahora
              </button>
              <a
                href="tel:08003454266"
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition shadow-md"
              >
                <Phone className="h-4 w-4" />
                Linea Nacional 0800-345-4266
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Urgent alert */}
      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 mb-1">Necesitas atencion urgente?</h3>
            <p className="text-red-800 text-sm mb-2">
              Si experimentas sangrado abundante, dolor intenso o fiebre alta, busca atencion medica inmediata.
            </p>
            <button
              onClick={handleEmergencyCall}
              className="text-red-700 hover:text-red-900 text-sm font-semibold flex items-center gap-1 underline"
            >
              Contactar medico de emergencia <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-[var(--au-border)]">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'bg-stone-800 text-white border border-stone-800'
                    : 'text-[var(--au-text-secondary)] hover:text-[var(--au-text-primary)] hover:bg-[var(--au-surface)]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'rights' && <RightsTab />}
        {activeTab === 'procedures' && <ProceduresTab />}
        {activeTab === 'doctors' && <DoctorsTab onRequestCall={handleEmergencyCall} />}
        {activeTab === 'support' && <SupportTab />}
      </div>

      {/* Urgent contact modal */}
      {showUrgentContact && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-am-primary-500/30 rounded-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-[var(--au-text-primary)]">Conectando con medico...</h3>
              <button
                onClick={() => setShowUrgentContact(false)}
                className="text-[var(--au-text-secondary)] hover:text-[var(--au-text-primary)]"
              >
                &#10005;
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-[var(--au-text-secondary)]">
                <Clock className="h-5 w-5 animate-spin" />
                <span>Buscando especialista disponible</span>
              </div>
              <p className="text-[var(--au-text-secondary)] text-sm">
                Estamos conectandote con un profesional de salud especializado en salud reproductiva
                que podra responder todas tus preguntas de forma confidencial.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
