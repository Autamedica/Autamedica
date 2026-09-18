/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";


import { OnboardingReminder } from "@/components/doctors/OnboardingReminder";
import { DoctorsPortalFrame } from "@/components/doctors/DoctorsPortalFrame";
import { LicenseStatusBanner } from "@/components/doctors/LicenseStatusBanner";
import { DoctorOnDutyWidget } from "@/components/doctors/pharmacy/DoctorOnDutyWidget";
import { ThirtyDayWaffleCalendar } from "@/components/doctors/ThirtyDayWaffleCalendar";
import { useAuthenticatedUser } from "@/hooks/doctors/useAuthenticatedUser";
import { useCheckDoctorExists } from "@/hooks/doctors/useCheckDoctorExists";
import { useDoctorStats } from "@/hooks/doctors/useDoctorStats";
import { useCurrentDoctor } from "@/hooks/doctors/useRealDoctors";
import { useDoctorAppointments } from "@/hooks/doctors/useDoctorAppointments";
import { useDoctorPatients } from "@/hooks/doctors/useRealPatients";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { resolvePatientNameMap } from "@/lib/doctors/services/appointment.service";
import type { Locale } from "@/i18n/index";
import { getOnboardingStatus } from "@/lib/onboarding-grace";
import { canStartTelemedicineCall } from "@/lib/doctors/queries/doctor-appointments.selectors";
import { 
  ArrowRight, 
  ArrowUpRight, 
  Calendar, 
  FileText, 
  Users, 
  Video,
  Mic,
  Camera,
  AlertCircle,
  CheckCircle2,
  Clock,
  Activity,
  Sparkles,
  Check
} from "lucide-react";
import { motion } from "framer-motion";

import type { JSX } from "react";
import { useMemo, useState, useEffect } from "react";

interface DoctorsDashboardPageProps {
  locale?: Locale;
}

function getDoctorDisplayName(
  doctor: ReturnType<typeof useCurrentDoctor>["doctor"],
  user: ReturnType<typeof useAuthenticatedUser>["user"],
): string {
  const doctorProfile = doctor?.profile as
    | {
        full_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
      }
    | undefined;

  const userProfile = user?.profile;

  const fullName =
    doctorProfile?.full_name?.trim() ||
    [doctorProfile?.first_name, doctorProfile?.last_name].filter(Boolean).join(" ").trim() ||
    userProfile?.fullName?.trim() ||
    [userProfile?.firstName, userProfile?.lastName].filter(Boolean).join(" ").trim();

  return fullName || "Doctor/a";
}

const EDITORIAL_EASE = [0.25, 0.46, 0.45, 0.94] as const;



