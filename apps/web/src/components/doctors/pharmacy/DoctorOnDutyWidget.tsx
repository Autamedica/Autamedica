import {
  Activity,
  AlertCircle,
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
  const sinceLabel = since
    ? new Date(since).toLocaleTimeString(careCountry === "BR" ? "pt-BR" : "es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const handleClaim = async (requestId: string) => {
    const result = await claimPatient(requestId);
    const targetUrl =
      result?.doctorRoomUrl ||
      (result?.roomId ? `/doctors/call/${encodeURIComponent(result.roomId)}` : null);
    if (targetUrl) {
      window.location.href = targetUrl;
    }
  };

  if (loading) {
    return (
      <div
        className={`flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 animate-pulse ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-slate-100" />
          <div>
            <div className="mb-1 h-3 w-32 rounded bg-slate-100" />
            <div className="h-2 w-20 rounded bg-slate-50" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label={careCountry === "BR" ? "Plantão de Farmácia" : "Guardia de farmacia"}
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm ${className}`}
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F5FD] text-[#087FB9]">
            <Pill className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-[#0F2537]">
                {careCountry === "BR" ? "Plantão de Farmácia" : "Guardia de farmacia"}
              </h3>
              {onDuty && (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
                  {careCountry === "BR" ? "Em plantão" : "En guardia"}
                  {sinceLabel ? <> · {sinceLabel}</> : null}
                </span>
              )}
            </div>
            {!onDuty && (
              <p className="mt-0.5 text-[10px] text-slate-500">
                {careCountry === "BR"
                  ? "Ative o plantão para receber solicitações"
                  : "Activá la guardia para recibir solicitudes"}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {onDuty && (
            <button
              type="button"
              onClick={() => void refreshQueue()}
              title={careCountry === "BR" ? "Atualizar" : "Actualizar"}
              aria-label={careCountry === "BR" ? "Atualizar" : "Actualizar"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            disabled={toggling}
            onClick={() => void toggleDuty(!onDuty)}
            className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition disabled:opacity-50 ${
              onDuty
                ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                : "bg-[#087FB9] text-white hover:bg-[#066FA5]"
            }`}
          >
            {toggling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Power className="h-3.5 w-3.5" aria-hidden="true" />
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
      </header>

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {onDuty && !compact && (
        <div className="mt-3 border-t border-slate-100 pt-3" aria-live="polite">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-xs font-semibold text-[#0F2537]">
              {careCountry === "BR" ? "Solicitações" : "Solicitudes"}
            </h4>
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700">
              {queueCount}
            </span>
          </div>

          {queueCount === 0 ? (
            <div className="rounded-lg bg-slate-50 px-3 py-3 text-center">
              <Activity className="mx-auto mb-1 h-4 w-4 text-sky-600" aria-hidden="true" />
              <p className="text-[11px] font-medium text-slate-600">
                {careCountry === "BR"
                  ? "Nenhuma solicitação pendente"
                  : "No hay solicitudes pendientes"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {queue.map((item) => (
                <article
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F2537]">
                        <User className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {item.patientName}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {careCountry === "BR" ? "CPF" : "DNI"} •••• {item.patientDni.slice(-4)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <FileText className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="break-words">{item.reason}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {careCountry === "BR"
                          ? `Aguardando há ${item.minutesWaiting} min`
                          : `Esperando hace ${item.minutesWaiting} min`}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      disabled={!item.offerId || decliningId === item.id}
                      onClick={() => void declinePatient(item.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-sky-700 active:scale-[0.98] disabled:opacity-50"
                    >
                      {claimingId === item.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          <span>Conectando...</span>
                        </>
                      ) : (
                        <>
                          <Video className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{careCountry === "BR" ? "Atender paciente" : "Atender paciente"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
