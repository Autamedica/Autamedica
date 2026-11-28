import {useEffect, useState} from 'react';
import {MemedPrescriptionWidget} from './MemedPrescriptionWidget';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MemedBridgeEventType = 'ready' | 'session_expired' | 'clinical_denied' | 'provider_error';

type MemedBridgeEventPayload = {
  type: MemedBridgeEventType;
  code?: string;
  status?: number;
  message?: string;
};

type AndroidMemedBridgeWindow = Window & {
  AutamedicaMemedBridge?: {
    onBridgeState?: (payload: string) => void;
  };
};

type State = {
  status: 'loading' | 'ready' | 'session_expired' | 'error';
  patientId?: string;
  requestId?: string;
  errorCode?: string;
  error?: string;
};

function hasAndroidBridge(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as AndroidMemedBridgeWindow).AutamedicaMemedBridge?.onBridgeState === 'function';
}

function notifyAndroidBridge(payload: MemedBridgeEventPayload): void {
  if (typeof window === 'undefined') return;
  try {
    (window as AndroidMemedBridgeWindow).AutamedicaMemedBridge?.onBridgeState?.(
      JSON.stringify(payload),
    );
  } catch {
    // Ignore bridge failures when running in a standard browser tab.
  }
}

function mapClinicalDenialMessage(code: string | undefined): {
  kind: 'clinical_denied' | 'provider_error';
  message: string;
} {
  switch (code) {
    case 'memed_mobile_not_enabled':
      return {
        kind: 'clinical_denied',
        message: 'A emissão digital móvel está temporariamente indisponível para esta conta.',
      };
    case 'active_doctor_profile_required':
    case 'memed_pilot_doctor_required':
      return {
        kind: 'clinical_denied',
        message: 'Seu perfil médico ainda não está habilitado para emissão digital no Brasil.',
      };
    case 'verified_crm_required':
      return {
        kind: 'clinical_denied',
        message: 'Sua matrícula CRM/CFM precisa estar validada para emitir documentos digitais.',
      };
    case 'clinical_encounter_required':
    case 'doctor_patient_access_required':
      return {
        kind: 'clinical_denied',
        message: 'Atendimento clínico ou vínculo médico-paciente inválido para esta emissão.',
      };
    case 'memed_patient_country_required':
      return {
        kind: 'clinical_denied',
        message: 'Este paciente não pertence ao escopo clínico Brasil para emissão Memed.',
      };
    case 'memed_patient_consent_required':
      return {
        kind: 'clinical_denied',
        message: 'O paciente precisa confirmar o consentimento LGPD antes da emissão.',
      };
    case 'memed_patient_identity_incomplete':
    case 'memed_patient_demographics_invalid':
      return {
        kind: 'clinical_denied',
        message: 'Cadastro do paciente incompleto (CPF ou dados obrigatórios pendentes).',
      };
    default:
      return {
        kind: 'provider_error',
        message: 'Não foi possível autorizar esta emissão no provedor Memed.',
      };
  }
}

