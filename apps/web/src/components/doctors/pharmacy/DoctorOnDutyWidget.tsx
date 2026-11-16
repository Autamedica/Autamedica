import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Building2,
  Clock,
  FileText,
  Loader2,
  Pill,
  Power,
  RefreshCw,
  User,
  Video,
} from "lucide-react";
import { useDoctorOnDuty } from "@/hooks/doctors/useDoctorOnDuty";

interface DoctorOnDutyWidgetProps {
  className?: string;
  compact?: boolean;
  careCountry?: "AR" | "BR";
}

export function DoctorOnDutyWidget({
  className = "",
  compact = false,
  careCountry: providedCareCountry,
}: DoctorOnDutyWidgetProps) {
  const {
    onDuty,
    careCountry: queueCareCountry,
    since,
    loading,
    toggling,
    claimingId,
    decliningId,
    declinePatient,
    queue,
    queueCount,
    error,
    toggleDuty,
    claimPatient,
    refreshQueue,
  } = useDoctorOnDuty(providedCareCountry);

  const careCountry = providedCareCountry ?? queueCareCountry;
  const [expanded, setExpanded] = useState(false);
  const previousQueueCountRef = useRef(0);

  useEffect(() => {
    if (queueCount > 0 && queueCount > previousQueueCountRef.current) setExpanded(true);
    else if (queueCount === 0) setExpanded(false);
    previousQueueCountRef.current = queueCount;
  }, [queueCount]);

  const handleClaim = async (requestId: string) => {
    const result = await claimPatient(requestId);
    const targetUrl =
      result?.doctorRoomUrl ||
      (result?.roomId ? `/doctors/call/${encodeURIComponent(result.roomId)}` : null);
    if (targetUrl) {
      // Direct navigation to doctor videocall room
      window.location.href = targetUrl;
    }
  };

  if (loading) {
    return (
      <div
        className={`p-4 rounded-2xl bg-am-surface-800/80 border border-am-surface-700/60 animate-pulse flex items-center justify-between ${className}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-am-surface-700/60" />
          <div>
            <div className="w-32 h-3.5 bg-am-surface-700/60 rounded mb-1" />
            <div className="w-20 h-2.5 bg-am-surface-700/40 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 ${
        onDuty
          ? "bg-white border-sky-200 shadow-sm"
          : "bg-white border-slate-200 shadow-sm"
      } p-3 sm:p-4 ${className}`}
    >
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
              onDuty
                ? "bg-sky-50 text-sky-600"
                : "bg-sky-50 text-sky-600"
            }`}
          >
            <Pill className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {careCountry === "BR"
                  ? "Plantão de Farmácia"
                  : "Guardia de Farmacia"}
              </h3>
              {onDuty ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  {careCountry === "BR" ? "Em Plantão" : "De guardia"}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
                  {careCountry === "BR" ? "Inativo" : "Guardia inactiva"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {onDuty
                ? careCountry === "BR"
                  ? `${since ? `• desde ${new Date(since).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`
                  : `${since ? `• desde ${new Date(since).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}`
                : careCountry === "BR"
                  ? "Ative o plantão para receber pacientes das farmácias"
                  : "Activá la guardia para recibir pacientes de farmacias"}
            </p>
          </div>
        </div>

        {/* Action Toggle Switch */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {onDuty && (
            <button
              type="button"
              onClick={() => void refreshQueue()}
              title={careCountry === "BR" ? "Atualizar fila" : "Actualizar cola"}
              className="rounded-lg p-2 text-sky-700 hover:bg-sky-50 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={toggling}
            onClick={() => void toggleDuty(!onDuty)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-md ${
              onDuty
                ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                : "bg-sky-600 hover:bg-sky-700 text-white shadow-sky-900/10"
            } disabled:opacity-50`}
          >
            {toggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            <span>
              {onDuty
                ? careCountry === "BR"
                  ? "Pausar"
                  : "Pausar"
                : careCountry === "BR"
                  ? "Iniciar plantão"
                  : "Iniciar guardia"}
            </span>
          </button>
        </div>
      </div>

      {onDuty && (
        

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Queue View when On-Duty */}
      {onDuty && !compact && (
        <div className="mt-4 pt-4 border-t border-am-surface-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-800">
                {careCountry === "BR" ? "Solicitações" : "Solicitudes"}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  queueCount > 0
                    ? "bg-sky-100 text-sky-800"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {queueCount}
              </span>
              {queueCount > 0 && (
                
            </div>

            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="text-xs font-semibold text-sky-700 hover:text-sky-900 transition"
            >
              {expanded
                ? careCountry === "BR"
                  ? "Recolher"
                  : "Ocultar"
                : careCountry === "BR"
                  ? "Ver solicitações"
                  : "Ver solicitações"}
            </button>
          </div>

          {queueCount === 0
            ? expanded && (
                <div className="py-5 px-4 rounded-xl bg-white/5 border border-white/10 text-center flex flex-col items-center justify-center">
                  <p className="text-xs font-medium text-slate-600">{careCountry === "BR" ? "Nenhuma solicitação pendente." : "No hay solicitudes pendientes."}</p>
                </div>
              )
            : expanded && (
                <div className="space-y-2.5">
                  {queue.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-white hover:border-sky-200 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            {item.patientName}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            ({careCountry === "BR" ? "CPF" : "DNI"} •••• {item.patientDni.slice(-4)}
                            )
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200">
                            <Building2 className="w-3 h-3 text-am-primary-400" />
                            {careCountry === "BR"
                              ? "Farmácia / Quiosque On-Demand"
                              : item.pharmacyName}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-600">
                          <span className="flex items-center gap-1 text-sky-700 font-medium min-w-0 flex-wrap">
                            <FileText className="w-3 h-3 text-am-primary-400" />
                            <span className="break-words">{item.reason}</span>
                          </span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <Clock className="w-3 h-3" />
                            {careCountry === "BR"
                              ? `Aguardando há ${item.minutesWaiting} min`
                              : `Esperando hace ${item.minutesWaiting} min`}
                            {item.expiresAt &&
                              ` · ${careCountry === "BR" ? "Expira em" : "Expira en"} ${Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 1000))}s`}
                          </span>
                        </div>
                      </div>

                      <div className="self-end sm:self-center">
                        <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            disabled={!item.offerId || decliningId === item.id}
                            onClick={() => void declinePatient(item.id)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-rose-400/20 disabled:opacity-50"
                          >
                            {decliningId === item.id
                              ? careCountry === "BR"
                                ? "Recusando..."
                                : "Rechazando..."
                              : careCountry === "BR"
                                ? "Recusar"
                                : "Rechazar"}
                          </button>
                          <button
                            type="button"
                            disabled={claimingId === item.id}
                            onClick={() => void handleClaim(item.id)}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-md shadow-emerald-950/30 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                          >
                            {claimingId === item.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>
                                  {careCountry === "BR" ? "Conectando..." : "Conectando..."}
                                </span>
                              </>
                            ) : (
                              <>
                                <Video className="w-3.5 h-3.5" />
                                <span>
                                  {careCountry === "BR" ? "Atender Paciente" : "Atender paciente"}
                                </span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>
      )}
    </div>
  );
}
