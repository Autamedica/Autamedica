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
          ? "bg-[#0F2537] border-sky-400/50 shadow-xl shadow-slate-950/20"
          : "bg-[#0F2537] border-white/10 shadow-md"
      } p-4 sm:p-5 ${className}`}
    >
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
              onDuty
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                : "bg-am-surface-700 text-slate-300"
            }`}
          >
            <Pill className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                {careCountry === "BR"
                  ? "Plantão de Farmácia / Consultas Expressas"
                  : "Guardia Farmacia / Consultas Exprés"}
              </h3>
              {onDuty ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  {careCountry === "BR" ? "Em Plantão" : "CONECTADO A GUARDIA"}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-am-surface-700/60 text-am-surface-400 text-[10px] font-medium">
                  {careCountry === "BR" ? "Inativo" : "Guardia inactiva"}
                </span>
              )}
            </div>
            <p className="text-xs text-am-surface-400">
              {onDuty
                ? careCountry === "BR"
                  ? `Plantão conectado · Radar ativo · Disponível para receitas e teleconsultas imediatas ${since ? `• desde ${new Date(since).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`
                  : `Guardia conectada · Radar activo · Disponible para recetas y videoconsultas inmediatas ${since ? `• desde ${new Date(since).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}`
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
              className="p-2 rounded-xl bg-am-surface-700/50 hover:bg-am-surface-700 text-am-surface-300 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={toggling}
            onClick={() => void toggleDuty(!onDuty)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-md ${
              onDuty
                ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40"
                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-950/30"
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
                  ? "Pausar plantão"
                  : "Pausar guardia"
                : careCountry === "BR"
                  ? "Iniciar plantão"
                  : "Iniciar guardia"}
            </span>
          </button>
        </div>
      </div>

      {onDuty && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-medium text-emerald-200">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {careCountry === "BR" ? "Em Plantão · Radar ativo" : "Guardia activa · Radar activo"}
        </div>
      )}

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
              <span className="text-xs font-semibold text-slate-100">
                {careCountry === "BR" ? "Radar ao Vivo" : "Radar de Guardia"}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  queueCount > 0
                    ? "bg-emerald-500 text-white animate-pulse"
                    : "bg-am-surface-700 text-am-surface-400"
                }`}
              >
                {queueCount}
              </span>
              {queueCount > 0 && (
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300">
                  {careCountry === "BR" ? "OFERTA RECEBIDA" : "OFERTA ENTRANTE"}
                </span>
              )}
            </div>

            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="text-xs font-semibold text-sky-300 hover:text-sky-200 transition"
            >
              {expanded
                ? careCountry === "BR"
                  ? "Recolher radar"
                  : "Ocultar radar"
                : careCountry === "BR"
                  ? "Ver ofertas"
                  : "Ver ofertas"}
            </button>
          </div>

          {queueCount === 0
            ? expanded && (
                <div className="py-5 px-4 rounded-xl bg-white/5 border border-white/10 text-center flex flex-col items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-400/60 mb-1.5 animate-pulse" />
                  <p className="text-xs text-slate-200 font-medium">
                    {careCountry === "BR"
                      ? "Radar ativo · Sem solicitações pendentes"
                      : "Radar activo · Sin solicitudes pendientes"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {careCountry === "BR"
                      ? "Você receberá um alerta quando uma farmácia enviar uma solicitação."
                      : "Recibirás una alerta cuando una farmacia envíe una solicitud."}
                  </p>
                </div>
              )
            : expanded && (
                <div className="space-y-2.5">
                  {queue.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-sky-400/50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-am-surface-400" />
                            {item.patientName}
                          </span>
                          <span className="text-[11px] text-am-surface-400">
                            ({careCountry === "BR" ? "CPF" : "DNI"} •••• {item.patientDni.slice(-4)}
                            )
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-am-surface-800 text-am-surface-300 border border-am-surface-700">
                            <Building2 className="w-3 h-3 text-am-primary-400" />
                            {careCountry === "BR"
                              ? "Farmácia / Quiosque On-Demand"
                              : item.pharmacyName}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-am-surface-300">
                          <span className="flex items-center gap-1 text-sky-200 font-medium min-w-0 flex-wrap">
                            <FileText className="w-3 h-3 text-am-primary-400" />
                            <span className="break-words">{item.reason}</span>
                          </span>
                          <span className="flex items-center gap-1 text-am-surface-400">
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
                            className="rounded-xl border border-rose-300/40 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-50"
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
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow-md shadow-emerald-950/30 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
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
