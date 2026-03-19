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
    { id: 'calculator' as TabId, label: 'Plan de Acción', icon: Calculator },
    { id: 'timeline' as TabId, label: 'Mi Línea de Tiempo', icon: Clock },
    { id: 'education' as TabId, label: 'Guías y Hábitos', icon: ListChecks },
  ];
  const effectiveTab: TabId = !isProfileReady && activeTab !== 'education' ? 'education' : activeTab;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 p-3 shadow-lg shadow-indigo-200">
          <Heart className="h-8 w-8 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">Tu Hoja de Ruta</h1>
          <p className="text-stone-600 leading-relaxed max-w-xl">
            Estrategias personalizadas para tu bienestar. Mantente un paso adelante con un plan diseñado específicamente para tu perfil clínico.
          </p>
        </div>
      </div>

      {!isProfileReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 backdrop-blur-sm shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-amber-900">Personaliza tu Guía</p>
              <p className="mt-1 text-sm text-amber-800 leading-relaxed max-w-2xl">
                Para desbloquear tus recomendaciones preventivas y empezar tu plan de acción, necesitamos completar algunos detalles básicos de tu perfil.
              </p>
              <Link
                href="/profile"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700"
              >
                Completar mi perfil ahora
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ListChecks className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Metas Alcanzadas</p>
              <p className="text-2xl font-extrabold text-stone-900">0</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Próximos Pasos</p>
              <p className="text-2xl font-extrabold text-stone-900">0</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Heart className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Estado del Plan</p>
              <p className="text-sm font-bold text-stone-900 leading-tight">Iniciando mi camino</p>
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
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-stone-100 text-stone-400">
                <ListChecks className="h-10 w-10" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-stone-900">Guías de Salud y Bienestar</h3>
              <p className="mx-auto max-w-md text-stone-600 leading-relaxed text-sm">
                Accede a contenido curado por expertos sobre hábitos, nutrición y prevención para sostener tu salud en el largo plazo.
              </p>
              <button className="mt-6 rounded-xl border border-stone-300 px-6 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50 transition-colors">
                Explorar Biblioteca
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
