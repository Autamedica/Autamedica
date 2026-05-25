'use client'

import { useState, useEffect } from 'react'
import { fetchApi } from '@/lib/api-client'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useCurrentDoctor } from '@/hooks/doctors/useRealDoctors'
import { MEDICAL_SPECIALTIES } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { CheckCircle2, Loader2, ArrowLeft, ShieldAlert, ShieldCheck, Heart, MessageSquareText, Stethoscope } from 'lucide-react'
import { SignaturePad } from './SignaturePad'

const ARGENTINE_PROVINCES = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán',
] as const

const SPECIALTY_OPTIONS = Object.values(MEDICAL_SPECIALTIES).sort((a, b) =>
  a.localeCompare(b, 'es'),
)

const inputClass =
  'w-full px-3.5 py-2.5 border border-am-surface-300 rounded-xl bg-white text-am-surface-900 placeholder:text-am-surface-400 focus:ring-2 focus:ring-am-doctor-400 focus:border-am-doctor-400 transition-colors disabled:bg-am-surface-50 disabled:text-am-surface-400'

function normalizeMatricula(value: unknown): string {
  return String(value ?? '').trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

type Country = 'argentina' | 'other'
type LicenseValidationStatus = 'pending' | 'valid' | 'pending_review' | 'rejected' | 'exempt'

type VerifyDoctorLicenseResponse = {
  success: true
  data: {
    status: 'valid' | 'exempt'
    profession: string | null
    is_psychiatrist: boolean
    checked_at: string
  }
}

export function ProfileForm() {
  const { user } = useAuthenticatedUser()
  const { doctor, loading: doctorLoading, refetch: refetchDoctor } = useCurrentDoctor(user?.id)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [country, setCountry] = useState<Country>('argentina')
  const [province, setProvince] = useState('')
  const [otherRegion, setOtherRegion] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [refepsId, setRefepsId] = useState('')
  const [enrollmentEntity, setEnrollmentEntity] = useState('')
  const [professionalAddress, setProfessionalAddress] = useState('')
  const [consultationFee, setConsultationFee] = useState('')
  const [payoutCbu, setPayoutCbu] = useState('')
  const [payoutAlias, setPayoutAlias] = useState('')
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [stampUrl, setStampUrl] = useState<string | null>(null)
  const [professionalDni, setProfessionalDni] = useState('')
  const [careGuideTemplate, setCareGuideTemplate] = useState<'neutral' | 'female' | 'empathetic'>('neutral')
  const [isVerifyingLicense, setIsVerifyingLicense] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (doctor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = doctor as any
      
      // Robust loading: Support both DB snake_case and Hook camelCase
      const first = d.profile?.firstName ?? d.profile?.first_name ?? d.first_name ?? d.firstName
      const last = d.profile?.lastName ?? d.profile?.last_name ?? d.last_name ?? d.lastName
      const ph = d.profile?.phone ?? d.phone ?? d.phoneNumber
      const license = d.license_number ?? d.licenseNumber
      const refeps = d.refeps_id ?? d.refepsId
      const entity = d.enrollment_entity ?? d.enrollmentEntity
      const address = d.professional_address ?? d.professionalAddress
      const fee = d.consultation_fee ?? d.consultationFee
      const cbu = d.payout_cbu ?? d.payoutCbu
      const alias = d.payout_alias ?? d.payoutAlias
      const sig = d.signatureUrl ?? d.signature_url ?? d.signatureImageUrl ?? d.signature_image_url
      const sta = d.stampUrl ?? d.stamp_url ?? d.stampImageUrl ?? d.stamp_image_url
      const jur = d.enrollment_jurisdiction ?? d.enrollmentJurisdiction
      const cgt = d.care_guide_template ?? d.careGuideTemplate ?? 'neutral'

      if (first) setFirstName(first)
      if (last) setLastName(last)
      if (ph) setPhone(ph)
      if (license) setLicenseNumber(license)
      if (d.specialty) setSpecialty(d.specialty)
      if (refeps) setRefepsId(refeps)
      if (entity) setEnrollmentEntity(entity)
      if (address) setProfessionalAddress(address)
      if (typeof fee === 'number') setConsultationFee(String(fee / 100))
      if (cbu) setPayoutCbu(cbu)
      if (alias) setPayoutAlias(alias)
      if (sig) setSignatureUrl(sig)
      if (sta) setStampUrl(sta)
      if (cgt) setCareGuideTemplate(cgt)
      
      if (jur) {
        if ((ARGENTINE_PROVINCES as readonly string[]).includes(jur)) {
          setCountry('argentina')
          setProvince(jur)
        } else {
          setCountry('other')
          setOtherRegion(jur)
        }
      }
    }
  }, [doctor])

  const region = country === 'argentina' ? province : otherRegion.trim()
  const normalizedCbu = payoutCbu.replace(/\D/g, '')
  const normalizedFee = consultationFee.trim()
  const consultationFeeValue = normalizedFee === '' ? undefined : Number(consultationFee)
  const consultationFeeIsValid =
    normalizedFee === '' || (Number.isFinite(consultationFeeValue) && consultationFeeValue >= 0)
  const payoutCbuIsValid = normalizedCbu === '' || normalizedCbu.length === 22
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = (doctor as any)?.profile
  const licenseValidationStatus = (
    profile?.sssValidationStatus ??
    profile?.sss_validation_status ??
    'pending'
  ) as LicenseValidationStatus
  const registeredSpecialty = profile?.especialidadRegistrada ?? profile?.especialidad_registrada
  const lastLicenseCheck = profile?.sssLastCheckedAt ?? profile?.sss_last_checked_at
  const normalizedDni = professionalDni.replace(/\D/g, '')
  const savedLicenseNumber = normalizeMatricula(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doctor as any)?.licenseNumber ?? (doctor as any)?.license_number,
  )
  const currentLicenseNumber = normalizeMatricula(licenseNumber)
  const licenseMatchesSavedProfile = currentLicenseNumber !== '' && currentLicenseNumber === savedLicenseNumber
  const canVerifyLicense =
    normalizedDni.length >= 7 &&
    normalizedDni.length <= 9 &&
    currentLicenseNumber.length >= 3 &&
    licenseMatchesSavedProfile &&
    licenseValidationStatus !== 'exempt' &&
    !isVerifyingLicense
  const canSubmit =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    specialty !== '' &&
    licenseNumber.trim().length >= 3 &&
    region !== '' &&
    consultationFeeIsValid &&
    payoutCbuIsValid

  async function handleVerifyLicense() {
    if (!canVerifyLicense || !user) return

    setIsVerifyingLicense(true)
    setVerificationMessage(null)
    setError(null)

    try {
      const supabase = getBrowserSupabaseClient()
      const { data, error: invokeError } = await supabase.functions.invoke<VerifyDoctorLicenseResponse>(
        'verify-doctor-license',
        {
          body: {
            dni: normalizedDni,
            matricula: currentLicenseNumber,
          },
        },
      )

      if (invokeError) {
        refetchDoctor()
        setVerificationMessage('No pudimos validarla automáticamente. Quedó pendiente de revisión manual.')
        return
      }

      if (data?.success) {
        refetchDoctor()
        setVerificationMessage(
          data.data.profession
            ? `Matrícula validada como ${data.data.profession}.`
            : 'Matrícula validada.',
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al validar la matrícula')
      logger.error('[ProfileForm] license verification error', err)
    } finally {
      setIsVerifyingLicense(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !user) return

    setIsSubmitting(true)
    setError(null)

    try {
      await fetchApi('/api/profiles/doctors', {
        body: {
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          phone: phone.trim() || undefined,
          license_number: licenseNumber.trim(),
          specialty,
          refeps_id: refepsId.trim() || undefined,
          enrollment_entity: enrollmentEntity.trim() || undefined,
          enrollment_jurisdiction: region.trim() || undefined,
          professional_address: professionalAddress.trim() || undefined,
          consultation_fee: normalizedFee === '' ? undefined : Math.round((consultationFeeValue || 0) * 100),
          payout_cbu: normalizedCbu || undefined,
          payout_alias: payoutAlias.trim() || undefined,
          signature_url: signatureUrl || undefined,
          stamp_url: stampUrl || undefined,
          care_guide_template: careGuideTemplate,
          active: true,
        },
      })

      await fetchApi('/api/doctors/onboarding-complete', { method: 'POST' })

      setSuccess(true)
      setTimeout(() => {
        window.location.href = '/doctors'
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      logger.error('[ProfileForm] submit error', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-700" />
          </div>
          <div>
            <p className="text-lg font-semibold text-am-surface-900">Perfil completado</p>
            <p className="mt-1 text-sm text-am-surface-500">Redirigiendo al portal...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-am-surface-50 py-8 px-4">
      <div className="mx-auto w-full max-w-lg">
        <a
          href="/doctors"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-am-surface-500 transition-colors hover:text-am-surface-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al portal
        </a>

        <div className="rounded-2xl border border-am-surface-200 bg-white p-6 shadow-am-sm">
          <h1 className="text-xl font-semibold text-am-surface-900">Completa tu perfil profesional</h1>
          <p className="mt-1 text-sm text-am-surface-500">
            Revisá y completá tus datos de identidad profesional.
          </p>

          {(doctorLoading && !doctor) ? (
            <div className="mt-8 flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-am-doctor-500" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                    Nombre
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Tu nombre"
                    className={inputClass}
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                    Apellido
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Tu apellido"
                    className={inputClass}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Teléfono (opcional)
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: +54 9 11 1234-5678"
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>

              <div className="h-px w-full bg-am-surface-200 my-6" />
            {/* Especialidad */}
            <div>
              <label htmlFor="specialty" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                Especialidad
              </label>
              <select
                id="specialty"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className={inputClass}
                disabled={isSubmitting}
              >
                <option value="">Selecciona tu especialidad</option>
                {SPECIALTY_OPTIONS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* País */}
            <div>
              <label htmlFor="country" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                País
              </label>
              <select
                id="country"
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value as Country)
                  setProvince('')
                  setOtherRegion('')
                }}
                className={inputClass}
                disabled={isSubmitting}
              >
                <option value="argentina">Argentina</option>
                <option value="other">Otro país</option>
              </select>
            </div>

            {/* Provincia (Argentina) o Región (otro país) */}
            {country === 'argentina' ? (
              <div>
                <label htmlFor="province" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Provincia de Registro
                </label>
                <select
                  id="province"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className={inputClass}
                  disabled={isSubmitting}
                >
                  <option value="">Selecciona una provincia</option>
                  {ARGENTINE_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="region" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  País / Región de Registro
                </label>
                <input
                  type="text"
                  id="region"
                  value={otherRegion}
                  onChange={(e) => setOtherRegion(e.target.value)}
                  placeholder="Ej: Colombia, Bogotá"
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
            )}

            {/* Número de matrícula y Entidad */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="license" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Número de Matrícula
                </label>
                <input
                  type="text"
                  id="license"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="Ej: MP12345"
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="enrollmentEntity" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Entidad de Matrícula (opcional)
                </label>
                <input
                  type="text"
                  id="enrollmentEntity"
                  value={enrollmentEntity}
                  onChange={(e) => setEnrollmentEntity(e.target.value)}
                  placeholder="Ej: Min. de Salud"
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <section
              id="license-verification"
              className="rounded-2xl border border-am-surface-200 bg-am-surface-50 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-am-doctor-600">
                  {licenseValidationStatus === 'valid' ? (
                    <ShieldCheck className="h-5 w-5" />
                  ) : (
                    <ShieldAlert className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-am-surface-900">
                      Validación nacional de matrícula
                    </h2>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-am-surface-600">
                      {licenseValidationStatus === 'valid'
                        ? 'Validada'
                        : licenseValidationStatus === 'exempt'
                          ? 'No requerida'
                          : licenseValidationStatus === 'pending_review'
                            ? 'Requiere revisión'
                            : licenseValidationStatus === 'rejected'
                              ? 'No aprobada'
                              : 'Pendiente'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-am-surface-500">
                    {licenseValidationStatus === 'exempt'
                      ? 'Este perfil está exceptuado de la validación nacional automática.'
                      : 'Usamos la matrícula cargada en tu perfil y tu DNI profesional para cruzar datos con el registro nacional.'}
                  </p>
                  {!licenseMatchesSavedProfile && licenseValidationStatus !== 'exempt' && (
                    <p className="mt-2 text-xs leading-relaxed text-amber-700">
                      Guardá el perfil antes de validar si modificaste la matrícula.
                    </p>
                  )}

                  {licenseValidationStatus !== 'exempt' && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div>
                        <label htmlFor="professionalDni" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                          DNI profesional
                        </label>
                        <input
                          type="text"
                          id="professionalDni"
                          value={professionalDni}
                          onChange={(e) => setProfessionalDni(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
                          placeholder="Solo números"
                          inputMode="numeric"
                          className={inputClass}
                          disabled={isSubmitting || isVerifyingLicense}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleVerifyLicense}
                        disabled={!canVerifyLicense}
                        className="inline-flex h-11 items-center justify-center rounded-xl bg-am-doctor-500 px-4 text-sm font-medium text-white shadow-am-sm transition-all hover:bg-am-doctor-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isVerifyingLicense ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Validando...
                          </span>
                        ) : (
                          'Validar'
                        )}
                      </button>
                    </div>
                  )}

                  {licenseValidationStatus === 'valid' && registeredSpecialty && (
                    <p className="mt-3 text-xs text-am-surface-500">
                      Especialidad registrada: {registeredSpecialty}
                    </p>
                  )}
                  {lastLicenseCheck && (
                    <p className="mt-1 text-xs text-am-surface-500">
                      Última verificación: {new Date(lastLicenseCheck).toLocaleDateString('es-AR')}
                    </p>
                  )}
                  {verificationMessage && (
                    <div className="mt-3 rounded-xl border border-am-surface-200 bg-white px-4 py-3 text-sm text-am-surface-700">
                      {verificationMessage}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* REFEPS e Institución */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="refepsId" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Nº de REFEPS (opcional)
                </label>
                <input
                  type="text"
                  id="refepsId"
                  value={refepsId}
                  onChange={(e) => setRefepsId(e.target.value)}
                  placeholder="Registro de Establecimientos"
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="professionalAddress" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Domicilio Profesional (opcional)
                </label>
                <input
                  type="text"
                  id="professionalAddress"
                  value={professionalAddress}
                  onChange={(e) => setProfessionalAddress(e.target.value)}
                  placeholder="Dirección del consultorio"
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="h-px w-full bg-am-surface-200 my-6" />
            <h2 className="text-base font-semibold text-am-surface-800 mb-1">Cobros</h2>
            <p className="text-xs text-am-surface-500 mb-4">
              Configurá cuánto cobrás por consulta y a qué cuenta querés recibir transferencias.
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="consultationFee" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Valor de consulta (ARS)
                </label>
                <input
                  type="number"
                  id="consultationFee"
                  value={consultationFee}
                  onChange={(e) => setConsultationFee(e.target.value)}
                  placeholder="Ej: 25000"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="payoutAlias" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                  Alias de cobro (opcional)
                </label>
                <input
                  type="text"
                  id="payoutAlias"
                  value={payoutAlias}
                  onChange={(e) => setPayoutAlias(e.target.value)}
                  placeholder="Ej: dr.garcia.consultas"
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div>
              <label htmlFor="payoutCbu" className="block text-sm font-medium text-am-surface-700 mb-1.5">
                CBU/CVU para cobros
              </label>
              <input
                type="text"
                id="payoutCbu"
                value={payoutCbu}
                onChange={(e) => setPayoutCbu(e.target.value.replace(/[^\d]/g, '').slice(0, 22))}
                placeholder="22 dígitos"
                inputMode="numeric"
                className={inputClass}
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-am-surface-500">
                Guardamos sólo números. Si cargás CBU/CVU, tienen que ser 22 dígitos.
              </p>
            </div>

            {!consultationFeeIsValid && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                El valor de consulta tiene que ser un número válido mayor o igual a 0.
              </div>
            )}

            {!payoutCbuIsValid && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                El CBU/CVU tiene que tener exactamente 22 dígitos.
              </div>
            )}

            {/* Patient Instructions Template Picker */}
            <div className="h-px w-full bg-am-surface-200 my-6" />
            <h2 className="text-base font-semibold text-am-surface-800 mb-1 flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-am-doctor-500" />
              Indicaciones para el paciente
            </h2>
            <p className="text-xs text-am-surface-500 mb-4 leading-relaxed">
              Elegí el estilo de comunicación que se usará como base editable en las indicaciones de tus recetas.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Tarjeta Neutra */}
              <button
                type="button"
                onClick={() => setCareGuideTemplate('neutral')}
                disabled={isSubmitting}
                className={`flex flex-col items-start text-left p-4 rounded-2xl border-2 transition-all duration-300 ${
                  careGuideTemplate === 'neutral'
                    ? 'border-am-doctor-500 bg-am-doctor-50/40 shadow-sm'
                    : 'border-am-surface-200 bg-white hover:border-am-surface-300 hover:shadow-am-sm'
                }`}
              >
                <div className={`p-2 rounded-xl mb-3 ${
                  careGuideTemplate === 'neutral' ? 'bg-am-doctor-100 text-am-doctor-600' : 'bg-am-surface-100 text-am-surface-500'
                }`}>
                  <Stethoscope className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-am-surface-900">Neutra / Clínica</h3>
              </button>

              {/* Tarjeta Profesional Femenina */}
              <button
                type="button"
                onClick={() => setCareGuideTemplate('female')}
                disabled={isSubmitting}
                className={`flex flex-col items-start text-left p-4 rounded-2xl border-2 transition-all duration-300 ${
                  careGuideTemplate === 'female'
                    ? 'border-am-doctor-500 bg-am-doctor-50/40 shadow-sm'
                    : 'border-am-surface-200 bg-white hover:border-am-surface-300 hover:shadow-am-sm'
                }`}
              >
                <div className={`p-2 rounded-xl mb-3 ${
                  careGuideTemplate === 'female' ? 'bg-rose-100 text-rose-600' : 'bg-am-surface-100 text-am-surface-500'
                }`}>
                  <Heart className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-am-surface-900">Profesional Femenina</h3>
              </button>

              {/* Tarjeta Empática / Cercana */}
              <button
                type="button"
                onClick={() => setCareGuideTemplate('empathetic')}
                disabled={isSubmitting}
                className={`flex flex-col items-start text-left p-4 rounded-2xl border-2 transition-all duration-300 ${
                  careGuideTemplate === 'empathetic'
                    ? 'border-am-doctor-500 bg-am-doctor-50/40 shadow-sm'
                    : 'border-am-surface-200 bg-white hover:border-am-surface-300 hover:shadow-am-sm'
                }`}
              >
                <div className={`p-2 rounded-xl mb-3 ${
                  careGuideTemplate === 'empathetic' ? 'bg-amber-100 text-amber-600' : 'bg-am-surface-100 text-am-surface-500'
                }`}>
                  <MessageSquareText className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-am-surface-900">Cercana</h3>
              </button>
            </div>

            {/* Vista previa de indicaciones */}
            <div className="mt-4 rounded-2xl border border-am-surface-200 bg-am-surface-50/50 p-4 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-am-surface-400">
                  Vista previa del tono
                </span>
              </div>
              <div className="text-xs text-am-surface-700 leading-relaxed italic bg-white p-3 rounded-xl border border-am-surface-100 shadow-am-xs">
                {careGuideTemplate === 'neutral' && (
                  <span>
                    "Tomar Amoxicilina 500 mg cada 8 horas durante 7 días. Completar el tratamiento indicado aunque los síntomas mejoren antes. Consultar ante reacción alérgica, dificultad para respirar o diarrea intensa."
                  </span>
                )}
                {careGuideTemplate === 'female' && (
                  <span>
                    "Tomá Amoxicilina 500 mg cada 8 horas durante 7 días. Completá el esquema indicado aunque te sientas mejor antes. Consultá si aparece alergia, dificultad para respirar o diarrea intensa."
                  </span>
                )}
                {careGuideTemplate === 'empathetic' && (
                  <span>
                    "Tomá Amoxicilina 500 mg cada 8 horas durante 7 días. No suspendas el tratamiento antes de tiempo aunque mejores. Si aparece sarpullido, falta de aire o diarrea fuerte, consultá de inmediato."
                  </span>
                )}
              </div>
            </div>

            {/* Firma y Sello */}
            <div className="h-px w-full bg-am-surface-200 my-6" />
            <h2 className="text-base font-semibold text-am-surface-800 mb-1">Firma y Sello</h2>
            <p className="text-xs text-am-surface-500 mb-4">
              Tu firma aparecerá en las recetas electrónicas que emitas.
            </p>
            <div className="space-y-4">
              <SignaturePad
                type="signature"
                currentUrl={signatureUrl}
                onSaved={setSignatureUrl}
              />
              <SignaturePad
                type="stamp"
                currentUrl={stampUrl}
                onSaved={setStampUrl}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="w-full rounded-xl bg-am-doctor-500 px-4 py-2.5 font-medium text-white shadow-am-sm transition-all hover:bg-am-doctor-600 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando...
                </span>
              ) : (
                'Completar perfil'
              )}
            </button>
          </form>
          )}
        </div>
      </div>
    </div>
  )
}
