'use client'

import { useState, useEffect } from 'react'
import { fetchApi } from '@/lib/api-client'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useCurrentDoctor } from '@/hooks/doctors/useRealDoctors'
import { MEDICAL_SPECIALTIES } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'

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

type Country = 'argentina' | 'other'

export function ProfileForm() {
  const { user } = useAuthenticatedUser()
  const { doctor, loading: doctorLoading } = useCurrentDoctor(user?.id)

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

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (user?.profile) {
      if (user.profile.firstName) setFirstName(user.profile.firstName)
      if (user.profile.lastName) setLastName(user.profile.lastName)
      if (user.profile.phone) setPhone(user.profile.phone)
    }
  }, [user])

  useEffect(() => {
    if (doctor) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = doctor as any
      if (d.licenseNumber) setLicenseNumber(d.licenseNumber)
      if (d.specialty) setSpecialty(d.specialty)
      if (d.refepsId) setRefepsId(d.refepsId)
      if (d.enrollmentEntity) setEnrollmentEntity(d.enrollmentEntity)
      if (d.professionalAddress) setProfessionalAddress(d.professionalAddress)
      
      const jur = d.enrollmentJurisdiction
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
  const canSubmit =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    specialty !== '' &&
    licenseNumber.trim().length >= 3 &&
    region !== ''

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
