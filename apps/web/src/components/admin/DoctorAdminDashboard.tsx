import { useEffect, useState, useMemo, useRef } from 'react';
import { createLicenseVerificationLock } from '@/lib/admin/license-verification-lock';
import { ApiError, fetchApi } from '@/lib/api-client';
import { getDoctorCountry, type DoctorCountry } from '@/lib/admin/doctor-country';

type Profile = {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  sss_validation_status: 'valid' | 'pending_review' | 'rejected' | 'exempt' | null;
  sss_last_checked_at: string | null;
  especialidad_registrada: string | null;
  matricula_nacional: string | null;
};

type DoctorLicense = {
  id: string;
  license_number: string;
  license_type: string;
  province: string | null;
  uf_brazil: string | null;
  license_jurisdiction: string | null;
  status: 'active' | 'inactive' | 'suspended';
  cfm_validation_status: 'valid' | 'pending' | 'suspended' | 'cassado' | 'exempt' | null;
  cfm_last_checked_at: string | null;
  cfm_evidence_url: string | null;
  cfm_review_notes: string | null;
  cfm_reviewed_by: string | null;
  cfm_reviewed_at: string | null;
};

type Doctor = {
  id: string;
  user_id: string;
  specialty: string;
  subspecialty: string | null;
  license_number: string;
  care_country: string | null;
  license_type: string | null;
  uf_brazil: string | null;
  years_experience: number;
  consultation_fee: number;
  refeps_id: string | null;
  enrollment_entity: string | null;
  enrollment_jurisdiction: string | null;
  professional_address: string | null;
  payout_cbu: string | null;
  payout_alias: string | null;
  signature_image_url: string | null;
  stamp_image_url: string | null;
  bio: string | null;
  languages: string[] | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  profile: Profile;
  doctor_licenses?: DoctorLicense[];
  has_availability?: boolean;
  has_active_plan?: boolean;
};

function hasCfmReviewEvidence(license: DoctorLicense): boolean {
  return license.cfm_validation_status === 'valid'
    && Boolean(license.cfm_evidence_url)
    && Boolean(license.cfm_reviewed_by && license.cfm_reviewed_at && license.cfm_last_checked_at)
    && (license.cfm_review_notes?.trim().length ?? 0) >= 10;
}

type DeleteDoctorResponse = {
  success: true;
  mode: 'soft' | 'hard';
  message: string;
};


type DoctorCountryListProps = {
  country: DoctorCountry;
  doctors: Doctor[];
  selectedDoctorId: string | null;
  onSelect: (doctor: Doctor) => void;
};

