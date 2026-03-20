'use client';

import {
  anatomicalBodyRegions,
  getBodyMapHeatColor,
  getBodyRegionById,
} from '@/data/anatomical-body-map';
import type {
  BodyAspect,
  BodyLaterality,
  BodyMapSelection,
  BodySymptomType,
} from '@/types/anamnesis';
import { Activity, MapPin, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface AnamnesisBodyMapFieldProps {
  value: BodyMapSelection[] | null | undefined;
  onChange: (_value: BodyMapSelection[]) => void;
}

const symptomTypeOptions: Array<{ value: BodySymptomType; label: string }> = [
  { value: 'pain', label: 'Dolor' },
  { value: 'pressure', label: 'Presion' },
  { value: 'burning', label: 'Ardor' },
  { value: 'numbness', label: 'Adormecimiento' },
  { value: 'weakness', label: 'Debilidad' },
  { value: 'swelling', label: 'Hinchazon' },
  { value: 'other', label: 'Otro' },
];

const lateralityOptions: Array<{ value: BodyLaterality; label: string }> = [
  { value: 'left', label: 'Izquierda' },
  { value: 'right', label: 'Derecha' },
  { value: 'bilateral', label: 'Bilateral' },
  { value: 'midline', label: 'Linea media' },
  { value: 'unknown', label: 'No claro' },
];

const aspectOptions: Array<{ value: BodyAspect; label: string }> = [
  { value: 'anterior', label: 'Anterior' },
  { value: 'posterior', label: 'Posterior' },
  { value: 'diffuse', label: 'Difuso' },
];

function normalizeSelections(value: BodyMapSelection[] | null | undefined): BodyMapSelection[] {
  return Array.isArray(value) ? value : [];
}

export function AnamnesisBodyMapField({
  value,
  onChange,
}: AnamnesisBodyMapFieldProps) {
  const selections = useMemo(() => normalizeSelections(value), [value]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(
    selections[0]?.partId ?? null,
  );
  const [intensity, setIntensity] = useState<number>(5);
  const [symptomType, setSymptomType] = useState<BodySymptomType>('pain');
  const [laterality, setLaterality] = useState<BodyLaterality>('unknown');
  const [aspect, setAspect] = useState<BodyAspect>('anterior');

  const activeRegion = activeRegionId ? getBodyRegionById(activeRegionId) : undefined;
  const activeSelection =
    activeRegionId != null
      ? selections.find((selection) => selection.partId === activeRegionId) ?? null
      : null;

  useEffect(() => {
    if (!activeRegion) {
      return;
    }

    if (activeSelection) {
      setIntensity(activeSelection.intensity);
      setSymptomType(activeSelection.symptomType);
      setLaterality(activeSelection.laterality);
      setAspect(activeSelection.aspect);
      return;
    }

    setIntensity(5);
    setSymptomType('pain');
    setLaterality(activeRegion.defaultLaterality);
    setAspect(activeRegion.defaultAspect);
  }, [activeRegion, activeSelection]);

  function handleRegionSelect(partId: string): void {
    setActiveRegionId(partId);
  }

  function upsertSelection(): void {
    if (!activeRegion) {
      return;
    }

    const nextSelection: BodyMapSelection = {
      partId: activeRegion.id,
      label: activeRegion.label,
      intensity,
      symptomType,
      laterality,
      aspect,
    };

    const nextSelections = selections.some((selection) => selection.partId === activeRegion.id)
      ? selections.map((selection) =>
          selection.partId === activeRegion.id ? nextSelection : selection,
        )
      : [...selections, nextSelection];

    onChange(nextSelections);
  }

  function removeSelection(partId: string): void {
    const nextSelections = selections.filter((selection) => selection.partId !== partId);
    onChange(nextSelections);
    if (activeRegionId === partId) {
      setActiveRegionId(nextSelections[0]?.partId ?? null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-900">Mapa corporal orientativo</p>
                <p className="text-xs leading-5 text-stone-500">
                  Marca el sitio principal del sintoma para anclar la localizacion anatomica.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                <MapPin className="h-3.5 w-3.5" />
                {selections.length} seleccion{selections.length === 1 ? '' : 'es'}
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-[radial-gradient(circle_at_top,_#ffffff,_#f5f5f4)]">
              <svg viewBox="0 0 240 520" className="h-auto w-full">
                {anatomicalBodyRegions.map((region) => {
                  const savedSelection = selections.find(
                    (selection) => selection.partId === region.id,
                  );
                  const isActive = activeRegionId === region.id;

                  return (
                    <path
                      key={region.id}
                      d={region.path}
                      onClick={() => handleRegionSelect(region.id)}
                      className="cursor-pointer transition-all duration-150"
                      fill={
                        savedSelection
                          ? getBodyMapHeatColor(savedSelection.intensity)
                          : isActive
                            ? '#d6d3d1'
                            : '#f5f5f4'
                      }
                      stroke={isActive ? '#44403c' : '#a8a29e'}
                      strokeWidth={isActive ? 3 : 1.5}
                    />
                  );
                })}
              </svg>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-stone-600 sm:grid-cols-3">
              <div className="rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                Intensidad 1-3: leve
              </div>
              <div className="rounded-xl bg-orange-50 px-3 py-2 ring-1 ring-orange-200">
                Intensidad 4-6: moderada
              </div>
              <div className="rounded-xl bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
                Intensidad 7-10: severa
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
              <Activity className="h-4 w-4 text-stone-500" />
              {activeRegion ? `Configurar ${activeRegion.label}` : 'Seleccione una region corporal'}
            </div>

            {activeRegion ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-stone-700">
                    Tipo de sintoma
                    <select
                      value={symptomType}
                      onChange={(event) =>
                        setSymptomType(event.target.value as BodySymptomType)
                      }
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
                    >
                      {symptomTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2 text-sm font-medium text-stone-700">
                    Lateralidad
                    <select
                      value={laterality}
                      onChange={(event) =>
                        setLaterality(event.target.value as BodyLaterality)
                      }
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
                    >
                      {lateralityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
                  <label className="space-y-2 text-sm font-medium text-stone-700">
                    Intensidad referida
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={intensity}
                      onChange={(event) => setIntensity(Number(event.target.value))}
                      className="w-full accent-amber-600"
                    />
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>1</span>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-900">
                        {intensity}/10
                      </span>
                      <span>10</span>
                    </div>
                  </label>

                  <label className="space-y-2 text-sm font-medium text-stone-700">
                    Vista
                    <select
                      value={aspect}
                      onChange={(event) => setAspect(event.target.value as BodyAspect)}
                      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
                    >
                      {aspectOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
                  Esta seleccion se enviara al extractor como <span className="font-semibold text-stone-900">evidencia anatomica estructurada</span>, para mejorar localizacion, lateralidad e intensidad del motivo de consulta.
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={upsertSelection}
                    className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                  >
                    <Plus className="h-4 w-4" />
                    {activeSelection ? 'Actualizar region' : 'Agregar region'}
                  </button>
                  {activeSelection ? (
                    <button
                      type="button"
                      onClick={() => removeSelection(activeSelection.partId)}
                      className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Quitar region
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-stone-500">
                Elija una zona del cuerpo para registrar tipo de sintoma, intensidad y lateralidad.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-stone-900">Regiones registradas</p>
        {selections.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selections.map((selection) => (
              <button
                key={selection.partId}
                type="button"
                onClick={() => setActiveRegionId(selection.partId)}
                className={`rounded-full px-3 py-2 text-sm transition ${
                  activeRegionId === selection.partId
                    ? 'bg-stone-900 text-white'
                    : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50'
                }`}
              >
                {selection.label} · {selection.intensity}/10 · {selection.symptomType}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            Aun no hay regiones cargadas. Puede continuar sin usarlas, pero ayudan a cerrar la semiologia del sintoma.
          </p>
        )}
      </div>
    </div>
  );
}