/** Dedicated narrow-screen doctor flow. NEVER accepts patientId directly from URL. */
export function MemedMobileRoute() {
  const [state, setState] = useState<State>({status: 'loading'});
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const appointmentId = params.get('appointmentId') ?? '';
    const requestId = params.get('requestId') ?? '';
    const patientIdParam = params.get('patientId') ?? '';
    const isAppointment = UUID.test(appointmentId) && !requestId && !patientIdParam;
    const isDispatch = UUID.test(requestId) && !appointmentId && !patientIdParam;
    const isPatient = UUID.test(patientIdParam) && !appointmentId && !requestId;

    if (!isAppointment && !isDispatch && !isPatient) {
      const errorMessage = 'Consulta ou paciente inválido.';
      setState({status: 'error', errorCode: 'INVALID_ENCOUNTER', error: errorMessage});
      notifyAndroidBridge({type: 'clinical_denied', code: 'INVALID_ENCOUNTER', message: errorMessage});
      return () => controller.abort();
    }

    const encounterQuery = isAppointment
      ? 'appointmentId=' + encodeURIComponent(appointmentId)
      : isDispatch
        ? 'requestId=' + encodeURIComponent(requestId)
        : 'patientId=' + encodeURIComponent(patientIdParam);

    void fetch('/api/doctors/prescriptions/memed-mobile-context?' + encounterQuery, {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    })
      .then(async response => {
        const redirectedPath = response.redirected
          ? new URL(response.url, window.location.origin).pathname
          : '';
        const isRedirectedToAuth =
          response.type === 'opaqueredirect' ||
          (response.status >= 300 && response.status < 400) ||
          redirectedPath === '/auth/login';

        if (response.status === 401 || isRedirectedToAuth) {
          if (controller.signal.aborted) return;
          const message = 'Sessão médica expirada ou não autenticada no emissor.';
          setState({status: 'session_expired', errorCode: 'SESSION_EXPIRED', error: message});
          notifyAndroidBridge({
            type: 'session_expired',
            code: 'SESSION_EXPIRED',
            status: response.status,
            message,
          });
          return;
        }

        const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
        if (!response.ok) {
          let apiCode: string | undefined;
          if (isJson) {
            const payload = (await response.json().catch(() => null)) as
              | {error?: {code?: string; message?: string}}
              | null;
            apiCode = payload?.error?.message ?? payload?.error?.code;
          }
          if (response.status === 403 || response.status === 400) {
            const mapped = mapClinicalDenialMessage(apiCode);
            const code = apiCode ?? (response.status === 403 ? 'CLINICAL_FORBIDDEN' : 'CLINICAL_BAD_REQUEST');
            if (controller.signal.aborted) return;
            setState({status: 'error', errorCode: code, error: mapped.message});
            notifyAndroidBridge({
              type: mapped.kind,
              code,
              status: response.status,
              message: mapped.message,
            });
            return;
          }
          const providerCode = apiCode ?? `PROVIDER_HTTP_${response.status}`;
          const providerMsg = 'Serviço do emissor digital indisponível no momento.';
          if (controller.signal.aborted) return;
          setState({status: 'error', errorCode: providerCode, error: providerMsg});
          notifyAndroidBridge({
            type: 'provider_error',
            code: providerCode,
            status: response.status,
            message: providerMsg,
          });
          return;
        }

        if (!isJson) {
          const msg = 'Resposta inesperada do servidor do emissor digital.';
          if (!controller.signal.aborted) {
            setState({status: 'error', errorCode: 'NON_JSON_RESPONSE', error: msg});
            notifyAndroidBridge({type: 'provider_error', code: 'NON_JSON_RESPONSE', message: msg});
          }
          return;
        }

        const json: {data?: {patientId?: string}} = await response.json();
        if (!json.data?.patientId || !UUID.test(json.data.patientId)) {
          const msg = 'Paciente não validado para emissão digital.';
          if (!controller.signal.aborted) {
            setState({status: 'error', errorCode: 'PATIENT_NOT_VALIDATED', error: msg});
            notifyAndroidBridge({type: 'clinical_denied', code: 'PATIENT_NOT_VALIDATED', message: msg});
          }
          return;
        }

        if (!controller.signal.aborted) {
          setState({
            status: 'ready',
            patientId: json.data.patientId,
            requestId: isDispatch ? requestId : undefined,
          });
          notifyAndroidBridge({type: 'ready'});
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        const msg = 'Falha de conexão ao validar a sessão do emissor digital.';
        setState({status: 'error', errorCode: 'NETWORK_OR_PROVIDER_ERROR', error: msg});
        notifyAndroidBridge({
          type: 'provider_error',
          code: 'NETWORK_OR_PROVIDER_ERROR',
          message: msg,
        });
      });

    return () => controller.abort();
  }, [revision]);

  // The native Activity is singleTop and handles autamedica:// without changing
  // the active video-call route. Do not put an appointment ID or JWT in this link.
  const returnToApp = () => {
    window.location.assign('autamedica://return');
  };

  const onEvent = async (action: 'issued' | 'deleted', prescriptionId: string) => {
    if (state.status !== 'ready' || !state.patientId) throw new Error('Sessão não autorizada');
    const response = await fetch('/api/doctors/prescriptions/memed-event', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action,
        patientId: state.patientId,
        prescriptionId,
        ...(state.requestId ? {requestId: state.requestId} : {}),
      }),
    });
    if (
      response.type === 'opaqueredirect' ||
      response.status === 401 ||
      (response.status >= 300 && response.status < 400)
    ) {
      notifyAndroidBridge({
        type: 'session_expired',
        code: 'EVENT_SESSION_EXPIRED',
        status: response.status,
        message: 'Sessão expirada ao sincronizar evento Memed.',
      });
      throw new Error('Sessão médica expirada ao registrar a receita digital.');
    }
    if (!response.ok) throw new Error('Falha ao confirmar evento da receita digital.');
  };

  if (state.status === 'loading') {
    return <main className="p-6 text-sm text-slate-700" role="status">Verificando médico e consulta…</main>;
  }

  if (state.status === 'session_expired') {
    const insideAndroid = hasAndroidBridge();
    return (
      <main className="mx-auto max-w-md p-6" role="alert">
        <h1 className="text-xl font-semibold text-slate-900">Sessão médica expirada</h1>
        <p className="mt-3 text-sm text-slate-700">
          {state.error ?? 'Sua sessão web no emissor expirou. Renove a conexão sem sair da AutaMedica.'}
        </p>
        {state.errorCode && (
          <p className="mt-2 text-xs font-mono text-slate-500">Código: {state.errorCode}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded bg-blue-700 px-4 py-3 text-sm font-medium text-white"
            onClick={() => {
              if (insideAndroid) {
                notifyAndroidBridge({
                  type: 'session_expired',
                  code: 'SESSION_RETRY_REQUESTED',
                  message: 'Solicitando nova troca de sessão ao app Android.',
                });
              } else {
                const returnTo = window.location.pathname + window.location.search;
                window.location.assign('/auth/login?role=doctor&returnTo=' + encodeURIComponent(returnTo));
              }
            }}
          >
            {insideAndroid ? 'Renovar sessão no app' : 'Entrar como médico'}
          </button>
          <button
            type="button"
            className="rounded border px-4 py-3 text-sm text-slate-700"
            onClick={() => {
              setState({status: 'loading'});
              setRevision(x => x + 1);
            }}
          >
            Tentar novamente
          </button>
          {insideAndroid && (
            <button
              type="button"
              className="rounded border px-4 py-3 text-sm text-slate-700"
              onClick={returnToApp}
            >
              Voltar à AutaMedica
            </button>
          )}
        </div>
      </main>
    );
  }

  if (state.status === 'error' || !state.patientId) {
    return (
      <main className="mx-auto max-w-md p-6" role="alert">
        <h1 className="font-semibold text-slate-900">Receituário indisponível</h1>
        <p className="mt-2 text-sm text-slate-700">{state.error ?? 'Acesso clínico não confirmado.'}</p>
        {state.errorCode && (
          <p className="mt-2 text-xs font-mono text-slate-500">Código: {state.errorCode}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white"
            onClick={() => {
              setState({status: 'loading'});
              setRevision(x => x + 1);
            }}
          >
            Tentar novamente
          </button>
          <button type="button" className="rounded border px-4 py-2 text-sm text-slate-700" onClick={returnToApp}>
            Voltar à AutaMedica
          </button>
        </div>
      </main>
    );
  }

  return (
    <MemedPrescriptionWidget
      mobileFullscreen
      patientId={state.patientId}
      requestId={state.requestId}
      onPrescriptionSaved={id => onEvent('issued', id)}
      onPrescriptionDeleted={id => onEvent('deleted', id)}
      onClose={returnToApp}
      onFallbackToNativePrescription={returnToApp}
    />
  );
}
