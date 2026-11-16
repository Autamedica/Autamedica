import { useEffect, useRef, useState } from "react";
import {
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
    if (targetUrl) window.location.href = targetUrl;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 animate-pulse ${className}`}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-sky-100" />
          <div>
            <div className="mb-1 h-3.5 w-32 rounded bg-slate-200" />
            <div className="h-2.5 w-20 rounded bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  const startedAt = since
    ? new Date(since).toLocaleTimeString(careCountry === "BR" ? "pt-BR" : "es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className={`rounded-2xl border bg-white p-3 shadow-sm transition-all sm:p-4 ${onDuty ? "border-sky-200" : "border-slate-200"} ${className}`}>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Pill className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {careCountry === "BR" ? "Plantão de Farmácia" : "Guardia de Farmacia"}
              </h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${onDuty ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
                {onDuty
                  ? careCountry === "BR" ? "Em plantão" : "De guardia"
                  : careCountry === "BR" ? "Inativo" : "Inactiva"}
              </span>
              {onDuty && startedAt && <span className="text-xs text-slate-500">Desde {startedAt}</span>}
            </div>
            {!onDuty && (
              <p className="text-xs text-slate-500">
                {careCountry === "BR"
                  ? "Ative o plantão para receber pacientes das farmácias"
                  : "Activá la guardia para recibir pacientes de farmacias"}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center">
          {onDuty && (
            <button
              type="button"
              onClick={() => void refreshQueue()}
              title={careCountry === "BR" ? "Atualizar solicitações" : "Actualizar solicitudes"}
              aria-label={careCountry === "BR" ? "Atualizar solicitações" : "Actualizar solicitudes"}
              className="rounded-lg p-2 text-sky-700 transition hover:bg-sky-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={toggling}
            onClick={() => void toggleDuty(!onDuty)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition disabled:opacity-50 ${onDuty ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "bg-sky-600 text-white hover:bg-sky-700"}`}
          >
            {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
            <span>
              {onDuty
                ? "Pausar"
                : careCountry === "BR" ? "Iniciar plantão" : "Iniciar guardia"}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {onDuty && !compact && (
        <section className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-slate-800">
                {careCountry === "BR" ? "Solicitações" : "Solicitudes"}
              </h4>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${queueCount > 0 ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>
                {queueCount}
              </span>
            </div>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="text-xs font-semibold text-sky-700 transition hover:text-sky-900"
            >
              {expanded
                ? careCountry === "BR" ? "Recolher" : "Ocultar"
                : careCountry === "BR" ? "Ver solicitações" : "Ver solicitudes"}
            </button>
          </div>

          {expanded && queueCount === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
              <p className="text-xs font-medium text-slate-600">
                {careCountry === "BR" ? "Nenhuma solicitação pendente." : "No hay solicitudes pendientes."}
              </p>
            </div>
          )}

          {expanded && queueCount > 0 && (
            <div className="space-y-2.5">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-sky-200 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <User className="h-3.5 w-3.5 text-slate-500" />
                        {item.patientName}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ({careCountry === "BR" ? "CPF" : "DNI"} •••• {item.patientDni.slice(-4)})
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                        <Building2 className="h-3 w-3 text-sky-600" />
                        {careCountry === "BR" ? "Farmácia / Quiosque On-Demand" : item.pharmacyName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                      <span className="flex min-w-0 flex-wrap items-center gap-1 font-medium text-sky-700">
                        <FileText className="h-3 w-3 text-sky-600" />
                        <span className="break-words">{item.reason}</span>
                      </span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="h-3 w-3" />
                        {careCountry === "BR"
                          ? `Aguardando há ${item.minutesWaiting} min`
                          : `Esperando hace ${item.minutesWaiting} min`}
                        {item.expiresAt &&
                          ` · ${careCountry === "BR" ? "Expira em" : "Expira en"} ${Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 1000))}s`}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      disabled={!item.offerId || decliningId === item.id}
                      onClick={() => void declinePatient(item.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {decliningId === item.id
                        ? careCountry === "BR" ? "Recusando..." : "Rechazando..."
                        : careCountry === "BR" ? "Recusar" : "Rechazar"}
                    </button>
                    <button
                      type="button"
                      disabled={claimingId === item.id}
                      onClick={() => void handleClaim(item.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50"
                    >
                      {claimingId === item.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Conectando...</span>
                        </>
                      ) : (
                        <>
                          <Video className="h-3.5 w-3.5" />
                          <span>{careCountry === "BR" ? "Atender paciente" : "Atender paciente"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
