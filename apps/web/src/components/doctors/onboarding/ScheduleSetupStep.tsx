'use client';

import { useState } from 'react';
import { WeeklySchedule, DaySchedule } from '@autamedica/types';

interface ScheduleSetupStepProps {
  schedule: WeeklySchedule;
  consultationFee?: number;
  acceptedInsurance: string[];
  onUpdate: (schedule: WeeklySchedule, consultationFee?: number, acceptedInsurance?: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const DAYS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' }
] as const;

const COMMON_INSURANCE = [
  'OSDE',
  'Swiss Medical',
  'Medicus',
  'IOMA',
  'PAMI',
  'Galeno',
  'Medifé',
  'Hospital Italiano',
  'Hospital Alemán',
  'CEMIC',
  'Obra Social Empleados de Comercio',
  'OSECAC',
  'OSPLAD',
  'OSPEDYC'
] as const;

export function ScheduleSetupStep({
  schedule,
  consultationFee,
  acceptedInsurance,
  onUpdate,
  onNext,
  onBack
}: ScheduleSetupStepProps) {
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(schedule);
  const [fee, setFee] = useState<number>(consultationFee || 0);
  const [insurance, setInsurance] = useState<string[]>(acceptedInsurance);
  const [showInsuranceDropdown, setShowInsuranceDropdown] = useState(false);

  const inputClass = 'w-full px-3.5 py-2.5 border border-am-surface-300 rounded-xl bg-white text-am-surface-900 placeholder:text-am-surface-400 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors';

  const updateDaySchedule = (day: keyof WeeklySchedule, daySchedule: DaySchedule | undefined) => {
    const updated = { ...weeklySchedule, [day]: daySchedule };
    setWeeklySchedule(updated);
    onUpdate(updated, fee, insurance);
  };

  const toggleInsurance = (insuranceName: string) => {
    const updated = insurance.includes(insuranceName)
      ? insurance.filter(name => name !== insuranceName)
      : [...insurance, insuranceName];
    setInsurance(updated);
    onUpdate(weeklySchedule, fee, updated);
  };

  const updateFee = (newFee: number) => {
    setFee(newFee);
    onUpdate(weeklySchedule, newFee, insurance);
  };

  const DayScheduleEditor = ({ day, label }: { day: keyof WeeklySchedule; label: string }) => {
    const daySchedule = weeklySchedule[day];
    const isActive = !!daySchedule;

    return (
      <div className={`border rounded-xl p-4 transition-all ${isActive ? 'border-am-doctor-200 bg-am-doctor-50/30' : 'border-am-surface-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => {
                if (e.target.checked) {
                  updateDaySchedule(day, { start: '09:00', end: '17:00' });
                } else {
                  updateDaySchedule(day, undefined);
                }
              }}
              className="mr-2.5 w-4 h-4 rounded border-am-surface-300 text-am-doctor-500 focus:ring-am-doctor-400"
            />
            <span className={`font-medium ${isActive ? 'text-am-surface-900' : 'text-am-surface-500'}`}>{label}</span>
          </label>
        </div>

        {isActive && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-am-surface-600 mb-1">Desde</label>
              <input
                type="time"
                value={daySchedule?.start || '09:00'}
                onChange={(e) => updateDaySchedule(day, { ...(daySchedule ?? { start: '09:00', end: '17:00', active: true }), start: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm text-am-surface-600 mb-1">Hasta</label>
              <input
                type="time"
                value={daySchedule?.end || '17:00'}
                onChange={(e) => updateDaySchedule(day, { ...(daySchedule ?? { start: '09:00', end: '17:00', active: true }), end: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-am-surface-900 mb-2">
          Horarios y Configuración de Consultas
        </h3>
        <p className="text-am-surface-500">
          Define tus horarios de atención y configuración de consultas médicas.
        </p>
      </div>

      {/* Horarios */}
      <div>
        <h4 className="text-md font-medium text-am-surface-900 mb-4">Horarios de Atención</h4>
        <div className="space-y-3">
          {DAYS.map(({ key, label }) => (
            <DayScheduleEditor key={key} day={key} label={label} />
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              const fullWeekSchedule: WeeklySchedule = {
                monday: { start: '09:00', end: '17:00' },
                tuesday: { start: '09:00', end: '17:00' },
                wednesday: { start: '09:00', end: '17:00' },
                thursday: { start: '09:00', end: '17:00' },
                friday: { start: '09:00', end: '17:00' }
              };
              setWeeklySchedule(fullWeekSchedule);
              onUpdate(fullWeekSchedule, fee, insurance);
            }}
            className="px-3 py-1.5 text-sm bg-am-doctor-50 text-am-doctor-700 rounded-lg hover:bg-am-doctor-100 font-medium transition-colors"
          >
            Lunes a Viernes 9-17hs
          </button>
          <button
            onClick={() => {
              setWeeklySchedule({});
              onUpdate({}, fee, insurance);
            }}
            className="px-3 py-1.5 text-sm bg-am-surface-100 text-am-surface-600 rounded-lg hover:bg-am-surface-200 transition-colors"
          >
            Limpiar todo
          </button>
        </div>
      </div>

      {/* Precio */}
      <div>
        <h4 className="text-md font-medium text-am-surface-900 mb-2">Precio de Consulta</h4>
        <div className="flex items-center space-x-2">
          <span className="text-am-surface-600 font-medium">$</span>
          <input
            type="number"
            value={fee}
            onChange={(e) => updateFee(parseInt(e.target.value) || 0)}
            placeholder="0"
            min="0"
            step="500"
            className="w-32 px-3.5 py-2.5 border border-am-surface-300 rounded-xl bg-white text-am-surface-900 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors"
          />
          <span className="text-am-surface-400 text-sm">ARS (pesos argentinos)</span>
        </div>
        <p className="text-sm text-am-surface-400 mt-1.5">
          Puedes cambiar este precio en cualquier momento. Deja en 0 si prefieres no mostrar precios.
        </p>
      </div>

      {/* Obras sociales */}
      <div>
        <h4 className="text-md font-medium text-am-surface-900 mb-2">Obras Sociales Aceptadas</h4>

        <div className="relative">
          <button
            onClick={() => setShowInsuranceDropdown(!showInsuranceDropdown)}
            className="w-full px-3.5 py-2.5 text-left border border-am-surface-300 rounded-xl hover:bg-am-surface-50 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors"
          >
            <div className="flex justify-between items-center">
              <span className="text-am-surface-600">
                {insurance.length > 0 ? `${insurance.length} obras sociales seleccionadas` : 'Seleccionar obras sociales...'}
              </span>
              <svg
                className={`w-5 h-5 text-am-surface-400 transition-transform ${showInsuranceDropdown ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {showInsuranceDropdown && (
            <div className="absolute z-10 w-full mt-1 border border-am-surface-200 rounded-xl p-2 bg-white shadow-am-md max-h-60 overflow-y-auto">
              {COMMON_INSURANCE.map(insuranceName => (
                <label key={insuranceName} className="flex items-center px-3 py-2 hover:bg-am-surface-50 rounded-lg cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={insurance.includes(insuranceName)}
                    onChange={() => toggleInsurance(insuranceName)}
                    className="mr-3 w-4 h-4 rounded border-am-surface-300 text-am-doctor-500 focus:ring-am-doctor-400"
                  />
                  <span className="text-am-surface-900">{insuranceName}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {insurance.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {insurance.map(insuranceName => (
              <span
                key={insuranceName}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-am-doctor-50 text-am-doctor-700"
              >
                {insuranceName}
                <button
                  onClick={() => toggleInsurance(insuranceName)}
                  className="ml-2 text-am-doctor-500 hover:text-am-doctor-700 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-am-doctor-50 border border-am-doctor-200 rounded-xl p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-am-doctor-400 mr-2 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-am-doctor-800 text-sm">
              <strong>Nota:</strong> Esta configuración es opcional y puede ser modificada en cualquier momento.
              Los horarios ayudan a los pacientes a saber cuándo pueden contactarte.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t border-am-surface-100">
        <button
          onClick={onBack}
          className="px-4 py-2.5 text-am-surface-500 hover:text-am-surface-900 hover:bg-am-surface-100 rounded-xl transition-all duration-am-fast"
        >
          Atrás
        </button>

        <button
          onClick={onNext}
          className="px-6 py-2.5 bg-am-doctor-500 text-white rounded-xl hover:bg-am-doctor-600 transition-all duration-am-fast font-medium shadow-am-sm active:scale-[0.97]"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
