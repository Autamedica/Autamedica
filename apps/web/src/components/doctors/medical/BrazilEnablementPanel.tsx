"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type {
  BrazilEnablementSummary,
  EnablementStageStatus,
  IcpBrasilStatus,
  IcpProvider,
  SncrB1Status,
} from "@/lib/prescriptions/brazil/brazil-enablement";

const STAGE_BADGE: Record<EnablementStageStatus, { label: string; classes: string }> = {
  verified: {
    label: "Habilitado",
    classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  in_review: {
    label: "Em análise",
    classes: "border-amber-200 bg-amber-50 text-amber-800",
  },
  pending: {
    label: "Pendente",
    classes: "border-neutral-200 bg-neutral-100 text-neutral-600",
  },
};

const BR_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

export function BrazilEnablementPanel() {
  const [summary, setSummary] = useState<BrazilEnablementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [address, setAddress] = useState("");
  const [icpProvider, setIcpProvider] = useState<string>("cfm_cloud_a3");
  const [icpStatus, setIcpStatus] = useState<string>("not_started");
  const [sncrUf, setSncrUf] = useState<string>("");
  const [sncrMunicipality, setSncrMunicipality] = useState("");
  const [sncrStatus, setSncrStatus] = useState<string>("not_requested");

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/doctors/brazil/enablement", {
        credentials: "include",
      });
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: BrazilEnablementSummary;
      } | null;
      if (body?.success && body.data) {
        const data = body.data;
        setSummary(data);
        setAddress(data.profile.professionalAddress ?? "");
        setIcpProvider(data.credentials.icpProvider ?? "cfm_cloud_a3");
        setIcpStatus(
          ["not_started", "requested_cfm_free", "self_reported_active"].includes(
            data.credentials.icpBrasilStatus,
          )
            ? data.credentials.icpBrasilStatus
            : "self_reported_active",
        );
        setSncrUf(data.credentials.sncrVisaUf ?? data.crm.uf ?? "");
        setSncrMunicipality(data.credentials.sncrVisaMunicipality ?? "");
        setSncrStatus(
          ["not_requested", "visa_requested", "self_reported_active", "depleted"].includes(
            data.credentials.sncrB1Status,
          )
            ? data.credentials.sncrB1Status
            : "self_reported_active",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleSave = async (overrides?: {
    icpBrasilStatus?: Extract<IcpBrasilStatus, "not_started" | "requested_cfm_free" | "self_reported_active">;
    sncrB1Status?: Extract<SncrB1Status, "not_requested" | "visa_requested" | "self_reported_active" | "depleted">;
  }) => {
    setSaving(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const payload: Record<string, unknown> = {
        icpProvider: (icpProvider || null) as IcpProvider | null,
        icpBrasilStatus: overrides?.icpBrasilStatus ?? icpStatus,
        sncrB1Status: overrides?.sncrB1Status ?? sncrStatus,
        sncrVisaUf: sncrUf || null,
        sncrVisaMunicipality: sncrMunicipality.trim() || null,
      };
      if (address.trim().length >= 5) {
        payload.professionalAddress = address.trim();
      }
      const res = await fetch("/api/doctors/brazil/enablement", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: BrazilEnablementSummary;
        error?: string;
      } | null;
      if (!res.ok || !body?.success || !body.data) {
        setErrorMsg(body?.error ?? "Não foi possível salvar a habilitação.");
        return;
      }
      setSummary(body.data);
      setFeedback("Progresso atualizado. Você já pode atender consultas e receitas simples enquanto conclui as etapas.");
    } catch {
      setErrorMsg("Falha de rede ao atualizar habilitação.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando habilitação profissional Brasil...
      </div>
    );
  }

  if (!summary) return null;

  return (
    <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-am-primary-50 text-am-primary-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              Habilitação Profissional Brasil ({summary.completedStages}/{summary.totalStages} etapas)
            </h2>
            <p className="text-xs text-neutral-500">
              Receita simples: {summary.capabilities.canIssueSimpleRx ? "Liberada" : "Em configuração"} ·
              RCE/RET + Atestado ICP-Brasil: {summary.capabilities.canIssueRceRetRx ? "Liberado" : "Pendente"} ·
              Controlado B1 (Azul): {summary.capabilities.canIssueControlledB1 ? "Liberado" : "Opcional"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          {expanded ? "Ocultar etapas" : "Gerenciar certificado e B1"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {summary.stages.map((stage) => {
              const badge = STAGE_BADGE[stage.status];
              return (
                <div
                  key={stage.key}
                  className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-neutral-900">
                      {stage.step}. {stage.title}
                    </span>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.classes}`}>
                      {stage.status === "verified" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
                    {stage.description}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={summary.links.cfmFreeCertificateUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (icpStatus === "not_started") setIcpStatus("requested_cfm_free");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-am-primary-200 bg-am-primary-50 px-3 py-2 text-xs font-semibold text-am-primary-800 hover:bg-am-primary-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Solicitar certificado ICP-Brasil gratuito (CFM)
            </a>
            <a
              href={summary.links.anvisaSncrGuideUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (sncrStatus === "not_requested") setSncrStatus("visa_requested");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Como solicitar numeração B1 na VISA/SNCR
            </a>
          </div>

          <div className="grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-xs">
              <span className="font-medium text-neutral-700">Endereço profissional (rodapé da receita)</span>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, número, bairro - Cidade/UF"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900"
              />
            </label>

            <label className="block text-xs">
              <span className="font-medium text-neutral-700">Provedor ICP-Brasil</span>
              <select
                value={icpProvider}
                onChange={(e) => setIcpProvider(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900"
              >
                <option value="cfm_cloud_a3">Certificado em nuvem CFM (A3 gratuito)</option>
                <option value="vidaas">VIDaaS</option>
                <option value="birdid">BirdID</option>
                <option value="safeid">SafeID</option>
                <option value="other_icp_brasil">Outro ICP-Brasil</option>
              </select>
            </label>

            <label className="block text-xs">
              <span className="font-medium text-neutral-700">Situação do certificado ICP-Brasil</span>
              <select
                value={icpStatus}
                onChange={(e) => setIcpStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900"
              >
                <option value="not_started">Não iniciado</option>
                <option value="requested_cfm_free">Solicitado no portal CFM</option>
                <option value="self_reported_active">Já ativo (aguardando confirmação)</option>
              </select>
            </label>

            <label className="block text-xs">
              <span className="font-medium text-neutral-700">UF da VISA / SNCR (Cota B1)</span>
              <select
                value={sncrUf}
                onChange={(e) => setSncrUf(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900"
              >
                <option value="">Selecionar UF</option>
                {BR_UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="font-medium text-neutral-700">Município da VISA</span>
              <input
                type="text"
                value={sncrMunicipality}
                onChange={(e) => setSncrMunicipality(e.target.value)}
                placeholder="Ex.: Porto Alegre"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900"
              />
            </label>

            <label className="block text-xs">
              <span className="font-medium text-neutral-700">Situação cota B1 (SNCR)</span>
              <select
                value={sncrStatus}
                onChange={(e) => setSncrStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900"
              >
                <option value="not_requested">Não solicitada (opcional para simples/RCE)</option>
                <option value="visa_requested">Solicitada na VISA</option>
                <option value="self_reported_active">Numeração B1 ativa no prescritor</option>
                <option value="depleted">Cota esgotada</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              {feedback && <span className="font-medium text-emerald-700">{feedback}</span>}
              {errorMsg && <span className="font-medium text-red-600">{errorMsg}</span>}
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-am-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-am-primary-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar progresso BR
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