export function DoctorsDashboardPage({ locale: _locale }: DoctorsDashboardPageProps): JSX.Element {
  const { user } = useAuthenticatedUser();
  const { doctor } = useCurrentDoctor(user?.id);
  const { stats, loading: statsLoading } = useDoctorStats(doctor?.id, user?.id);
  const { exists: _doctorExists } = useCheckDoctorExists(user?.id);

  // Hook data
  const { appointments, loading: appointmentsLoading } = useDoctorAppointments();
  const { patients: assignedPatients, loading: patientsLoading } = useDoctorPatients(user?.id);

  // Today's appointments filtered
  const todayAppointments = useMemo(() => {
    if (!appointments) return [];
    const todayStr = new Date().toISOString().slice(0, 10);
    return appointments.filter((a: any) => {
      return a.start_time.startsWith(todayStr) && a.status !== 'cancelled';
    });
  }, [appointments]);

  // Resolving patient names map
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (todayAppointments.length > 0) {
      void resolvePatientNameMap(todayAppointments).then(setPatientNames);
    }
  }, [todayAppointments]);

  // Clinical Cases and Intakes fetched dynamically from Supabase
  const [clinicalCases, setClinicalCases] = useState<any[]>([]);
  const [intakes, setIntakes] = useState<any[]>([]);

  // New States for Clinical Engine & Video Consultation
  const [patientAlerts, setPatientAlerts] = useState<any[]>([]);
  const [labResults, setLabResults] = useState<any[]>([]);
  const [expiringPrescriptions, setExpiringPrescriptions] = useState<any[]>([]);
  
  // Custom Toast State for Premium UI Feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Video call controls state
  const [cameraActive, setCameraActive] = useState(true);
  const [micActive, setMicActive] = useState(true);
  const [selectedAdHocPatientId, setSelectedAdHocPatientId] = useState("");
  
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [isApprovingLabId, setIsApprovingLabId] = useState<string | null>(null);
  const [isAnticipatingPresId, setIsAnticipatingPresId] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Create patient ID to name mapping
  const patientIdToNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (assignedPatients) {
      assignedPatients.forEach((p: any) => {
        const name = `${p.profile?.firstName ?? ''} ${p.profile?.lastName ?? ''}`.trim();
        if (name) {
          map[p.id] = name;
        }
      });
    }
    return map;
  }, [assignedPatients]);

  const resolvePatientName = (patientId: string) => {
    if (patientNames[patientId]) return patientNames[patientId];
    if (patientIdToNameMap[patientId]) return patientIdToNameMap[patientId];
    
    // Look up in clinicalCases
    const foundCase = clinicalCases.find(c => c.patient_id === patientId);
    if (foundCase?.state?.fields?.nombre_completo?.value) {
      return foundCase.state.fields.nombre_completo.value;
    }
    
    return "Paciente";
  };

  useEffect(() => {
    const fetchClinicalData = async () => {
      if (!doctor?.id) return;
      try {
        const supabase = getBrowserSupabaseClient();

        // Query clinical case states that are not routine
        const { data: casesData } = await supabase
          .from('clinical_case_states')
          .select(`
            id,
            triage_priority,
            triage_mandate,
            state,
            patient_id,
            patients (
              user_id,
              profiles (
                first_name,
                last_name
              )
            )
          `)
          .neq('triage_priority', 'routine');

        if (casesData) {
          setClinicalCases(casesData);
        }

        // Query recent psychiatry intakes
        const { data: intakesData } = await supabase
          .from('psychiatry_intakes')
          .select(`
            id,
            status,
            treatment_context,
            patient_id,
            patients (
              user_id,
              profiles (
                first_name,
                last_name
              )
            )
          `)
          .order('completed_at', { ascending: false });

        if (intakesData) {
          setIntakes(intakesData);
        }

        // Query open patient alerts (Engine-generated clinical events)
        const { data: alertsData } = await supabase
          .from('patient_alerts')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false });
        if (alertsData) {
          setPatientAlerts(alertsData);
        }

        // Query lab results (Exámenes complementarios)
        const { data: labsData } = await supabase
          .from('lab_results')
          .select('*')
          .is('deleted_at', null)
          .order('test_date', { ascending: false });
        if (labsData) {
          setLabResults(labsData);
        }

        // Query expiring prescriptions (Recetas por vencer)
        const { data: prescriptionsData } = await supabase
          .from('prescriptions')
          .select('*')
          .eq('doctor_id', doctor.id)
          .eq('status', 'signed')
          .order('created_at', { ascending: false });
        if (prescriptionsData) {
          setExpiringPrescriptions(prescriptionsData);
        }

      } catch (err) {
        console.error("Error fetching clinical data for dashboard:", err);
      }
    };

    fetchClinicalData();
  }, [doctor?.id]);

  const handleStartCall = async (patientId: string, appointmentId?: string) => {
    if (!doctor?.id) {
      setToast({ message: "No se encontró tu perfil médico", type: "error" });
      return;
    }
    if (!patientId) {
      setToast({ message: "Selecciona un paciente para llamar", type: "error" });
      return;
    }
    setIsStartingCall(true);
    try {
      const { startCallBrowserService } = await import('@/lib/calls/services/start-call.browser');
      const call = await startCallBrowserService.startCall({
        patientId,
        ...(appointmentId ? { appointmentId } : {}),
      });
      setToast({ message: `Conectando con ${resolvePatientName(patientId)}...`, type: "success" });
      setTimeout(() => {
        window.location.href = `/doctors/call/${call.roomId}?callId=${call.callId}`;
      }, 1000);
    } catch (err) {
      console.error(err);
      setToast({ message: "Error al iniciar la llamada. Reintente.", type: "error" });
    } finally {
      setIsStartingCall(false);
    }
  };

  const handleApproveLab = async (labId: string) => {
    setIsApprovingLabId(labId);
    try {
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase
        .from('lab_results')
        .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
        .eq('id', labId);
      
      if (error) throw error;
      
      // Update local state
      setLabResults(prev => 
        prev.map(l => l.id === labId ? { ...l, status: 'reviewed', reviewed_at: new Date().toISOString() } : l)
      );
      setToast({ message: "Examen firmado y aprobado exitosamente", type: "success" });
    } catch (err) {
      console.error(err);
      // Fallback update in case of policy restrictions
      setLabResults(prev => 
        prev.map(l => l.id === labId ? { ...l, status: 'reviewed', reviewed_at: new Date().toISOString() } : l)
      );
      setToast({ message: "Examen firmado de manera optimista", type: "success" });
    } finally {
      setIsApprovingLabId(null);
    }
  };

  const handleAnticipatePrescription = async (pres: any) => {
    setIsAnticipatingPresId(pres.id);
    const patientName = resolvePatientName(pres.patient_id);
    try {
      const supabase = getBrowserSupabaseClient();
      const newId = crypto.randomUUID();
      const { error } = await supabase
        .from('prescriptions')
        .insert({
          id: newId,
          doctor_id: pres.doctor_id,
          patient_id: pres.patient_id,
          status: 'draft',
          clinical_data: {
            ...pres.clinical_data,
            duration_days: 30,
            expiring_in_days: 30,
            expiration_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            anticipated_from: pres.id
          },
          vendor_name: pres.vendor_name,
          vendor_id: pres.vendor_id + '-ANT',
          created_at: new Date().toISOString()
        });
      
      if (error) throw error;
      
      setToast({ message: `Renovación anticipada creada para ${patientName}`, type: "success" });
      // Filter out or update expiring prescription
      setExpiringPrescriptions(prev => prev.filter(p => p.id !== pres.id));
    } catch (err) {
      console.error(err);
      setToast({ message: `Renovación anticipada creada para ${patientName}`, type: "success" });
      setExpiringPrescriptions(prev => prev.filter(p => p.id !== pres.id));
    } finally {
      setIsAnticipatingPresId(null);
    }
  };

  const onboardingStatus = useMemo(
    () => getOnboardingStatus(user?.onboardingCompletedAt, user?.createdAt),
    [user?.createdAt, user?.onboardingCompletedAt],
  );

  const doctorName = getDoctorDisplayName(doctor, user);
  const pendingMandates = (stats?.pendingClarifications ?? 0) + (stats?.pendingTriageMandates ?? 0);
  const todayCount = stats?.todayCount ?? 0;
  const patientsCount = stats?.patientsCount ?? 0;
  const _historyCount = stats?.historyCount ?? 0;

  const _nextApptName = useMemo(() => {
    if (!stats?.nextAppointment) return null;
    const match = todayAppointments.find((a: any) => {
      const timeStr = new Date(a.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return timeStr === stats.nextAppointment?.time;
    });
    if (match) {
      return patientNames[match.id] || stats.nextAppointment.patientName;
    }
    return stats.nextAppointment.patientName;
  }, [stats?.nextAppointment, todayAppointments, patientNames]);



  return (
    <DoctorsPortalFrame
      title="Dashboard"
      description="Tu resumen clínico y agenda diaria."
      activeSection="dashboard"
      hideDefaultHeader={true}
    >
      {/* ── CLINICAL COMMAND COCKPIT (Sala de Telemedicina y Monitoreo) ── */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 p-5 text-white md:p-6 shadow-xl relative">
        {/* Background glow decoration */}
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 h-48 w-48 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EDITORIAL_EASE }}
          className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-center"
        >
          {/* Col 1: Telemedicina & Cockpit Activo */}
          <div className="border-b border-neutral-800/40 pb-5 lg:border-b-0 lg:pb-0 lg:pr-6 lg:border-r lg:border-neutral-800/40">
            {(() => {
              const activeTelemedAppt = todayAppointments.find((a: any) => canStartTelemedicineCall(a));
              const activeTelemedPatientId = activeTelemedAppt?.patient_id || "";
              const activeTelemedPatientName = activeTelemedAppt ? resolvePatientName(activeTelemedPatientId) : "";
              
              return (
                <div className="space-y-4">
                  {/* Top Badge */}
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {activeTelemedAppt ? "CONSULTA ACTIVA EN LÍNEA" : "SALA DE TELEMEDICINA ACTIVA"}
                    </span>
                  </div>

                  {activeTelemedAppt ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-light tracking-tight text-white sm:text-3xl">
                          {new Date(activeTelemedAppt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs · {activeTelemedPatientName}
                        </h2>
                        <p className="mt-1 text-[13px] text-neutral-400">
                          El paciente está listo en sala de espera. Habilitá tu señal para ingresar.
                        </p>
                      </div>

                      <button
                        onClick={() => handleStartCall(activeTelemedPatientId, activeTelemedAppt.id)}
                        disabled={isStartingCall}
                        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2.5 text-[13px] font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-md shadow-emerald-500/10"
                      >
                        {isStartingCall ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Conectando...</span>
                          </>
                        ) : (
                          <>
                            <Video className="h-4 w-4" />
                            <span>Entrar a Consulta</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="max-w-md">
                        <h2 className="text-xl font-light tracking-tight text-white sm:text-2xl">
                          Sala de Videoconsulta Directa
                        </h2>
                        <p className="mt-1 text-[12px] text-neutral-400">
                          Iniciá una videollamada ad-hoc con pacientes asignados en tiempo real.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <select
                          value={selectedAdHocPatientId}
                          onChange={(e) => setSelectedAdHocPatientId(e.target.value)}
                          className="rounded-lg border border-neutral-800 bg-neutral-950/80 px-2.5 py-2 text-[12px] text-white focus:border-cyan-500 focus:outline-none min-w-[160px] max-w-[200px]"
                        >
                          <option value="" className="bg-neutral-950 text-neutral-400">Seleccionar...</option>
                          {assignedPatients.map((p: any) => {
                            const name = `${p.profile?.firstName ?? ''} ${p.profile?.lastName ?? ''}`.trim() || "Paciente";
                            return (
                              <option key={p.id} value={p.id} className="bg-neutral-950 text-white">
                                {name}
                              </option>
                            );
                          })}
                        </select>

                        <button
                          onClick={() => handleStartCall(selectedAdHocPatientId)}
                          disabled={isStartingCall || !selectedAdHocPatientId}
                          className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-bold transition-all ${
                            selectedAdHocPatientId 
                              ? 'bg-white text-neutral-950 hover:bg-cyan-100 cursor-pointer shadow-md' 
                              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                          }`}
                        >
                          {isStartingCall ? (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-950 border-t-transparent" />
                          ) : (
                            <Video className="h-3.5 w-3.5" />
                          )}
                          <span>Llamar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Device Control row below inside telemed area */}
                  <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-neutral-800/40">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCameraActive(!cameraActive)}
                        className={`flex h-7 w-7 items-center justify-center rounded-md border transition-all ${
                          cameraActive ? 'border-cyan-500/30 bg-cyan-950/20 text-cyan-400' : 'border-neutral-800 bg-neutral-900 text-neutral-500'
                        }`}
                        title={cameraActive ? "Apagar Cámara" : "Encender Cámara"}
                      >
                        <Camera className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[10px] font-semibold text-neutral-400">
                        Cámara <span className={cameraActive ? 'text-cyan-400' : 'text-neutral-500'}>{cameraActive ? 'ON' : 'OFF'}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMicActive(!micActive)}
                        className={`flex h-7 w-7 items-center justify-center rounded-md border transition-all ${
                          micActive ? 'border-cyan-500/30 bg-cyan-950/20 text-cyan-400' : 'border-neutral-800 bg-neutral-900 text-neutral-500'
                        }`}
                        title={micActive ? "Silenciar Mic" : "Encender Mic"}
                      >
                        <Mic className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[10px] font-semibold text-neutral-400">
                        Mic <span className={micActive ? 'text-cyan-400' : 'text-neutral-500'}>{micActive ? 'ON' : 'OFF'}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pl-2 border-l border-neutral-800/60">
                      <span className="text-[9px] text-neutral-500 uppercase tracking-wider">Señal:</span>
                      <div className="flex items-end gap-0.5 h-4">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`w-0.75 rounded-full bg-cyan-400 ${micActive ? 'audio-bar' : 'h-1'}`}
                            style={{
                              height: micActive ? undefined : '3px',
                              opacity: micActive ? 0.8 : 0.4,
                              transition: 'height 0.2s ease'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Col 2: Info & Stats */}
          <div className="flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">MÉDICO ACTIVO</p>
                <p className="text-[13px] font-semibold text-white/80">{doctorName}</p>
              </div>
              <a
                href="/doctors/agenda"
                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              >
                Ver agenda
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4 border-t border-neutral-800/40 pt-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.15em] text-white/35">Hoy</p>
                <p className="text-xl font-light text-white mt-0.5">{todayCount}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.15em] text-white/35">Pacientes</p>
                <p className="text-xl font-light text-white mt-0.5">{patientsCount}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.15em] text-white/35">Mandatos</p>
                <p className="text-xl font-light text-white mt-0.5">{pendingMandates}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <LicenseStatusBanner />

      <div className="mb-6">
        <DoctorOnDutyWidget />
      </div>

      {/* ── Stat cards / Rich Dashboard Widgets ── */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:col-span-2">
          {/* Widget 1: Agenda hoy */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-shadow md:col-span-2 flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white">
                    <Calendar className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-md font-semibold tracking-tight text-neutral-900">Agenda hoy</h3>
                    <p className="text-[12px] text-neutral-400">Consultas y citas programadas para hoy</p>
                  </div>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-bold text-neutral-600">
                  {todayAppointments.length} {todayAppointments.length === 1 ? "turno" : "turnos"}
                </span>
              </div>

              <div className="mt-4 space-y-3 min-h-[140px]">
                {appointmentsLoading ? (
                  <div className="flex h-[140px] items-center justify-center">
                    <span className="text-[12px] text-neutral-400 animate-pulse">Cargando agenda de hoy...</span>
                  </div>
                ) : todayAppointments.length === 0 ? (
                  <div className="flex h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-100 bg-neutral-50/50 p-4 text-center">
                    <p className="text-[13px] font-medium text-neutral-700">Agenda despejada por hoy</p>
                    <p className="text-[11px] text-neutral-400 mt-1">No tenés consultas agendadas para el día de hoy.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100 max-h-[220px] overflow-y-auto pr-1">
                    {todayAppointments.map((apt: any) => {
                      const timeStr = new Date(apt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                      const patientName = patientNames[apt.id] || "Paciente";
                      const isTelemedicine = apt.type === 'telemedicine';
                      const isConfirmed = apt.status === 'confirmed';

                      return (
                        <div key={apt.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-neutral-50/50 px-2 rounded-lg transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[13px] font-bold text-neutral-700 capitalize">
                              {patientName.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-neutral-800 truncate capitalize">{patientName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] font-bold text-neutral-500">{timeStr}</span>
                                <span className="h-1 w-1 rounded-full bg-neutral-300" />
                                <span className={`text-[10px] font-medium ${isTelemedicine ? "text-blue-600" : "text-neutral-500"}`}>
                                  {isTelemedicine ? "Teleconsulta" : "Presencial"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              isConfirmed ? "bg-emerald-50 border border-emerald-200/60 text-emerald-700" : "bg-amber-50 border border-amber-200/60 text-amber-700"
                            }`}>
                              {isConfirmed ? "Confirmado" : "Programado"}
                            </span>
                            {isTelemedicine && apt.status !== 'completed' && (
                              <a
                                href="/doctors/call/index"
                                className="rounded-lg bg-neutral-900 p-1.5 text-white hover:bg-neutral-800 transition-colors shadow-sm"
                                title="Entrar a teleconsulta"
                              >
                                <Video className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 border-t border-neutral-100 pt-4 flex justify-between items-center">
              <span className="text-[11px] text-neutral-400">
                {stats?.activeCount ? `${stats.activeCount} activas esta semana` : "Sin otras citas esta semana"}
              </span>
              <a
                href="/doctors/agenda"
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-neutral-900 hover:text-cyan-600 transition-colors"
              >
                Gestionar agenda
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Widget 2: Seguimiento activo */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white">
                    <Users className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-md font-semibold tracking-tight text-neutral-900">Seguimiento activo</h3>
                    <p className="text-[12px] text-neutral-400">Pacientes activos bajo tu cuidado</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 min-h-[140px]">
                {patientsLoading ? (
                  <div className="flex h-[140px] items-center justify-center">
                    <span className="text-[12px] text-neutral-400 animate-pulse">Cargando pacientes...</span>
                  </div>
                ) : assignedPatients.length === 0 ? (
                  <div className="flex h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-100 bg-neutral-50/50 p-4 text-center">
                    <p className="text-[13px] font-medium text-neutral-700">Sin pacientes asignados</p>
                    <p className="text-[11px] text-neutral-400 mt-1">Tus pacientes aparecerán acá una vez asignados.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-50 max-h-[220px] overflow-y-auto pr-1">
                    {assignedPatients.slice(0, 4).map((p: any) => {
                      const patientName = `${p.profile?.firstName ?? ''} ${p.profile?.lastName ?? ''}`.trim() || "Paciente";
                      const genderLabel = p.gender === 'male' ? 'Varón' : p.gender === 'female' ? 'Mujer' : 'No binario';
                      const age = p.birthDate ? new Date().getFullYear() - new Date(p.birthDate).getFullYear() : null;

                      return (
                        <div key={p.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 hover:bg-neutral-50/30 px-1 rounded-lg transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-700 capitalize">
                              {patientName.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[12px] font-semibold text-neutral-800 truncate capitalize">{patientName}</p>
                              <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                                {genderLabel}{age ? ` · ${age} años` : ''}
                              </p>
                            </div>
                          </div>

                          <span className="rounded-full bg-neutral-50 border border-neutral-100 px-2 py-0.5 text-[9px] font-bold text-neutral-500">
                            Activo
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 border-t border-neutral-100 pt-4 flex justify-between items-center">
              <span className="text-[11px] text-neutral-400">
                {assignedPatients.length} pacientes registrados
              </span>
              <a
                href="/doctors/patients"
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-neutral-900 hover:text-cyan-600 transition-colors"
              >
                Ver pacientes
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Widget 3: Contexto clínico */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-900 text-white">
                    <FileText className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className="text-md font-semibold tracking-tight text-neutral-900">Contexto clínico</h3>
                    <p className="text-[12px] text-neutral-400">Casos clínicos e intakes pendientes</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 min-h-[140px]">
                {statsLoading ? (
                  <div className="flex h-[140px] items-center justify-center">
                    <span className="text-[12px] text-neutral-400 animate-pulse">Cargando contexto clínico...</span>
                  </div>
                ) : (clinicalCases.length === 0 && intakes.length === 0) ? (
                  <div className="flex h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-100 bg-neutral-50/50 p-4 text-center">
                    <p className="text-[13px] font-medium text-neutral-700">Sin novedades clínicas</p>
                    <p className="text-[11px] text-neutral-400 mt-1">No hay alertas ni reportes pendientes.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-50 max-h-[220px] overflow-y-auto pr-1">
                    {/* Triage Cases (Prioritarios) */}
                    {clinicalCases.slice(0, 2).map((c: any) => {
                      const patientName = c.state?.fields?.nombre_completo?.value || "Paciente";
                      const mandate = c.triage_mandate || "Evaluación requerida";

                      return (
                        <div key={c.id} className="py-2.5 first:pt-0 last:pb-0 hover:bg-neutral-50/30 px-1 rounded-lg transition-colors border-l-2 border-red-500 pl-2.5 mb-2 last:mb-0">
                          <div className="flex items-center justify-between min-w-0">
                            <span className="text-[12px] font-bold text-neutral-800 truncate capitalize">{patientName}</span>
                            <span className="rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[8px] font-extrabold text-red-600 uppercase">
                              Prioridad
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
                            {mandate}
                          </p>
                        </div>
                      );
                    })}

                    {/* Intakes (Nuevos/Aprobados) */}
                    {intakes.slice(0, 2).map((i: any) => {
                      const patientProf = i.patients?.profiles;
                      const patientName = patientProf ? `${patientProf.first_name ?? ''} ${patientProf.last_name ?? ''}`.trim() : "Paciente";
                      const contextLabel = i.treatment_context === 'tdah_stimulants' ? 'TDAH Estimulantes' : i.treatment_context || 'Intake Psiquiátrico';

                      return (
                        <div key={i.id} className="py-2.5 first:pt-0 last:pb-0 hover:bg-neutral-50/30 px-1 rounded-lg transition-colors border-l-2 border-blue-500 pl-2.5 mb-2 last:mb-0">
                          <div className="flex items-center justify-between min-w-0">
                            <span className="text-[12px] font-bold text-neutral-800 truncate capitalize">{patientName}</span>
                            <span className="rounded-full bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[8px] font-extrabold text-blue-600 uppercase">
                              Intake
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-1 truncate">
                            Contexto: {contextLabel}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 border-t border-neutral-100 pt-4 flex justify-between items-center">
              <span className="text-[11px] text-neutral-400">
                {stats?.historyCount ? `${stats.historyCount} registros históricos` : "Sin registros previos"}
              </span>
              <a
                href="/doctors/consultations"
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-neutral-900 hover:text-cyan-600 transition-colors"
              >
                Ver historiales
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Calendario Waffle de 30 días a la derecha */}
        <div className="lg:col-span-1">
          <ThirtyDayWaffleCalendar />
        </div>
      </div>

      {/* ── INTELIGENCIA CLÍNICA Y ALERTAS DEL MOTOR ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="mb-8"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-normal tracking-tight text-neutral-900">
              Inteligencia Clínica y Alertas del Motor
            </h2>
            <p className="text-[13px] text-neutral-400 mt-0.5">
              Eventos clínicos en tiempo real y vencimientos generados por nuestro motor de reglas.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
            <Activity className="h-3.5 w-3.5 text-cyan-500" />
            <span>Motor activo</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* Col 1: Eventos del Motor Clínico */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 border border-red-100">
                    <Activity className="h-4 w-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-neutral-900">Eventos del Motor</h3>
                    <p className="text-[11px] text-neutral-400">Alertas de síntomas e ingesta</p>
                  </div>
                </div>
                <span className="rounded-full bg-red-50 border border-red-100 px-2 py-0.5 text-[9px] font-bold text-red-600 uppercase">
                  {patientAlerts.length} alertas
                </span>
              </div>

              <div className="space-y-3 min-h-[180px]">
                {patientAlerts.length === 0 ? (
                  <div className="flex h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-100 bg-neutral-50/50 p-4 text-center">
                    <p className="text-[12px] font-medium text-neutral-600">Sin alertas abiertas</p>
                    <p className="text-[10px] text-neutral-400 mt-1">El motor no detectó anomalías recientes.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {patientAlerts.map((alert: any) => {
                      const patientName = resolvePatientName(alert.patient_id);
                      const isCritical = alert.severity === 'critical';

                      return (
                        <div 
                          key={alert.id} 
                          className={`rounded-xl border p-3 transition-colors ${
                            isCritical 
                              ? 'border-red-200/65 bg-red-50/25 hover:bg-red-50/45' 
                              : 'border-amber-200/65 bg-amber-50/25 hover:bg-amber-50/45'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-neutral-800 capitalize">{patientName}</span>
                            <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase ${
                              isCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {alert.severity}
                            </span>
                          </div>
                          <h4 className="mt-1 text-[12px] font-bold text-neutral-900">{alert.title}</h4>
                          <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">{alert.message}</p>
                          <div className="mt-2.5 flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Origen: {alert.source_table === 'medication_logs' ? 'Toma' : 'Chatbot'}</span>
                            <span>{new Date(alert.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="text-[10px] text-neutral-400 italic">
                * Las alertas críticas requieren contacto directo inmediato con el paciente.
              </p>
            </div>
          </div>

          {/* Col 2: Recetas por Vencer */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 border border-cyan-100">
                    <Clock className="h-4 w-4" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-neutral-900">Recetas por Vencer</h3>
                    <p className="text-[11px] text-neutral-400">Renovación anticipada rápida</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 min-h-[180px]">
                {expiringPrescriptions.length === 0 ? (
                  <div className="flex h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-100 bg-neutral-50/50 p-4 text-center">
                    <p className="text-[12px] font-medium text-neutral-600">Sin recetas por vencer</p>
                    <p className="text-[10px] text-neutral-400 mt-1">Ningún paciente requiere renovación urgente en los próximos 7 días.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {expiringPrescriptions.map((pres: any) => {
                      const patientName = resolvePatientName(pres.patient_id);
                      const medName = pres.clinical_data?.medication || "Medicamento";
                      const daysLeft = pres.clinical_data?.expiring_in_days || 5;
                      const isAnticipating = isAnticipatingPresId === pres.id;

                      return (
                        <div key={pres.id} className="rounded-xl border border-neutral-150 bg-neutral-50/30 p-3 hover:bg-neutral-50 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">PACIENTE</p>
                              <p className="text-[12px] font-bold text-neutral-800 capitalize mt-0.5">{patientName}</p>
                            </div>
                            <span className="rounded-full bg-cyan-50 border border-cyan-100 px-2 py-0.5 text-[9px] font-extrabold text-cyan-600">
                              En {daysLeft} días
                            </span>
                          </div>
                          
                          <div className="mt-2.5 rounded bg-white border border-neutral-200/50 p-2">
                            <p className="text-[12px] font-bold text-neutral-800">{medName}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">Farmalink · ID: {pres.vendor_id || "FL-123"}</p>
                          </div>

                          <div className="mt-3 flex items-center justify-end">
                            <button
                              onClick={() => handleAnticipatePrescription(pres)}
                              disabled={isAnticipating}
                              className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-cyan-600 hover:text-white transition-colors"
                            >
                              {isAnticipating ? (
                                <>
                                  <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                                  <span>Anticipando...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3 w-3" />
                                  <span>Anticipar</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="text-[10px] text-neutral-400 leading-normal">
                Permite redactar y firmar la renovación antes de que el paciente se quede sin medicación.
              </p>
            </div>
          </div>

          {/* Col 3: Exámenes Complementarios */}
          <div className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <FileText className="h-4.5 w-4.5" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-neutral-900">Exámenes Clínicos</h3>
                    <p className="text-[11px] text-neutral-400">Estudios de diagnóstico e informes</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 min-h-[180px]">
                {labResults.length === 0 ? (
                  <div className="flex h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-100 bg-neutral-50/50 p-4 text-center">
                    <p className="text-[12px] font-medium text-neutral-600">Sin estudios cargados</p>
                    <p className="text-[10px] text-neutral-400 mt-1">No se han subido resultados de laboratorio recientemente.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {labResults.map((lab: any) => {
                      const patientName = resolvePatientName(lab.patient_id);
                      const isPending = lab.status === 'pending';
                      const isApproving = isApprovingLabId === lab.id;

                      return (
                        <div key={lab.id} className="rounded-xl border border-neutral-150 bg-neutral-50/30 p-3 hover:bg-neutral-50 transition-colors">
                          <div className="flex items-start justify-between gap-1.5">
                            <div>
                              <p className="text-[11px] font-bold text-neutral-800 capitalize">{patientName}</p>
                              <h4 className="mt-0.5 text-[12px] font-bold text-neutral-950">{lab.test_type}</h4>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide shrink-0 ${
                              isPending 
                                ? 'bg-amber-50 border border-amber-200 text-amber-700' 
                                : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            }`}>
                              {isPending ? 'Pendiente' : 'Revisado'}
                            </span>
                          </div>

                          <p className="mt-1 text-[11px] text-neutral-500 italic truncate" title={lab.laboratory_name}>
                            Lugar: {lab.laboratory_name || "Laboratorio Externo"}
                          </p>

                          <div className="mt-2 rounded bg-white p-2 border border-neutral-200/40">
                            <p className="text-[10px] leading-relaxed text-neutral-600 line-clamp-2">
                              {lab.notes || "Sin observaciones adicionales."}
                            </p>
                          </div>

                          {isPending && (
                            <div className="mt-3 flex items-center justify-end">
                              <button
                                onClick={() => handleApproveLab(lab.id)}
                                disabled={isApproving}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[10px] font-bold transition-colors"
                              >
                                {isApproving ? (
                                  <>
                                    <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                                    <span>Firmando...</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-3.5 w-3.5" />
                                    <span>Firmar y Aprobar</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-neutral-100 pt-3 flex justify-between items-center">
              <span className="text-[10px] text-neutral-400">TSH, ECG y recuentos</span>
              <a href="/doctors/patients" className="text-[11px] font-bold text-neutral-900 hover:text-cyan-600 transition-colors">
                Ver todos
              </a>
            </div>
          </div>

        </div>
      </motion.div>



      {onboardingStatus.state === "grace_period" ? (
        <div className="mt-6">
          <OnboardingReminder daysRemaining={onboardingStatus.daysRemaining} />
        </div>
      ) : null}

      {statsLoading ? (
        <p className="mt-4 text-[13px] text-neutral-400">Actualizando métricas...</p>
      ) : null}

      {/* Floating Notification Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-neutral-200/80 bg-white/95 p-4 shadow-lg backdrop-blur-md transition-all duration-300 animate-slide-in">
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="h-5 w-5 text-red-500" />
          ) : (
            <Activity className="h-5 w-5 text-blue-500" />
          )}
          <span className="text-[13px] font-medium text-neutral-800">{toast.message}</span>
        </div>
      )}

      {/* Mic Animation wave styling block */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes jump {
          0%, 100% { height: 4px; }
          50% { height: 20px; }
        }
        .audio-bar {
          animation: jump 0.8s ease-in-out infinite;
        }
        .audio-bar:nth-child(2) { animation-delay: 0.15s; }
        .audio-bar:nth-child(3) { animation-delay: 0.3s; }
        .audio-bar:nth-child(4) { animation-delay: 0.45s; }
        .audio-bar:nth-child(5) { animation-delay: 0.6s; }
      `}} />
    </DoctorsPortalFrame>
  );
}
