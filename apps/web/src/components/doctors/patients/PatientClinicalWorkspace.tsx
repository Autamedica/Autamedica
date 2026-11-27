'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardPlus,
  FileText,
  HeartPulse,
  Loader2,
  Pill,
  Plus,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type {
  PrescriptionRenewalInfo,
  VitalAlert,
} from '@/lib/doctors/services/patient-clinical-workspace';

interface VitalRow {
  id: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  heart_rate: number | null;
  temperature: number | null;
  oxygen_saturation: number | null;
  respiratory_rate: number | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  pain_scale: number | null;
  notes: string | null;
  measured_at: string;
}

interface FollowupRow {
  id: string;
  channel: string;
  message: string;
  scheduled_for: string;
  status: string;
  sent_at: string | null;
}

interface MedicalNoteRow {
  id: string;
  title: string;
  type: string;
  dateRecorded?: string | null;
  date_recorded?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  content?: Record<string, unknown> | string | null;
}

interface PatientClinicalWorkspaceProps {
  patientId: string;
  isBrazilianDoctor: boolean;
}

type WorkspaceSection = 'prescriptions' | 'evolutions' | 'vitals' | 'followups';

function formatShortDate(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PatientClinicalWorkspace({
  patientId,
  isBrazilianDoctor,
}: PatientClinicalWorkspaceProps) {
  const locale = isBrazilianDoctor ? 'pt-BR' : 'es-AR';
  const [section, setSection] = useState<WorkspaceSection>('prescriptions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prescriptions, setPrescriptions] = useState<PrescriptionRenewalInfo[]>([]);
  const [notes, setNotes] = useState<MedicalNoteRow[]>([]);
  const [vitals, setVitals] = useState<VitalRow[]>([]);
  const [vitalAlerts, setVitalAlerts] = useState<VitalAlert[]>([]);
  const [followups, setFollowups] = useState<FollowupRow[]>([]);

  // Inline creation state — Evolution / SOAP
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteKind, setNoteKind] = useState<'evolution' | 'soap'>('evolution');
  const [noteSummary, setNoteSummary] = useState('');
  const [noteDiagnosis, setNoteDiagnosis] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Inline creation state — Vital signs
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [hr, setHr] = useState('');
  const [spo2, setSpo2] = useState('');
  const [temp, setTemp] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [pain, setPain] = useState('');
  const [vitalNotes, setVitalNotes] = useState('');
  const [vitalSaving, setVitalSaving] = useState(false);

  // Inline creation state — Follow-up
  const [showFollowupForm, setShowFollowupForm] = useState(false);
  const [followupPresetDays, setFollowupPresetDays] = useState(7);
  const [followupObjective, setFollowupObjective] = useState('');
  const [followupChannel, setFollowupChannel] = useState<'whatsapp' | 'email' | 'push'>('whatsapp');
  const [followupSaving, setFollowupSaving] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rxRes, notesRes, vitalsRes, followupsRes] = await Promise.all([
        fetch(`/api/doctors/patients/${encodeURIComponent(patientId)}/prescriptions`, {
          credentials: 'include',
        }),
        fetch(`/api/doctors/medical-records?patientId=${encodeURIComponent(patientId)}&pageSize=20`, {
          credentials: 'include',
        }),
        fetch(`/api/doctors/patients/${encodeURIComponent(patientId)}/vitals`, {
          credentials: 'include',
        }),
        fetch(`/api/doctors/patients/${encodeURIComponent(patientId)}/followups`, {
          credentials: 'include',
        }),
      ]);

      if (rxRes.ok) {
        const rxJson = (await rxRes.json()) as { data?: { prescriptions?: PrescriptionRenewalInfo[] } };
        setPrescriptions(rxJson.data?.prescriptions ?? []);
      }
      if (notesRes.ok) {
        const notesJson = (await notesRes.json()) as { data?: { records?: MedicalNoteRow[] } };
        setNotes(notesJson.data?.records ?? []);
      }
      if (vitalsRes.ok) {
        const vitalsJson = (await vitalsRes.json()) as {
          data?: { vitals?: VitalRow[]; alerts?: VitalAlert[] };
        };
        setVitals(vitalsJson.data?.vitals ?? []);
        setVitalAlerts(vitalsJson.data?.alerts ?? []);
      }
      if (followupsRes.ok) {
        const fJson = (await followupsRes.json()) as { data?: { followups?: FollowupRow[] } };
        setFollowups(fJson.data?.followups ?? []);
      }
    } catch {
      setError(
        isBrazilianDoctor
          ? 'Não foi possível carregar o prontuário clínico.'
          : 'No se pudo cargar el workspace clínico del paciente.',
      );
    } finally {
      setLoading(false);
    }
  }, [patientId, isBrazilianDoctor]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (noteSaving) return;
    setNoteSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/doctors/medical-records', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          patientId,
          type: 'consultation',
          kind: noteKind,
          title: noteTitle.trim(),
          summary: noteSummary.trim(),
          diagnosis: noteDiagnosis.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNoteTitle('');
      setNoteSummary('');
      setNoteDiagnosis('');
      setShowNoteForm(false);
      await loadWorkspace();
    } catch {
      setError(
        isBrazilianDoctor
          ? 'Erro ao registrar evolução clínica.'
          : 'Error al registrar la evolución clínica.',
      );
    } finally {
      setNoteSaving(false);
    }
  };

  const handleSaveVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (vitalSaving) return;
    setVitalSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/doctors/patients/${encodeURIComponent(patientId)}/vitals`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          bloodPressureSystolic: bpSys ? Number(bpSys) : null,
          bloodPressureDiastolic: bpDia ? Number(bpDia) : null,
          heartRate: hr ? Number(hr) : null,
          oxygenSaturation: spo2 ? Number(spo2) : null,
          temperature: temp ? Number(temp) : null,
          weight: weight ? Number(weight) : null,
          height: height ? Number(height) : null,
          painScale: pain ? Number(pain) : null,
          notes: vitalNotes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBpSys('');
      setBpDia('');
      setHr('');
      setSpo2('');
      setTemp('');
      setWeight('');
      setHeight('');
      setPain('');
      setVitalNotes('');
      setShowVitalForm(false);
      await loadWorkspace();
    } catch {
      setError(
        isBrazilianDoctor
          ? 'Verifique os intervalos dos sinais vitais informados.'
          : 'Verificá los rangos de los signos vitales ingresados.',
      );
    } finally {
      setVitalSaving(false);
    }
  };

  const handleSaveFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (followupSaving) return;
    setFollowupSaving(true);
    setError(null);
    try {
      const scheduled = new Date(Date.now() + followupPresetDays * 86_400_000).toISOString();
      const res = await fetch(`/api/doctors/patients/${encodeURIComponent(patientId)}/followups`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          scheduledFor: scheduled,
          objective: followupObjective.trim(),
          channel: followupChannel,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFollowupObjective('');
      setShowFollowupForm(false);
      await loadWorkspace();
    } catch {
      setError(
        isBrazilianDoctor
          ? 'Erro ao agendar acompanhamento clínico.'
          : 'Error al programar el seguimiento clínico.',
      );
    } finally {
      setFollowupSaving(false);
    }
  };

  const handleFollowupAction = async (followupId: string, action: 'complete' | 'cancel') => {
    try {
      const res = await fetch(`/api/doctors/patients/${encodeURIComponent(patientId)}/followups`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ followupId, action }),
      });
      if (res.ok) {
        await loadWorkspace();
      }
    } catch {
      // Non-fatal
    }
  };

  const expiredOrExpiringCount = prescriptions.filter(
    (p) => p.renewalStatus === 'expired' || p.renewalStatus === 'expiring_soon',
  ).length;
  const pendingFollowupsCount = followups.filter((f) => f.status === 'pending').length;

  const tabs: Array<{ id: WorkspaceSection; label: string; badge?: number; icon: typeof Pill }> = [
    {
      id: 'prescriptions',
      label: isBrazilianDoctor ? 'Receitas e Renovação' : 'Recetas y Renovación',
      badge: expiredOrExpiringCount || undefined,
      icon: Pill,
    },
    {
      id: 'evolutions',
      label: isBrazilianDoctor ? 'Evoluções e SOAP' : 'Evoluciones y Notas',
      badge: notes.length || undefined,
      icon: FileText,
    },
    {
      id: 'vitals',
      label: isBrazilianDoctor ? 'Sinais Vitais' : 'Monitoreo y Vitales',
      badge: vitalAlerts.length || undefined,
      icon: HeartPulse,
    },
    {
      id: 'followups',
      label: isBrazilianDoctor ? 'Acompanhamento' : 'Seguimiento',
      badge: pendingFollowupsCount || undefined,
      icon: CalendarClock,
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#0284C7]" />
          <h2 className="text-sm font-bold text-[#0F2537]">
            {isBrazilianDoctor ? 'Workspace Clínico do Paciente' : 'Workspace Clínico del Paciente'}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void loadWorkspace()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          {isBrazilianDoctor ? 'Atualizar' : 'Actualizar'}
        </button>
      </div>

      {vitalAlerts.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {vitalAlerts.map((alert) => (
            <div
              key={alert.code}
              className={
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ' +
                (alert.severity === 'critical'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800')
              }
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{isBrazilianDoctor ? alert.labelPt : alert.labelEs}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={
                'flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold transition ' +
                (active
                  ? 'border-sky-200 bg-sky-50 text-[#0284C7]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
              }
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && prescriptions.length === 0 && notes.length === 0 && vitals.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-xs text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {isBrazilianDoctor ? 'Carregando dados clínicos...' : 'Cargando datos clínicos...'}
        </div>
      ) : null}

      {/* 1. Prescriptions & Renewal */}
      {section === 'prescriptions' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {isBrazilianDoctor
                ? 'Prescrições emitidas e controle de renovação'
                : 'Prescripciones emitidas y renovación rápida por vencimiento'}
            </p>
            <a
              href={`/doctors/prescriptions?patientId=${encodeURIComponent(patientId)}&new=1`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0284C7] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0369A1]"
            >
              <Plus className="h-3.5 w-3.5" />
              {isBrazilianDoctor ? 'Nova receita' : 'Nueva receta'}
            </a>
          </div>

          {prescriptions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              {isBrazilianDoctor
                ? 'Nenhuma receita emitida para este paciente.'
                : 'No hay recetas emitidas para este paciente.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {prescriptions.map((rx) => {
                const badgeClass =
                  rx.renewalStatus === 'expired'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : rx.renewalStatus === 'expiring_soon'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : rx.renewalStatus === 'cancelled'
                        ? 'border-slate-200 bg-slate-100 text-slate-500'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

                const badgeText =
                  rx.renewalStatus === 'expired'
                    ? isBrazilianDoctor
                      ? 'Vencida'
                      : 'Vencida'
                    : rx.renewalStatus === 'expiring_soon'
                      ? isBrazilianDoctor
                        ? `Vence em ${rx.daysRemaining ?? 0}d`
                        : `Vence en ${rx.daysRemaining ?? 0}d`
                      : rx.renewalStatus === 'cancelled'
                        ? isBrazilianDoctor
                          ? 'Cancelada'
                          : 'Cancelada'
                        : isBrazilianDoctor
                          ? 'Ativa'
                          : 'Vigente';

                return (
                  <div
                    key={rx.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {rx.medicationName}
                          {rx.dosage ? ` · ${rx.dosage}` : ''}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
                          {badgeText}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {formatShortDate(rx.createdAt, locale)}
                        {rx.validUntil
                          ? ` · ${isBrazilianDoctor ? 'Validade:' : 'Válida hasta:'} ${formatShortDate(rx.validUntil, locale)}`
                          : ''}
                        {rx.cuir ? ` · ${rx.cuir}` : ''}
                      </p>
                      {rx.diagnosis && (
                        <p className="mt-0.5 text-[11px] text-slate-600">{rx.diagnosis}</p>
                      )}
                    </div>
                    {rx.canRenew && (
                      <a
                        href={`/doctors/prescriptions?patientId=${encodeURIComponent(patientId)}&renewFrom=${encodeURIComponent(rx.id)}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0284C7] hover:bg-sky-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {isBrazilianDoctor ? 'Renovar receita' : 'Renovar receta'}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Evolutions / Clinical Notes */}
      {section === 'evolutions' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {isBrazilianDoctor
                ? 'Evoluções médicas e anotações SOAP registradas'
                : 'Evoluciones clínicas y notas SOAP registradas'}
            </p>
            <button
              type="button"
              onClick={() => setShowNoteForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0284C7] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0369A1]"
            >
              <ClipboardPlus className="h-3.5 w-3.5" />
              {isBrazilianDoctor ? 'Registrar evolução' : 'Registrar evolución'}
            </button>
          </div>

          {showNoteForm && (
            <form
              onSubmit={(e) => void handleSaveNote(e)}
              className="space-y-2.5 rounded-xl border border-sky-200 bg-sky-50/40 p-3.5"
            >
              <div className="grid gap-2.5 sm:grid-cols-3">
                <input
                  type="text"
                  required
                  minLength={2}
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder={isBrazilianDoctor ? 'Título da evolução *' : 'Título de la evolución *'}
                  className="sm:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                />
                <select
                  value={noteKind}
                  onChange={(e) => setNoteKind(e.target.value as 'evolution' | 'soap')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
                >
                  <option value="evolution">{isBrazilianDoctor ? 'Evolução clínica' : 'Evolución clínica'}</option>
                  <option value="soap">SOAP</option>
                </select>
              </div>
              <input
                type="text"
                value={noteDiagnosis}
                onChange={(e) => setNoteDiagnosis(e.target.value)}
                placeholder={isBrazilianDoctor ? 'Diagnóstico / CID-10 (opcional)' : 'Diagnóstico / CIE-10 (opcional)'}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
              />
              <textarea
                required
                minLength={3}
                rows={3}
                value={noteSummary}
                onChange={(e) => setNoteSummary(e.target.value)}
                placeholder={
                  isBrazilianDoctor
                    ? 'Descreva a evolução clínica, conduta ou plano terapêutico...'
                    : 'Describí la evolución clínica, hallazgos y plan terapéutico...'
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNoteForm(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  {isBrazilianDoctor ? 'Cancelar' : 'Cancelar'}
                </button>
                <button
                  type="submit"
                  disabled={noteSaving}
                  className="rounded-lg bg-[#0284C7] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {noteSaving
                    ? isBrazilianDoctor
                      ? 'Salvando...'
                      : 'Guardando...'
                    : isBrazilianDoctor
                      ? 'Salvar evolução'
                      : 'Guardar evolución'}
                </button>
              </div>
            </form>
          )}

          {notes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              {isBrazilianDoctor ? 'Sem evoluções registradas.' : 'No hay evoluciones registradas.'}
            </p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => {
                const contentObj =
                  n.content && typeof n.content === 'object' ? n.content : null;
                const summary =
                  typeof n.content === 'string'
                    ? n.content
                    : String(
                        contentObj?.summary ??
                          contentObj?.diagnosis ??
                          contentObj?.notes ??
                          '',
                      );
                return (
                  <article
                    key={n.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-900">{n.title}</h3>
                      <span className="text-[10px] text-slate-500">
                        {formatShortDate(n.dateRecorded ?? n.date_recorded ?? n.createdAt ?? n.created_at, locale)}
                      </span>
                    </div>
                    {summary && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{summary}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Vital Signs Monitoring */}
      {section === 'vitals' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {isBrazilianDoctor
                ? 'Sinais vitais e alertas automáticos'
                : 'Signos vitales y alertas clínicas automáticas'}
            </p>
            <button
              type="button"
              onClick={() => setShowVitalForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0284C7] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0369A1]"
            >
              <HeartPulse className="h-3.5 w-3.5" />
              {isBrazilianDoctor ? 'Registrar sinais vitais' : 'Registrar signos vitales'}
            </button>
          </div>

          {showVitalForm && (
            <form
              onSubmit={(e) => void handleSaveVitals(e)}
              className="space-y-2.5 rounded-xl border border-sky-200 bg-sky-50/40 p-3.5"
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input type="number" placeholder="PAS (mmHg)" value={bpSys} onChange={(e) => setBpSys(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                <input type="number" placeholder="PAD (mmHg)" value={bpDia} onChange={(e) => setBpDia(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                <input type="number" placeholder={isBrazilianDoctor ? 'FC (bpm)' : 'FC (lpm)'} value={hr} onChange={(e) => setHr(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                <input type="number" placeholder="SpO2 (%)" value={spo2} onChange={(e) => setSpo2(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                <input type="number" step="0.1" placeholder="Temp (°C)" value={temp} onChange={(e) => setTemp(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                <input type="number" step="0.1" placeholder={isBrazilianDoctor ? 'Peso (kg)' : 'Peso (kg)'} value={weight} onChange={(e) => setWeight(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                <input type="number" placeholder={isBrazilianDoctor ? 'Altura (cm)' : 'Altura (cm)'} value={height} onChange={(e) => setHeight(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                <input type="number" placeholder={isBrazilianDoctor ? 'Dor (0-10)' : 'Dolor (0-10)'} value={pain} onChange={(e) => setPain(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
              </div>
              <input
                type="text"
                value={vitalNotes}
                onChange={(e) => setVitalNotes(e.target.value)}
                placeholder={isBrazilianDoctor ? 'Observações (opcional)' : 'Observaciones (opcional)'}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowVitalForm(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                  Cancelar
                </button>
                <button type="submit" disabled={vitalSaving} className="rounded-lg bg-[#0284C7] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  {vitalSaving ? (isBrazilianDoctor ? 'Salvando...' : 'Guardando...') : (isBrazilianDoctor ? 'Salvar sinais' : 'Guardar signos')}
                </button>
              </div>
            </form>
          )}

          {vitals.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              {isBrazilianDoctor ? 'Sem registros de sinais vitais.' : 'Sin registros de signos vitales.'}
            </p>
          ) : (
            <div className="space-y-2">
              {vitals.map((v) => (
                <div key={v.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">{formatShortDate(v.measured_at, locale)}</span>
                    {v.bmi != null && <span>IMC {v.bmi}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs font-semibold text-slate-800">
                    {v.blood_pressure_systolic != null && v.blood_pressure_diastolic != null && (
                      <span className="rounded-lg bg-white px-2 py-1 border border-slate-200">
                        PA {v.blood_pressure_systolic}/{v.blood_pressure_diastolic} mmHg
                      </span>
                    )}
                    {v.heart_rate != null && (
                      <span className="rounded-lg bg-white px-2 py-1 border border-slate-200">
                        FC {v.heart_rate}
                      </span>
                    )}
                    {v.oxygen_saturation != null && (
                      <span className="rounded-lg bg-white px-2 py-1 border border-slate-200">
                        SpO2 {v.oxygen_saturation}%
                      </span>
                    )}
                    {v.temperature != null && (
                      <span className="rounded-lg bg-white px-2 py-1 border border-slate-200">
                        {v.temperature} °C
                      </span>
                    )}
                    {v.weight != null && (
                      <span className="rounded-lg bg-white px-2 py-1 border border-slate-200">
                        {v.weight} kg
                      </span>
                    )}
                    {v.pain_scale != null && (
                      <span className="rounded-lg bg-white px-2 py-1 border border-slate-200">
                        {isBrazilianDoctor ? 'Dor' : 'Dolor'} {v.pain_scale}/10
                      </span>
                    )}
                  </div>
                  {v.notes && <p className="mt-1 text-[11px] text-slate-500">{v.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Follow-ups */}
      {section === 'followups' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {isBrazilianDoctor
                ? 'Controles e acompanhamentos agendados'
                : 'Controles y seguimientos clínicos programados'}
            </p>
            <button
              type="button"
              onClick={() => setShowFollowupForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0284C7] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0369A1]"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {isBrazilianDoctor ? 'Programar acompanhamento' : 'Programar seguimiento'}
            </button>
          </div>

          {showFollowupForm && (
            <form
              onSubmit={(e) => void handleSaveFollowup(e)}
              className="space-y-2.5 rounded-xl border border-sky-200 bg-sky-50/40 p-3.5"
            >
              <div className="flex flex-wrap gap-1.5">
                {[
                  { days: 2, label: '48h' },
                  { days: 7, label: '7d' },
                  { days: 15, label: '15d' },
                  { days: 30, label: '30d' },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setFollowupPresetDays(preset.days)}
                    className={
                      'rounded-lg border px-2.5 py-1 text-xs font-bold ' +
                      (followupPresetDays === preset.days
                        ? 'border-sky-500 bg-sky-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700')
                    }
                  >
                    {preset.label}
                  </button>
                ))}
                <select
                  value={followupChannel}
                  onChange={(e) => setFollowupChannel(e.target.value as 'whatsapp' | 'email' | 'push')}
                  className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="push">Push</option>
                </select>
              </div>
              <input
                type="text"
                required
                minLength={3}
                value={followupObjective}
                onChange={(e) => setFollowupObjective(e.target.value)}
                placeholder={
                  isBrazilianDoctor
                    ? 'Objetivo do controle (ex.: revisar PA e adesão ao enalapril)'
                    : 'Objetivo del control (ej.: revisar presión y tolerancia a medicación)'
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowFollowupForm(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                  Cancelar
                </button>
                <button type="submit" disabled={followupSaving} className="rounded-lg bg-[#0284C7] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  {followupSaving ? (isBrazilianDoctor ? 'Salvando...' : 'Guardando...') : (isBrazilianDoctor ? 'Agendar' : 'Programar')}
                </button>
              </div>
            </form>
          )}

          {followups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              {isBrazilianDoctor ? 'Sem acompanhamentos agendados.' : 'Sin seguimientos programados.'}
            </p>
          ) : (
            <div className="space-y-2">
              {followups.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900">{f.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {formatShortDate(f.scheduled_for, locale)} · {f.channel.toUpperCase()} · {f.status}
                    </p>
                  </div>
                  {f.status === 'pending' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleFollowupAction(f.id, 'complete')}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {isBrazilianDoctor ? 'Concluir' : 'Completar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleFollowupAction(f.id, 'cancel')}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