function DoctorCountryList({ country, doctors, selectedDoctorId, onSelect }: DoctorCountryListProps) {
  const heading = country === 'AR'
    ? '🇦🇷 Médicos argentinos'
    : country === 'BR'
      ? '🇧🇷 Médicos brasileños'
      : '🌎 Médicos sin país identificado';
  const subtitle = country === 'AR'
    ? 'Matrículas MN / MP · SISA / REFEPS'
    : country === 'BR'
      ? 'Matrículas CRM · revisión CFM'
      : 'Revisar país y jurisdicción de matrícula';
  const validationHeading = country === 'BR' ? 'CFM' : country === 'AR' ? 'SISA' : 'Validación';

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={heading}>
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-slate-900">{heading}</h4>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700" aria-label={doctors.length + ' médicos'}>
          {doctors.length}
        </span>
      </header>

      {doctors.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          No hay médicos que coincidan con los filtros actuales.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[690px] divide-y divide-slate-100 text-sm">
            <thead className="bg-white text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Médico</th>
                <th className="px-4 py-3 text-left">Especialidad</th>
                <th className="px-4 py-3 text-left">Matrícula</th>
                <th className="px-4 py-3 text-left">{validationHeading}</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {doctors.map((doctor) => {
                const profile = doctor.profile || {} as Profile;
                const selected = selectedDoctorId === doctor.id;
                const crmLicense = (doctor.doctor_licenses ?? []).find((license) => license.license_type === 'CRM');
                let validationLabel = 'Sin verificar';
                let validationClass = 'border-slate-200 bg-slate-50 text-slate-600';

                if (country === 'BR') {
                  if (crmLicense && hasCfmReviewEvidence(crmLicense)) {
                    validationLabel = 'CFM validado';
                    validationClass = 'border-emerald-200 bg-emerald-50 text-emerald-700';
                  } else if (crmLicense?.cfm_validation_status === 'valid') {
                    validationLabel = 'Falta evidencia';
                    validationClass = 'border-amber-200 bg-amber-50 text-amber-700';
                  } else if (crmLicense?.cfm_validation_status === 'suspended' || crmLicense?.cfm_validation_status === 'cassado') {
                    validationLabel = 'Suspendido';
                    validationClass = 'border-red-200 bg-red-50 text-red-700';
                  } else if (crmLicense?.cfm_validation_status === 'exempt') {
                    validationLabel = 'Exceptuado';
                  } else {
                    validationLabel = 'Pendiente';
                    validationClass = 'border-amber-200 bg-amber-50 text-amber-700';
                  }
                } else if (country === 'AR') {
                  const sisaStatus = profile.sss_validation_status;
                  if (sisaStatus === 'valid') {
                    validationLabel = 'Validado';
                    validationClass = 'border-emerald-200 bg-emerald-50 text-emerald-700';
                  } else if (sisaStatus === 'pending_review') {
                    validationLabel = 'En revisión';
                    validationClass = 'border-amber-200 bg-amber-50 text-amber-700';
                  } else if (sisaStatus === 'rejected') {
                    validationLabel = 'Rechazado';
                    validationClass = 'border-red-200 bg-red-50 text-red-700';
                  } else if (sisaStatus === 'exempt') {
                    validationLabel = 'Exceptuado';
                  }
                } else {
                  validationLabel = 'País pendiente';
                }

                const jurisdiction = country === 'BR'
                  ? crmLicense?.uf_brazil || doctor.uf_brazil || crmLicense?.province || '-'
                  : doctor.enrollment_jurisdiction || '-';

                return (
                  <tr
                    key={doctor.id}
                    className={'cursor-pointer transition hover:bg-slate-50/80 ' + (selected ? 'bg-sky-50/70' : '')}
                    onClick={() => onSelect(doctor)}
                    aria-selected={selected}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                          {profile.avatar_url ? (
                            <img src={profile.avatar_url} alt={profile.first_name + ' avatar'} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-slate-500">{profile.first_name?.[0]}{profile.last_name?.[0]}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                            {profile.first_name} {profile.last_name}
                            {doctor.has_active_plan && (
                              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Médico con plan premium activo">★ Destacado</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{profile.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{doctor.specialty}</div>
                      {doctor.subspecialty && <div className="text-xs text-slate-500">{doctor.subspecialty}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{doctor.license_number || '-'}</div>
                      <div className="text-xs text-slate-500">{jurisdiction}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ' + validationClass}>
                        {validationLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={'inline-flex h-2 w-2 rounded-full ' + (doctor.active ? 'bg-emerald-500' : 'bg-slate-300')} />
                      <span className="ml-1.5 text-xs font-medium text-slate-600">{doctor.active ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onSelect(doctor)}
                        aria-label={'Abrir ficha de ' + (profile.first_name || 'médico')}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-500 hover:text-sky-700"
                      >
                        Ver ficha
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DoctorAdminDashboard() {
  const licenseVerificationLock = useRef(createLicenseVerificationLock());
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sisaFilter, setSisaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal / Side-over state
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isVerifyingSisa, setIsVerifyingSisa] = useState(false);
  const [cfmEvidenceFiles, setCfmEvidenceFiles] = useState<Record<string, File | null>>({});
  const [cfmReviewNotes, setCfmReviewNotes] = useState<Record<string, string>>({});
  const [reviewingCfmLicenseId, setReviewingCfmLicenseId] = useState<string | null>(null);

  // Form states for New / Edit doctor
  const [editForm, setEditForm] = useState<Partial<Doctor & Profile & {
    firstName: string;
    lastName: string;
    phone: string | null;
    role: string;
    matriculaNacional: string;
    especialidadRegistrada: string;
    sssValidationStatus: string;
  }>>({});
  const [newForm, setNewForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    specialty: '',
    subspecialty: '',
    licenseNumber: '',
    yearsExperience: '0',
    consultationFee: '0',
    enrollmentEntity: '',
    enrollmentJurisdiction: '',
    professionalAddress: '',
    payoutCbu: '',
    payoutAlias: '',
    bio: '',
    languages: '',
    sssValidationStatus: 'pending_review',
    matriculaNacional: '',
    especialidadRegistrada: '',
    active: true,
  });

  // Load doctors on init
  async function fetchDoctors() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<Doctor[]>('/api/admin/doctors');
      if (!Array.isArray(data)) {
        throw new Error('La respuesta del servidor no tiene el formato esperado.');
      }
      setDoctors(data);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'No autorizado. Debes ser administrador para acceder.'
          : err instanceof Error
            ? err.message
            : 'Error inesperado al conectar con el servidor.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchDoctors();
  }, []);

  // Filtered doctors list
  const filteredDoctors = useMemo(() => {
    if (!Array.isArray(doctors)) return [];
    return doctors.filter((doc) => {
      const p = doc.profile || {} as Profile;
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const email = (p.email || '').toLowerCase();
      const spec = (doc.specialty || '').toLowerCase();
      const lic = (doc.license_number || '').toLowerCase();
      const query = searchQuery.toLowerCase();

      // Search matches
      const matchesSearch =
        fullName.includes(query) ||
        email.includes(query) ||
        spec.includes(query) ||
        lic.includes(query);

      // SISA matches
      const matchesSisa =
        sisaFilter === 'all' ||
        (sisaFilter === 'null' && p.sss_validation_status === null) ||
        p.sss_validation_status === sisaFilter;

      // Status matches
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && doc.active) ||
        (statusFilter === 'inactive' && !doc.active);

      return matchesSearch && matchesSisa && matchesStatus;
    });
  }, [doctors, searchQuery, sisaFilter, statusFilter]);

  const countryGroups = useMemo(() => ({
    AR: filteredDoctors.filter((doctor) => getDoctorCountry(doctor) === 'AR'),
    BR: filteredDoctors.filter((doctor) => getDoctorCountry(doctor) === 'BR'),
    UNKNOWN: filteredDoctors.filter((doctor) => getDoctorCountry(doctor) === 'UNKNOWN'),
  }), [filteredDoctors]);

  // Statistics calculated in real-time
  const stats = useMemo(() => {
    if (!Array.isArray(doctors)) {
      return { total: 0, active: 0, pendingSisa: 0, validSisa: 0 };
    }
    const total = doctors.length;
    const active = doctors.filter((d) => d.active).length;
    const pendingSisa = doctors.filter((d) => d.profile?.sss_validation_status === 'pending_review').length;
    const validSisa = doctors.filter((d) => d.profile?.sss_validation_status === 'valid').length;
    return { total, active, pendingSisa, validSisa };
  }, [doctors]);

  // Open Edit Side-Over
  function handleEditClick(doctor: Doctor) {
    if (licenseVerificationLock.current.isRunning() || isSaving) return;
    setSelectedDoctor(doctor);
    const p = doctor.profile || {} as Profile;
    setEditForm({
      ...doctor,
      firstName: p.first_name,
      lastName: p.last_name,
      phone: p.phone,
      role: p.role,
      sssValidationStatus: p.sss_validation_status || 'pending_review',
      matriculaNacional: p.matricula_nacional || '',
      especialidadRegistrada: p.especialidad_registrada || '',
    });
    setSuccessMessage(null);
  }

  // Handle Edit Input Change
  function handleEditChange(key: string, value: string | number | boolean | null) {
    if (licenseVerificationLock.current.isRunning()) return;
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  // Submit Edit Doctor
  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoctor || licenseVerificationLock.current.isRunning()) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await fetchApi<Doctor>(`/api/admin/doctors/${selectedDoctor.id}`, {
        method: 'PUT',
        body: editForm,
      });

      setSuccessMessage('Información médica actualizada con éxito.');
      
      // Update doctors list in-place
      setDoctors((prev) =>
        prev.map((d) => (d.id === selectedDoctor.id ? data : d))
      );
      
      // Refresh current sidebar view
      setSelectedDoctor(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  }

  // Perform live verification against national SISA/REFEPS registry
  async function handleVerifyLiveLicense(persist: boolean = true) {
    if (!selectedDoctor || isSaving || !licenseVerificationLock.current.start()) return;

    setIsVerifyingSisa(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await fetchApi<{
        doctorId: string;
        userId: string;
        matricula: string;
        fullName: string;
        isValid: boolean;
        status: 'valid' | 'rejected' | 'pending_review';
        checkedAt: string;
        source: string;
        practitionerId?: string;
        registeredSpecialty?: string | null;
        province?: string;
      }>('/api/admin/doctors/license-verify-live', {
        method: 'POST',
        body: {
          doctorId: selectedDoctor.id,
          matricula: editForm.license_number ?? selectedDoctor.license_number,
          jurisdiction: editForm.enrollment_jurisdiction ?? selectedDoctor.enrollment_jurisdiction ?? undefined,
          persist,
        },
      });

      setSuccessMessage(
        persist
          ? `Verificación y aprobación finalizada: ${
              data.isValid ? 'Matrícula activa en REFEPS y guardada' : 'Matrícula no encontrada/suspendida y guardada'
            }.`
          : `Consulta SISA completada: ${
              data.isValid ? 'Matrícula activa en REFEPS' : 'Matrícula no encontrada o suspendida'
            }. Se cargaron los datos en el formulario (debes Guardar la Ficha).`
      );

      // Update local form state (always needed for both flows to hydrate inputs)
      setEditForm((prev) => ({
        ...prev,
        sssValidationStatus: data.status,
        matriculaNacional: data.matricula,
        license_number: data.matricula,
        refeps_id: data.practitionerId ?? prev.refeps_id,
        enrollment_jurisdiction: data.province ?? prev.enrollment_jurisdiction,
        especialidadRegistrada: data.registeredSpecialty ?? prev.especialidadRegistrada,
      }));

      if (persist) {
        // Update in doctors list
        setDoctors((prev) =>
          prev.map((d) =>
            d.id === selectedDoctor.id
              ? {
                  ...d,
                  license_number: data.matricula,
                  refeps_id: data.practitionerId ?? d.refeps_id,
                  enrollment_jurisdiction: data.province ?? d.enrollment_jurisdiction,
                  profile: {
                    ...d.profile,
                    sss_validation_status: data.status,
                    sss_last_checked_at: data.checkedAt,
                    matricula_nacional: data.matricula,
                    especialidad_registrada: data.registeredSpecialty ?? d.profile?.especialidad_registrada,
                  },
                }
              : d
          )
        );

        // Refresh selection
        setSelectedDoctor((prev) =>
          prev
            ? {
                ...prev,
                license_number: data.matricula,
                refeps_id: data.practitionerId ?? prev.refeps_id,
                enrollment_jurisdiction: data.province ?? prev.enrollment_jurisdiction,
                profile: {
                  ...prev.profile,
                  sss_validation_status: data.status,
                  sss_last_checked_at: data.checkedAt,
                  matricula_nacional: data.matricula,
                  especialidad_registrada: data.registeredSpecialty ?? prev.profile?.especialidad_registrada,
                },
              }
            : null
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fallo en la verificación live contra SISA.');
    } finally {
      licenseVerificationLock.current.finish();
      setIsVerifyingSisa(false);
    }
  }

  async function handleCfmManualReview(license: DoctorLicense, status: 'valid' | 'pending') {
    if (!selectedDoctor || reviewingCfmLicenseId) return;

    const evidence = cfmEvidenceFiles[license.id] ?? null;
    const notes = (cfmReviewNotes[license.id] ?? '').trim();
    if (notes.length < 10) {
      setError('Escribe una nota de revisión de al menos 10 caracteres.');
      return;
    }
    if (status === 'valid' && !evidence) {
      setError('Adjunta el comprobante oficial o la documentación comprobada para aprobar.');
      return;
    }

    setReviewingCfmLicenseId(license.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append('licenseId', license.id);
      formData.append('status', status);
      formData.append('reviewNotes', notes);
      if (evidence) formData.append('evidence', evidence);

      const response = await fetch('/api/admin/doctors/cfm-review', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload?.data?.license) {
        const message = payload?.error?.message ?? payload?.error ?? `No se pudo guardar la revisión (HTTP ${response.status}).`;
        throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
      }

      const updatedLicense = payload.data.license as DoctorLicense;
      const updateDoctor = (doctor: Doctor): Doctor => ({
        ...doctor,
        doctor_licenses: (doctor.doctor_licenses ?? []).map((item) =>
          item.id === updatedLicense.id ? updatedLicense : item,
        ),
      });
      setDoctors((prev) => prev.map((doctor) => doctor.id === selectedDoctor.id ? updateDoctor(doctor) : doctor));
      setSelectedDoctor((prev) => prev ? updateDoctor(prev) : null);
      setCfmEvidenceFiles((prev) => ({ ...prev, [license.id]: null }));
      setCfmReviewNotes((prev) => ({ ...prev, [license.id]: '' }));
      setSuccessMessage(status === 'valid'
        ? 'Matrícula CRM aprobada con evidencia y revisión registrada.'
        : 'Matrícula CRM quedó pendiente; no habilita el despacho clínico.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la revisión manual CFM.');
    } finally {
      setReviewingCfmLicenseId(null);
    }
  }

  // Handle Soft / Hard Delete
  async function handleDeleteDoctor(mode: 'soft' | 'hard') {
    if (!selectedDoctor || licenseVerificationLock.current.isRunning()) return;

    const confirmMsg =
      mode === 'hard'
        ? '¿Estás absolutamente seguro de eliminar permanentemente a este médico de la base de datos? Esta acción intentará un borrado físico y demotará su cuenta.'
        : '¿Confirmas que deseas desactivar a este médico? No podrá atender llamadas ni aparecer en las búsquedas, pero se conservará su historial clínico.';

    if (!window.confirm(confirmMsg)) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await fetchApi<DeleteDoctorResponse>(`/api/admin/doctors/${selectedDoctor.id}?mode=${mode}`, {
        method: 'DELETE',
      });

      setSuccessMessage(data.message);

      if (mode === 'hard' && data.mode === 'hard') {
        // Remove from list entirely if physically deleted
        setDoctors((prev) => prev.filter((d) => d.id !== selectedDoctor.id));
        setSelectedDoctor(null);
      } else {
        // Update to inactive in local list
        setDoctors((prev) =>
          prev.map((d) =>
            d.id === selectedDoctor.id ? { ...d, active: false, profile: { ...d.profile, role: data.mode === 'hard' ? 'patient' : d.profile.role } } : d
          )
        );
        // Refresh sidebar
        setSelectedDoctor((prev) => prev ? { ...prev, active: false } : null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al dar de baja el médico.');
    } finally {
      setIsSaving(false);
    }
  }

  // Handle New Input Change
  function handleNewChange(key: string, value: string | number | boolean | null) {
    setNewForm((prev) => ({ ...prev, [key]: value }));
  }

  // Submit Register New Doctor
  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.email) {
      alert('El email es obligatorio');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const data = await fetchApi<Doctor>('/api/admin/doctors', {
        method: 'POST',
        body: newForm,
      });

      setDoctors((prev) => [data, ...prev]);
      setIsNewModalOpen(false);
      
      // Reset Form
      setNewForm({
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        specialty: '',
        subspecialty: '',
        licenseNumber: '',
        yearsExperience: '0',
        consultationFee: '0',
        enrollmentEntity: '',
        enrollmentJurisdiction: '',
        professionalAddress: '',
        payoutCbu: '',
        payoutAlias: '',
        bio: '',
        languages: '',
        sssValidationStatus: 'pending_review',
        matriculaNacional: '',
        especialidadRegistrada: '',
        active: true,
      });

      alert('Médico registrado y dado de alta con éxito.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el médico.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 📊 KPI Cards Section */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Médicos Registrados</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{stats.total}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Total</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cuentas médicas activas (no implica habilitación)</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-slate-900">{stats.active}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}%` : '0%'}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Validación SISA Pendiente</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-amber-600">{stats.pendingSisa}</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Revisión</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Validación SISA registrada</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-emerald-600">{stats.validSisa}</span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Validación AR</span>
          </div>
        </div>
      </section>

      {/* 🔍 Search & Filters Bar */}
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex-1 max-w-md">
          <label htmlFor="search" className="sr-only">Buscar médico</label>
          <div className="relative">
            <input
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, especialidad, matrícula o email..."
              className="w-full h-10 rounded-lg border border-slate-300 pl-10 pr-4 text-sm placeholder-slate-400 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="sisa-filter" className="text-xs font-bold uppercase text-slate-500">SISA</label>
            <select
              id="sisa-filter"
              value={sisaFilter}
              onChange={(e) => setSisaFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">Todos los estados</option>
              <option value="valid">Validados (Valid)</option>
              <option value="pending_review">Pendientes (Pending Review)</option>
              <option value="rejected">Rechazados (Rejected)</option>
              <option value="exempt">Exceptuados (Exempt)</option>
              <option value="null">Sin verificar</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-xs font-bold uppercase text-slate-500">Estado</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow transition hover:bg-sky-700 hover:shadow-md"
          >
            Registrar Médico
          </button>
        </div>
      </section>

      {/* ⚠️ Messages */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 shadow-sm">
          <div className="flex">
            <svg className="mr-3 h-5 w-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 shadow-sm">
          <div className="flex">
            <svg className="mr-3 h-5 w-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{successMessage}</span>
          </div>
        </div>
      )}

      {/* 📋 Doctors List & Detail Slide-Over Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Country-separated doctor directories */}
        <section className={'lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 shadow-sm ' + (selectedDoctor ? 'hidden lg:block' : '')}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
            <div>
              <h3 className="font-semibold text-slate-900">Directorio médico por país</h3>
              <p className="mt-0.5 text-xs text-slate-500">Argentina y Brasil se administran en listas independientes.</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {filteredDoctors.length} en vista
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-sky-600"></div>
              <p className="mt-4 text-sm font-medium">Cargando base médica en tiempo real...</p>
            </div>
          ) : filteredDoctors.length === 0 ? (
            <div className="py-20 text-center text-slate-500">
              <h4 className="text-lg font-medium text-slate-900">Ningún médico coincide</h4>
              <p className="mt-2 text-sm text-slate-500">Prueba ajustando los filtros de búsqueda o el estado de validación.</p>
            </div>
          ) : (
            <div className="grid gap-4 p-4 xl:grid-cols-2">
              <DoctorCountryList
                country="AR"
                doctors={countryGroups.AR}
                selectedDoctorId={selectedDoctor?.id ?? null}
                onSelect={handleEditClick}
              />
              <DoctorCountryList
                country="BR"
                doctors={countryGroups.BR}
                selectedDoctorId={selectedDoctor?.id ?? null}
                onSelect={handleEditClick}
              />
              {countryGroups.UNKNOWN.length > 0 && (
                <div className="xl:col-span-2">
                  <DoctorCountryList
                    country="UNKNOWN"
                    doctors={countryGroups.UNKNOWN}
                    selectedDoctorId={selectedDoctor?.id ?? null}
                    onSelect={handleEditClick}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Selected Doctor detail edit panel (Side-Over styled) */}
        {selectedDoctor && (
          <section className="lg:col-span-1 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden max-h-[85vh] sticky top-8">
            <div className="border-b border-slate-200 px-5 py-4 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-semibold text-slate-800">Control Médico / Ficha</h3>
              <button
                disabled={isVerifyingSisa || isSaving}
                onClick={() => {
                  if (!licenseVerificationLock.current.isRunning()) setSelectedDoctor(null);
                }}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
                <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                  {selectedDoctor.profile?.avatar_url ? (
                    <img src={selectedDoctor.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-slate-500">
                      {selectedDoctor.profile?.first_name?.[0]}{selectedDoctor.profile?.last_name?.[0]}
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                    Dr/a. {selectedDoctor.profile?.first_name} {selectedDoctor.profile?.last_name}
                    {(selectedDoctor.profile?.sss_validation_status === 'valid' || selectedDoctor.profile?.sss_validation_status === 'exempt') && selectedDoctor.has_availability && (
                      <svg className="h-4.5 w-4.5 text-emerald-600 shrink-0 inline-block align-middle" viewBox="0 0 24 24" fill="currentColor">
                        <title>Profesional verificado en SISA/REFEPS y con agenda activa</title>
                        <path d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12zm-13 5l-4-4 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                    )}
                    {selectedDoctor.has_active_plan && (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10" title="Médico con plan premium activo">
                        ★ Destacado
                      </span>
                    )}
                    {selectedDoctor.signature_image_url && selectedDoctor.stamp_image_url ? (
                      <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/10" title="Firma y Sello digital cargados correctamente para emitir recetas">
                        ✓ Receta Digital
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10" title="Falta subir firma y/o sello digital para habilitar emisión de recetas">
                        ⚠ Sin Firma/Sello
                      </span>
                    )}
                  </h4>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    ID: {selectedDoctor.id.slice(0, 8)} | Rol: {selectedDoctor.profile?.role}
                  </p>
                  <p className="text-xs text-slate-400">Creado el {new Date(selectedDoctor.created_at).toLocaleDateString()}</p>
                </div>
              </div>

{getDoctorCountry(selectedDoctor) === 'BR' && (
              <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 space-y-4">
                <div>
                  <h5 className="text-sm font-bold text-slate-900">Revisión manual de matrículas brasileñas (CFM)</h5>
                  <p className="mt-1 text-xs text-slate-600">
                    El atendiente consulta el registro oficial o comprueba la documentación y adjunta el comprobante antes de aprobar.
                  </p>
                </div>
                {(selectedDoctor.doctor_licenses ?? []).filter((license) => license.license_type === 'CRM').length === 0 ? (
                  <p className="rounded-lg bg-white p-3 text-xs text-slate-600">
                    Este profesional todavía no tiene una matrícula CRM cargada para revisar.
                  </p>
                ) : (
                  (selectedDoctor.doctor_licenses ?? [])
                    .filter((license) => license.license_type === 'CRM')
                    .map((license) => (
                      <div key={license.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">CRM {license.license_number} · {license.uf_brazil ?? license.province ?? 'UF não informada'}</p>
                            <p className="text-xs text-slate-500">
                              {hasCfmReviewEvidence(license) ? 'Aprobada con evidencia' : license.cfm_validation_status === 'valid' ? 'Aprobación previa sin evidencia; requiere revisión' : license.cfm_validation_status === 'suspended' ? 'Suspendida' : license.cfm_validation_status === 'cassado' ? 'Cancelada' : 'Pendiente de revisión'}
                              {license.cfm_reviewed_at ? ` · revisada ${new Date(license.cfm_reviewed_at).toLocaleString()}` : ''}
                            </p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${hasCfmReviewEvidence(license) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {hasCfmReviewEvidence(license) ? 'CFM validado' : license.cfm_validation_status === 'valid' ? 'Falta evidencia' : 'CFM pendiente'}
                          </span>
                        </div>

                        {license.cfm_evidence_url ? (
                          <a href={license.cfm_evidence_url} target="_blank" rel="noreferrer" className="inline-flex text-xs font-semibold text-sky-700 underline">
                            Ver comprobante guardado
                          </a>
                        ) : (
                          <p className="text-xs text-slate-500">No hay comprobante de revisión adjunto.</p>
                        )}
                        {license.cfm_review_notes && (
                          <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">{license.cfm_review_notes}</p>
                        )}

                        <div>
                          <label htmlFor={`cfm-evidence-${license.id}`} className="block text-xs font-semibold text-slate-700">
                            Comprobante oficial o documento revisado (PDF, JPG o PNG; máximo 10 MB)
                          </label>
                          <input
                            id={`cfm-evidence-${license.id}`}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            onChange={(event) => setCfmEvidenceFiles((prev) => ({ ...prev, [license.id]: event.target.files?.[0] ?? null }))}
                            className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700"
                          />
                        </div>
                        <div>
                          <label htmlFor={`cfm-notes-${license.id}`} className="block text-xs font-semibold text-slate-700">
                            Nota del atendiente (fuente consultada, fecha y resultado)
                          </label>
                          <textarea
                            id={`cfm-notes-${license.id}`}
                            value={cfmReviewNotes[license.id] ?? ''}
                            onChange={(event) => setCfmReviewNotes((prev) => ({ ...prev, [license.id]: event.target.value }))}
                            rows={2}
                            maxLength={2000}
                            placeholder="Ej.: consulta pública CFM, CRM y UF coinciden con el documento presentado..."
                            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-700 outline-none focus:border-sky-500"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={reviewingCfmLicenseId !== null}
                            onClick={() => void handleCfmManualReview(license, 'valid')}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {reviewingCfmLicenseId === license.id ? 'Guardando...' : 'Aprobar con evidencia'}
                          </button>
                          <button
                            type="button"
                            disabled={reviewingCfmLicenseId !== null}
                            onClick={() => void handleCfmManualReview(license, 'pending')}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Mantener pendiente
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </section>
              )}

              <form onSubmit={handleEditSubmit} className="space-y-5 text-slate-700">
                {/* 🧑 Info Personal */}
                <fieldset disabled={isVerifyingSisa} className="space-y-3">
                  <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Información Personal</legend>
                  
                  <div>
                    <label htmlFor="edit-firstName" className="block text-xs font-semibold text-slate-600">Nombre</label>
                    <input
                      id="edit-firstName"
                      type="text"
                      value={editForm.firstName || ''}
                      onChange={(e) => handleEditChange('firstName', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-lastName" className="block text-xs font-semibold text-slate-600">Apellido</label>
                    <input
                      id="edit-lastName"
                      type="text"
                      value={editForm.lastName || ''}
                      onChange={(e) => handleEditChange('lastName', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-phone" className="block text-xs font-semibold text-slate-600">Teléfono</label>
                    <input
                      id="edit-phone"
                      type="text"
                      value={editForm.phone || ''}
                      onChange={(e) => handleEditChange('phone', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-role" className="block text-xs font-semibold text-slate-600">Rol de Sistema</label>
                    <select
                      id="edit-role"
                      value={editForm.role || 'doctor'}
                      onChange={(e) => handleEditChange('role', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    >
                      <option value="doctor">Médico (Doctor)</option>
                      <option value="admin">Administrador</option>
                      <option value="patient">Paciente (Patient)</option>
                    </select>
                  </div>
                </fieldset>

                {/* 🩺 Especialidad & Experiencia */}
                <fieldset disabled={isVerifyingSisa} className="space-y-3 pt-2 border-t border-slate-100">
                  <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Especialidad & Clínica</legend>
                  
                  <div>
                    <label htmlFor="edit-specialty" className="block text-xs font-semibold text-slate-600">Especialidad Primaria</label>
                    <input
                      id="edit-specialty"
                      type="text"
                      value={editForm.specialty || ''}
                      onChange={(e) => handleEditChange('specialty', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-subspecialty" className="block text-xs font-semibold text-slate-600">Subespecialidad / Foco</label>
                    <input
                      id="edit-subspecialty"
                      type="text"
                      value={editForm.subspecialty || ''}
                      onChange={(e) => handleEditChange('subspecialty', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="edit-experience" className="block text-xs font-semibold text-slate-600">Años de Exp.</label>
                      <input
                        id="edit-experience"
                        type="number"
                        value={editForm.years_experience || 0}
                        onChange={(e) => handleEditChange('years_experience', e.target.value)}
                        className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit-fee" className="block text-xs font-semibold text-slate-600">Honorario ($)</label>
                      <input
                        id="edit-fee"
                        type="number"
                        value={editForm.consultation_fee || 0}
                        onChange={(e) => handleEditChange('consultation_fee', e.target.value)}
                        className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="edit-bio" className="block text-xs font-semibold text-slate-600">Biografía Profesional</label>
                    <textarea
                      id="edit-bio"
                      value={editForm.bio || ''}
                      onChange={(e) => handleEditChange('bio', e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-sky-500 outline-none resize-none"
                    />
                  </div>
                </fieldset>

                {/* 🛡️ SISA / REFEPS Validation (Crucial para Receta Electrónica) */}
                <fieldset disabled={isVerifyingSisa} className="space-y-3 pt-2 border-t border-slate-100">
                  <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Validación SISA / REFEPS</legend>
                  
                  <div>
                    <label htmlFor="edit-sisaStatus" className="block text-xs font-semibold text-slate-600">Estado de Validación</label>
                    <select
                      id="edit-sisaStatus"
                      value={editForm.sssValidationStatus || 'pending_review'}
                      onChange={(e) => handleEditChange('sssValidationStatus', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    >
                      <option value="pending_review">En Revisión (Pending Review)</option>
                      <option value="valid">Validado (Valid) - Habilita Receta</option>
                      <option value="rejected">Rechazado (Rejected)</option>
                      <option value="exempt">Exceptuado (Exempt)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isVerifyingSisa || isSaving || !editForm.license_number}
                      onClick={() => handleVerifyLiveLicense(false)}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isVerifyingSisa ? 'Consultando...' : 'Solo Verificar'}
                    </button>
                    <button
                      type="button"
                      disabled={isVerifyingSisa || isSaving || !editForm.license_number}
                      onClick={() => handleVerifyLiveLicense(true)}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-sky-300 bg-sky-50 px-3 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"
                    >
                      {isVerifyingSisa ? 'Verificando...' : 'Verificar y Autoguardar'}
                    </button>
                  </div>

                  <div>
                    <label htmlFor="edit-nationalLicense" className="block text-xs font-semibold text-slate-600">Matrícula Nacional Oficial</label>
                    <input
                      id="edit-nationalLicense"
                      type="text"
                      value={editForm.matriculaNacional || ''}
                      onChange={(e) => handleEditChange('matriculaNacional', e.target.value)}
                      placeholder="Ingrese matrícula validada"
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-registeredSpecialty" className="block text-xs font-semibold text-slate-600">Especialidad Registrada en REDES</label>
                    <input
                      id="edit-registeredSpecialty"
                      type="text"
                      value={editForm.especialidadRegistrada || ''}
                      onChange={(e) => handleEditChange('especialidadRegistrada', e.target.value)}
                      placeholder="Ingrese especialidad del sistema nacional"
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </fieldset>

                {/* 💼 Matrícula & Domicilio */}
                <fieldset disabled={isVerifyingSisa} className="space-y-3 pt-2 border-t border-slate-100">
                  <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Matrícula Provincial & Domicilio</legend>
                  
                  <div>
                    <label htmlFor="edit-license" className="block text-xs font-semibold text-slate-600">Número de Matrícula Provincial</label>
                    <input
                      id="edit-license"
                      type="text"
                      value={editForm.license_number || ''}
                      onChange={(e) => handleEditChange('license_number', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-entity" className="block text-xs font-semibold text-slate-600">Entidad Emisora de Matrícula</label>
                    <input
                      id="edit-entity"
                      type="text"
                      value={editForm.enrollment_entity || ''}
                      onChange={(e) => handleEditChange('enrollment_entity', e.target.value)}
                      placeholder="Ej: Colegio Médico"
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-jurisdiction" className="block text-xs font-semibold text-slate-600">Jurisdicción de Matrícula</label>
                    <input
                      id="edit-jurisdiction"
                      type="text"
                      value={editForm.enrollment_jurisdiction || ''}
                      onChange={(e) => handleEditChange('enrollment_jurisdiction', e.target.value)}
                      placeholder="Ej: Buenos Aires, CABA"
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-address" className="block text-xs font-semibold text-slate-600">Dirección Profesional / Consultorio</label>
                    <input
                      id="edit-address"
                      type="text"
                      value={editForm.professional_address || ''}
                      onChange={(e) => handleEditChange('professional_address', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </fieldset>

                {/* 💳 Datos de Cobros */}
                <fieldset disabled={isVerifyingSisa} className="space-y-3 pt-2 border-t border-slate-100">
                  <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Datos Financieros (Payouts)</legend>
                  
                  <div>
                    <label htmlFor="edit-cbu" className="block text-xs font-semibold text-slate-600">CBU / CVU Bancario</label>
                    <input
                      id="edit-cbu"
                      type="text"
                      value={editForm.payout_cbu || ''}
                      onChange={(e) => handleEditChange('payout_cbu', e.target.value)}
                      maxLength={22}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="edit-alias" className="block text-xs font-semibold text-slate-600">Alias de Cuenta</label>
                    <input
                      id="edit-alias"
                      type="text"
                      value={editForm.payout_alias || ''}
                      onChange={(e) => handleEditChange('payout_alias', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none font-mono"
                    />
                  </div>
                </fieldset>

                {/* ⚙️ Estado de Cuenta */}
                <fieldset disabled={isVerifyingSisa} className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="block text-sm font-semibold text-slate-800">Cuenta Médica Activa</span>
                    <span className="text-xs text-slate-500">Determina si puede operar en la plataforma.</span>
                  </div>
                  <label htmlFor="edit-active" className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="edit-active"
                      type="checkbox"
                      checked={!!editForm.active}
                      onChange={(e) => handleEditChange('active', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </fieldset>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSaving || isVerifyingSisa}
                  className="w-full h-10 inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  {isSaving ? 'Guardando cambios...' : 'Guardar Ficha Médica'}
                </button>
              </form>

              {/* 🛑 Delete Actions Section */}
              <div className="pt-5 border-t border-red-100 space-y-3">
                <h5 className="text-xs font-bold uppercase tracking-wider text-red-600">Acciones de Baja e Integridad</h5>
                
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isSaving || isVerifyingSisa || !selectedDoctor.active}
                    onClick={() => void handleDeleteDoctor('soft')}
                    className="h-9 inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Desactivar Médico
                  </button>

                  <button
                    type="button"
                    disabled={isSaving || isVerifyingSisa}
                    onClick={() => void handleDeleteDoctor('hard')}
                    className="h-9 inline-flex items-center justify-center rounded-lg bg-red-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                  >
                    Eliminar Físico
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  La desactivación (Soft Delete) es segura e instantánea. La eliminación física (Hard Delete) intentará eliminar de raíz el registro y degradará el perfil del usuario.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ➕ Modal: Register New Doctor */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <header className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-semibold text-slate-800 text-lg">Registrar y Dar de Alta un Médico</h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <form onSubmit={handleNewSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-700">
              {/* 🧑 Personal & Auth creation */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1">Usuario y Cuenta</h4>
                
                <div>
                  <label htmlFor="new-email" className="block text-xs font-semibold text-slate-600">Email de Acceso *</label>
                  <input
                    id="new-email"
                    type="email"
                    required
                    value={newForm.email}
                    onChange={(e) => handleNewChange('email', e.target.value)}
                    placeholder="doctor@autamedica.com"
                    className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                  />
                  <p className="mt-1 text-[10px] text-slate-400 leading-normal">
                    Si el email no está registrado, se creará un usuario de Supabase Auth automáticamente con contraseña temporal.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="new-firstName" className="block text-xs font-semibold text-slate-600">Nombre</label>
                    <input
                      id="new-firstName"
                      type="text"
                      value={newForm.firstName}
                      onChange={(e) => handleNewChange('firstName', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-lastName" className="block text-xs font-semibold text-slate-600">Apellido</label>
                    <input
                      id="new-lastName"
                      type="text"
                      value={newForm.lastName}
                      onChange={(e) => handleNewChange('lastName', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="new-phone" className="block text-xs font-semibold text-slate-600">Teléfono</label>
                  <input
                    id="new-phone"
                    type="text"
                    value={newForm.phone}
                    onChange={(e) => handleNewChange('phone', e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                  />
                </div>
              </div>

              {/* 🩺 Speciality & clinical info */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1">Especialidad & Matrícula</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="new-specialty" className="block text-xs font-semibold text-slate-600">Especialidad Primaria</label>
                    <input
                      id="new-specialty"
                      type="text"
                      value={newForm.specialty}
                      onChange={(e) => handleNewChange('specialty', e.target.value)}
                      placeholder="Ej: Cardiología"
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-subspecialty" className="block text-xs font-semibold text-slate-600">Subespecialidad / Foco</label>
                    <input
                      id="new-subspecialty"
                      type="text"
                      value={newForm.subspecialty}
                      onChange={(e) => handleNewChange('subspecialty', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="new-license" className="block text-xs font-semibold text-slate-600">Nº Matrícula Provincial</label>
                    <input
                      id="new-license"
                      type="text"
                      value={newForm.licenseNumber}
                      onChange={(e) => handleNewChange('licenseNumber', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-experience" className="block text-xs font-semibold text-slate-600">Años Experiencia</label>
                    <input
                      id="new-experience"
                      type="number"
                      value={newForm.yearsExperience}
                      onChange={(e) => handleNewChange('yearsExperience', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-fee" className="block text-xs font-semibold text-slate-600">Honorario Consulta ($)</label>
                    <input
                      id="new-fee"
                      type="number"
                      value={newForm.consultationFee}
                      onChange={(e) => handleNewChange('consultationFee', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="new-entity" className="block text-xs font-semibold text-slate-600">Entidad de Matrícula</label>
                    <input
                      id="new-entity"
                      type="text"
                      value={newForm.enrollmentEntity}
                      onChange={(e) => handleNewChange('enrollmentEntity', e.target.value)}
                      placeholder="Ej: Colegio de Médicos"
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-jurisdiction" className="block text-xs font-semibold text-slate-600">Jurisdicción</label>
                    <input
                      id="new-jurisdiction"
                      type="text"
                      value={newForm.enrollmentJurisdiction}
                      onChange={(e) => handleNewChange('enrollmentJurisdiction', e.target.value)}
                      placeholder="Ej: CABA"
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="new-address" className="block text-xs font-semibold text-slate-600">Domicilio Profesional</label>
                  <input
                    id="new-address"
                    type="text"
                    value={newForm.professionalAddress}
                    onChange={(e) => handleNewChange('professionalAddress', e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                  />
                </div>
              </div>

              {/* 🛡️ SISA Info */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1">Validación SISA / Nacional</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="new-sisaStatus" className="block text-xs font-semibold text-slate-600">Validación Inicial</label>
                    <select
                      id="new-sisaStatus"
                      value={newForm.sssValidationStatus}
                      onChange={(e) => handleNewChange('sssValidationStatus', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    >
                      <option value="pending_review">En Revisión (Pending)</option>
                      <option value="valid">Validado (Valid)</option>
                      <option value="exempt">Exceptuado (Exempt)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="new-nationalLicense" className="block text-xs font-semibold text-slate-600">Matrícula Nacional</label>
                    <input
                      id="new-nationalLicense"
                      type="text"
                      value={newForm.matriculaNacional}
                      onChange={(e) => handleNewChange('matriculaNacional', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 💳 Banking details & active state */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1">Cobros (Payouts)</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="new-cbu" className="block text-xs font-semibold text-slate-600">CBU / CVU</label>
                    <input
                      id="new-cbu"
                      type="text"
                      value={newForm.payoutCbu}
                      onChange={(e) => handleNewChange('payoutCbu', e.target.value)}
                      maxLength={22}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="new-alias" className="block text-xs font-semibold text-slate-600">Alias de Cuenta</label>
                    <input
                      id="new-alias"
                      type="text"
                      value={newForm.payoutAlias}
                      onChange={(e) => handleNewChange('payoutAlias', e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-3 text-sm focus:border-sky-500 outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              <footer className="border-t border-slate-200 pt-4 flex items-center justify-end gap-3 bg-white">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  {isSaving ? 'Registrando...' : 'Dar de Alta Médico'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

