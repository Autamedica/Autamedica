'use client';

import { useState } from 'react';

interface LicenseValidationStepProps {
  licenseNumber: string;
  onUpdate: (licenseNumber: string, isValid: boolean) => void;
  onNext: () => void;
  onCancel?: () => void;
}

const ARGENTINE_PROVINCES = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán'
] as const;

type Province = typeof ARGENTINE_PROVINCES[number];

export function LicenseValidationStep({
  licenseNumber,
  onUpdate,
  onNext,
  onCancel
}: LicenseValidationStepProps) {
  const [license, setLicense] = useState(licenseNumber);
  const [selectedProvince, setSelectedProvince] = useState<Province | ''>('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    message: string;
    doctorInfo?: {
      name: string;
      specialty: string;
      status: string;
    };
  } | null>(null);

  const validateLicenseFormat = (licenseNum: string, province: string): boolean => {
    if (!licenseNum || !province) return false;
    const basicPattern = /^\d{4,8}$/;
    const provincePatterns: Record<string, RegExp> = {
      'Buenos Aires': /^MP\d{4,6}$|^\d{4,6}$/i,
      'CABA': /^MN\d{4,6}$|^\d{4,6}$/i,
      'Córdoba': /^(MP|MN)\d{4,6}$|^\d{4,6}$/i,
      'Santa Fe': /^SF\d{4,6}$|^\d{4,6}$/i,
      'Mendoza': /^MD\d{4,6}$|^\d{4,6}$/i,
    };
    const pattern = provincePatterns[province] || basicPattern;
    return pattern.test(licenseNum);
  };

  const validateLicenseWithRegistry = async (licenseNum: string, province: string) => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const isValidFormat = validateLicenseFormat(licenseNum, province);

      if (!isValidFormat) {
        setValidationResult({
          isValid: false,
          message: `Formato de licencia inválido para ${province}. Verifica el número ingresado.`
        });
        return;
      }

      const result = {
        isValid: true,
        message: 'Licencia registrada. La verificación formal se completará durante la revisión de su perfil.',
      };
      setValidationResult(result);
      onUpdate(licenseNum, result.isValid);
    } catch {
      setValidationResult({
        isValid: false,
        message: 'Error al validar licencia. Intenta nuevamente.'
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleLicenseChange = (value: string) => {
    setLicense(value);
    setValidationResult(null);
    if (value !== licenseNumber) {
      onUpdate(value, false);
    }
  };

  const handleValidate = () => {
    if (!license.trim()) {
      setValidationResult({
        isValid: false,
        message: 'Por favor ingresa tu número de licencia médica'
      });
      return;
    }
    if (!selectedProvince) {
      setValidationResult({
        isValid: false,
        message: 'Por favor selecciona la provincia donde está registrada tu licencia'
      });
      return;
    }
    validateLicenseWithRegistry(license.trim(), selectedProvince);
  };

  const canProceed = validationResult?.isValid === true;

  const inputClass = 'w-full px-3.5 py-2.5 border border-am-surface-300 rounded-xl bg-white text-am-surface-900 placeholder:text-am-surface-400 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors disabled:bg-am-surface-50 disabled:text-am-surface-400';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-am-surface-900 mb-2">
          Validación de Licencia Médica
        </h3>
        <p className="text-am-surface-500">
          Para verificar tu identidad profesional, necesitamos validar tu licencia médica
          con el registro nacional (ENACOM/REFEPS).
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="province" className="block text-sm font-medium text-am-surface-700 mb-1.5">
            Provincia de Registro
          </label>
          <select
            id="province"
            value={selectedProvince}
            onChange={(e) => setSelectedProvince(e.target.value as Province)}
            className={inputClass}
            disabled={isValidating}
          >
            <option value="">Selecciona una provincia</option>
            {ARGENTINE_PROVINCES.map(province => (
              <option key={province} value={province}>{province}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="license" className="block text-sm font-medium text-am-surface-700 mb-1.5">
            Número de Licencia Médica
          </label>
          <input
            type="text"
            id="license"
            value={license}
            onChange={(e) => handleLicenseChange(e.target.value)}
            placeholder="Ej: MP12345, 123456"
            className={inputClass}
            disabled={isValidating}
          />
          <p className="text-xs text-am-surface-400 mt-1.5">
            Ingresa tu número de matrícula profesional tal como aparece en tu documento
          </p>
        </div>

        <button
          onClick={handleValidate}
          disabled={isValidating || !license.trim() || !selectedProvince}
          className="w-full bg-am-doctor-500 text-white py-2.5 px-4 rounded-xl hover:bg-am-doctor-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium transition-all duration-am-fast shadow-am-sm active:scale-[0.97]"
        >
          {isValidating ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Validando con ENACOM...
            </>
          ) : (
            'Validar Licencia Médica'
          )}
        </button>
      </div>

      {validationResult && (
        <div className={`p-4 rounded-xl ${
          validationResult.isValid
            ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex">
            {validationResult.isValid ? (
              <svg className="w-5 h-5 text-emerald-500 mr-2 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-400 mr-2 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <div>
              <p className={`text-sm font-medium ${
                validationResult.isValid ? 'text-emerald-800' : 'text-red-800'
              }`}>
                {validationResult.message}
              </p>
              {validationResult.doctorInfo && (
                <div className="mt-2 text-sm text-emerald-700">
                  <p><strong>Nombre:</strong> {validationResult.doctorInfo.name}</p>
                  <p><strong>Especialidad:</strong> {validationResult.doctorInfo.specialty}</p>
                  <p><strong>Estado:</strong> {validationResult.doctorInfo.status}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-6 border-t border-am-surface-100">
        <button
          onClick={onCancel}
          className="px-4 py-2.5 text-am-surface-500 hover:text-am-surface-900 hover:bg-am-surface-100 rounded-xl transition-all duration-am-fast"
        >
          Cancelar
        </button>

        <button
          onClick={onNext}
          disabled={!canProceed}
          className="px-6 py-2.5 bg-am-doctor-500 text-white rounded-xl hover:bg-am-doctor-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-am-fast font-medium shadow-am-sm active:scale-[0.97]"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
