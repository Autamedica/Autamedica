// @ts-nocheck
'use client';

import React, { useState } from 'react';
import { DoctorEducation, MedicalCertification } from '@autamedica/types';

interface EducationCertificationStepProps {
  education: DoctorEducation[];
  certifications: MedicalCertification[];
  onUpdate: (education: DoctorEducation[], certifications: MedicalCertification[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function EducationCertificationStep({
  education,
  certifications,
  onUpdate,
  onNext,
  onBack
}: EducationCertificationStepProps) {
  const [educationList, setEducationList] = useState<DoctorEducation[]>(education);
  const [certificationsList, setCertificationsList] = useState<MedicalCertification[]>(certifications);

  const addEducation = () => {
    const newEducation: DoctorEducation = {
      institution: '',
      degree: '',
      year: new Date().getFullYear(),
      specialization: ''
    };
    const updated = [...educationList, newEducation];
    setEducationList(updated);
    onUpdate(updated, certificationsList);
  };

  const updateEducation = (index: number, field: keyof DoctorEducation, value: string | number) => {
    const updated = educationList.map((edu, i) =>
      i === index ? { ...edu, [field]: value } : edu
    );
    setEducationList(updated);
    onUpdate(updated, certificationsList);
  };

  const removeEducation = (index: number) => {
    const updated = educationList.filter((_, i) => i !== index);
    setEducationList(updated);
    onUpdate(updated, certificationsList);
  };

  const addCertification = () => {
    const newCertification: MedicalCertification = {
      name: '',
      issuer: '',
      date_issued: new Date().toISOString().split('T')[0],
      certificate_number: ''
    };
    const updated = [...certificationsList, newCertification];
    setCertificationsList(updated);
    onUpdate(educationList, updated);
  };

  const updateCertification = (index: number, field: keyof MedicalCertification, value: string) => {
    const updated = certificationsList.map((cert, i) =>
      i === index ? { ...cert, [field]: value } : cert
    );
    setCertificationsList(updated);
    onUpdate(educationList, updated);
  };

  const removeCertification = (index: number) => {
    const updated = certificationsList.filter((_, i) => i !== index);
    setCertificationsList(updated);
    onUpdate(educationList, updated);
  };

  const inputClass = 'w-full px-3.5 py-2.5 border border-am-surface-300 rounded-xl bg-white text-am-surface-900 placeholder:text-am-surface-400 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-am-surface-900 mb-2">
          Educación y Certificaciones
        </h3>
        <p className="text-am-surface-500">
          Agrega tu formación académica y certificaciones profesionales para generar confianza en los pacientes.
        </p>
      </div>

      {/* Educación */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-md font-medium text-am-surface-900">Educación Médica</h4>
          <button
            onClick={addEducation}
            className="px-3 py-1.5 text-sm bg-am-doctor-50 text-am-doctor-700 rounded-lg hover:bg-am-doctor-100 font-medium transition-colors"
          >
            + Agregar
          </button>
        </div>

        {educationList.map((edu, index) => (
          <div key={index} className="border border-am-surface-200 rounded-xl p-4 mb-4 hover:border-am-surface-300 transition-colors">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Institución
                </label>
                <input
                  type="text"
                  value={edu.institution}
                  onChange={(e) => updateEducation(index, 'institution', e.target.value)}
                  placeholder="Universidad de Buenos Aires"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Título/Grado
                </label>
                <input
                  type="text"
                  value={edu.degree}
                  onChange={(e) => updateEducation(index, 'degree', e.target.value)}
                  placeholder="Médico"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Año de Graduación
                </label>
                <select
                  value={edu.year}
                  onChange={(e) => updateEducation(index, 'year', parseInt(e.target.value))}
                  className={inputClass}
                >
                  {Array.from({ length: 50 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Especialización (Opcional)
                </label>
                <input
                  type="text"
                  value={edu.specialization || ''}
                  onChange={(e) => updateEducation(index, 'specialization', e.target.value)}
                  placeholder="Medicina Interna"
                  className={inputClass}
                />
              </div>
            </div>

            <button
              onClick={() => removeEducation(index)}
              className="mt-3 text-red-600 text-sm hover:text-red-700 font-medium transition-colors"
            >
              Eliminar educación
            </button>
          </div>
        ))}

        {educationList.length === 0 && (
          <div className="text-center py-10 border-2 border-dashed border-am-surface-200 rounded-2xl bg-am-surface-50/50">
            <svg className="mx-auto w-10 h-10 text-am-surface-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
            </svg>
            <p className="text-am-surface-500 mb-3">No has agregado educación médica</p>
            <button
              onClick={addEducation}
              className="text-am-doctor-600 hover:text-am-doctor-700 font-medium text-sm"
            >
              + Agregar tu primera educación
            </button>
          </div>
        )}
      </div>

      {/* Certificaciones */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-md font-medium text-am-surface-900">Certificaciones Profesionales</h4>
          <button
            onClick={addCertification}
            className="px-3 py-1.5 text-sm bg-am-doctor-50 text-am-doctor-700 rounded-lg hover:bg-am-doctor-100 font-medium transition-colors"
          >
            + Agregar
          </button>
        </div>

        {certificationsList.map((cert, index) => (
          <div key={index} className="border border-am-surface-200 rounded-xl p-4 mb-4 hover:border-am-surface-300 transition-colors">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Nombre de la Certificación
                </label>
                <input
                  type="text"
                  value={cert.name}
                  onChange={(e) => updateCertification(index, 'name', e.target.value)}
                  placeholder="Certificación en Cardiología"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Institución Emisora
                </label>
                <input
                  type="text"
                  value={cert.issuer}
                  onChange={(e) => updateCertification(index, 'issuer', e.target.value)}
                  placeholder="Sociedad Argentina de Cardiología"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Fecha de Emisión
                </label>
                <input
                  type="date"
                  value={cert.date_issued.split('T')[0]}
                  onChange={(e) => updateCertification(index, 'date_issued', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Número de Certificado (Opcional)
                </label>
                <input
                  type="text"
                  value={cert.certificate_number || ''}
                  onChange={(e) => updateCertification(index, 'certificate_number', e.target.value)}
                  placeholder="CERT-2024-001"
                  className={inputClass}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Fecha de Vencimiento (Opcional)
                </label>
                <input
                  type="date"
                  value={cert.expiry_date?.split('T')[0] || ''}
                  onChange={(e) => updateCertification(index, 'expiry_date', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <button
              onClick={() => removeCertification(index)}
              className="mt-3 text-red-600 text-sm hover:text-red-700 font-medium transition-colors"
            >
              Eliminar certificación
            </button>
          </div>
        ))}

        {certificationsList.length === 0 && (
          <div className="text-center py-10 border-2 border-dashed border-am-surface-200 rounded-2xl bg-am-surface-50/50">
            <svg className="mx-auto w-10 h-10 text-am-surface-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-am-surface-500 mb-3">No has agregado certificaciones</p>
            <button
              onClick={addCertification}
              className="text-am-doctor-600 hover:text-am-doctor-700 font-medium text-sm"
            >
              + Agregar tu primera certificación
            </button>
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-amber-400 mr-2 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-amber-800 text-sm">
            <strong>Tip:</strong> Agregar tu educación y certificaciones ayuda a generar confianza en los pacientes.
            Puedes saltar este paso y agregar esta información más tarde desde tu perfil.
          </p>
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
