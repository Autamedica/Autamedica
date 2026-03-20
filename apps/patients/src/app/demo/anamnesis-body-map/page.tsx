'use client';

import { AnamnesisBodyMapField } from '@/components/anamnesis/AnamnesisBodyMapField';
import type { BodyMapSelection } from '@/types/anamnesis';
import { Activity, Braces, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';

export default function AnamnesisBodyMapDemoPage() {
  const [bodySelections, setBodySelections] = useState<BodyMapSelection[]>([]);

  const extractionFragment = useMemo(
    () => ({
      version: 'anamnesis_extraction_v2',
      bodySelections,
      motivo_consulta: {
        sintoma_principal: 'Me duele la cabeza y siento una presion que me sube al cuello',
        cuando_empezo: '2-7dias',
        intensidad_sintoma: 7,
      },
    }),
    [bodySelections],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fafaf9,_#f5f1e8)] px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white">
            <MapPin className="h-3.5 w-3.5" />
            Demo de anamnesis
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
            Mapa corporal dentro de motivo de consulta
          </h1>
          <p className="max-w-4xl text-base leading-7 text-stone-600">
            Esta superficie existe para evaluar el input anatomico sin depender del login. El
            componente es el mismo que vive dentro de la anamnesis real y el panel de la derecha
            muestra exactamente el fragmento JSON que el extractor recibira como evidencia
            estructurada.
          </p>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <section className="rounded-[28px] border border-stone-200 bg-white/95 p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Activity className="h-5 w-5 text-stone-500" />
              <div>
                <h2 className="text-lg font-semibold text-stone-900">
                  Input anatomico del sintoma
                </h2>
                <p className="text-sm text-stone-500">
                  Use este bloque como si estuviera completando la anamnesis del paciente.
                </p>
              </div>
            </div>

            <AnamnesisBodyMapField
              value={bodySelections}
              onChange={setBodySelections}
            />
          </section>

          <aside className="space-y-6">
            <section className="rounded-[28px] border border-stone-200 bg-white/95 p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <Braces className="h-5 w-5 text-stone-500" />
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">
                    Fragmento de request
                  </h2>
                  <p className="text-sm text-stone-500">
                    Esto es lo que ya puede viajar al extractor.
                  </p>
                </div>
              </div>

              <pre className="overflow-x-auto rounded-2xl bg-stone-950 p-4 text-xs leading-6 text-stone-100">
                {JSON.stringify(extractionFragment, null, 2)}
              </pre>
            </section>

            <section className="rounded-[28px] border border-stone-200 bg-stone-50/80 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-stone-900">
                Criterio clinico de uso
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
                <li>
                  No reemplaza el relato libre. Lo complementa con localizacion, lateralidad e
                  intensidad.
                </li>
                <li>
                  Sirve para disparar repreguntas dirigidas cuando el paciente describe mal el
                  sintoma.
                </li>
                <li>
                  Si el relato y el mapa discrepan, el extractor debe marcar la inconsistencia, no
                  inventar una sintesis.
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
