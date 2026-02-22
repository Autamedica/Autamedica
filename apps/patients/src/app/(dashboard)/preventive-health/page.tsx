'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Heart, Calculator, Clock, ListChecks, Lock } from 'lucide-react';
import { PersonalizedScreeningCalculator } from '@/components/preventive/PersonalizedScreeningCalculator';
import { ScreeningTimeline } from '@/components/preventive/ScreeningTimeline';
import { usePatientSession } from '@/hooks/usePatientSession';
import { computeAgeFromIso, normalizeGender } from '@/lib/demographics';

type TabId = 'calculator' | 'timeline' | 'education';

export default function PreventiveHealthPage() {
  const [activeTab, setActiveTab] = useState<TabId>('calculator');
  const { patient } = usePatientSession();

  const birthDate = patient?.birthDate ?? null;
  const normalizedGender = normalizeGender(patient?.gender ?? null);
  const age = computeAgeFromIso(birthDate);

  const isProfileReady = Boolean(age && normalizedGender);
  const safeAge = age ?? 30;
  const safeGender: 'male' | 'female' = normalizedGender ?? 'male';

  const tabs = [
    { id: 'calculator' as TabId, label: 'Calculadora', icon: Calculator },
    { id: 'timeline' as TabId, label: 'Cronología', icon: Clock },
    { id: 'education' as TabId, label: 'Educación', icon: ListChecks },
  ];
  const effectiveTab: TabId = !isProfileReady && activeTab !== 'education' ? 'education' : activeTab;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 p-3">
          <Heart className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-stone-900">Salud Preventiva</h1>
          <p className="text-stone-600">Cuida tu salud con chequeos preventivos personalizados</p>
        </div>
      </div>

      {!isProfileReady && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Acceso bloqueado hasta completar perfil clínico</p>
              <p className="mt-2 text-sm text-amber-800">
                Para habilitar recomendaciones preventivas personalizadas, completa tu fecha de nacimiento y género.
              </p>
              <Link
                href="/profile"
                className="mt-4 inline-flex rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700"
              >
                Completar mi perfil
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-50 p-3">
              <ListChecks className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-stone-600">Chequeos completados</p>
              <p className="text-2xl font-bold text-stone-900">0</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-3">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-stone-600">Pendientes</p>
              <p className="text-2xl font-bold text-stone-900">0</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-3">
              <Heart className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-stone-600">Próximo chequeo</p>
              <p className="text-sm font-semibold text-stone-900">No programado</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-200">
          <div className="flex gap-1 p-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isDisabled = !isProfileReady && tab.id !== 'education';

              return (
                <button
                  key={tab.id}
                  onClick={() => !isDisabled && setActiveTab(tab.id)}
                  disabled={isDisabled}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
                    effectiveTab === tab.id
                      ? 'bg-stone-800 text-white'
                      : 'text-stone-600 hover:bg-stone-100'
                  } ${isDisabled ? 'cursor-not-allowed opacity-40 hover:bg-transparent' : ''}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {effectiveTab === 'calculator' && isProfileReady && (
            <PersonalizedScreeningCalculator defaultAge={safeAge} defaultGender={safeGender} />
          )}
          {effectiveTab === 'timeline' && isProfileReady && (
            <ScreeningTimeline currentAge={safeAge} gender={safeGender} />
          )}
          {effectiveTab === 'education' && (
            <div className="py-12 text-center">
              <ListChecks className="mx-auto mb-4 h-16 w-16 text-stone-300" />
              <h3 className="mb-2 text-lg font-semibold text-stone-900">Contenido educativo</h3>
              <p className="text-stone-600">
                Accede a guías de prevención y hábitos para sostener tu salud en el largo plazo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
