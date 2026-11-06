import {useEffect, useState} from 'react';
import {MemedPrescriptionWidget} from './MemedPrescriptionWidget';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type State = {status: 'loading'|'ready'|'error'|'login'; patientId?: string; error?: string};

/** Dedicated narrow-screen doctor flow. NEVER accepts patientId directly from URL. */
export function MemedMobileRoute() {
  const [state, setState] = useState<State>({status: 'loading'});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const id = new URLSearchParams(window.location.search).get('appointmentId') ?? '';
    if (!UUID.test(id)) {
      setState({status: 'error', error: 'Consulta inválida.'});
      return () => controller.abort();
    }
    void fetch('/api/doctors/prescriptions/memed-mobile-context?appointmentId=' +
        encodeURIComponent(id), {credentials: 'include', cache: 'no-store', signal: controller.signal})
      .then(async response => {
        if (response.status === 401) {
          setState({status: 'login'});
          return;
        }
        if (!response.ok) throw new Error('O médico, o paciente ou a consulta não estão autorizados para Memed.');
        const json: {data?: {patientId?: string}} = await response.json();
        if (!json.data?.patientId || !UUID.test(json.data.patientId)) throw new Error('Paciente não validado.');
        if (!controller.signal.aborted) setState({status: 'ready', patientId: json.data.patientId});
      }).catch(() => {
        if (!controller.signal.aborted) setState({status: 'error', error: 'Não foi possível autorizar esta consulta.'});
      });
    return () => controller.abort();
  }, [revision]);

  const returnToApp = () => { window.close(); if (!window.closed) window.history.back(); };
  const onEvent = async (action: 'issued'|'deleted', prescriptionId: string) => {
    if (state.status !== 'ready' || !state.patientId) throw new Error('Sessão não autorizada');
    const response = await fetch('/api/doctors/prescriptions/memed-event', {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action, patientId: state.patientId, prescriptionId}),
    });
    if (!response.ok) throw new Error('Falha ao confirmar evento com Memed.');
  };
  if (state.status === 'loading') {
    return <main className="p-6 text-sm text-slate-700" role="status">Verificando médico e consulta…</main>;
  }
  if (state.status === 'login') {
    return <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Sessão médica necessária</h1>
      <p className="mt-3 text-sm">Entre no portal AutaMedica como o médico responsável e retorne a esta página.</p>
      <button className="mt-4 rounded bg-blue-700 px-4 py-3 text-white" onClick={() => setRevision(x => x + 1)}>
        Já entrei — verificar novamente
      </button>
    </main>;
  }
  if (state.status === 'error' || !state.patientId) {
    return <main className="mx-auto max-w-md p-6" role="alert">
      <h1 className="font-semibold">Memed indisponível</h1>
      <p className="mt-2 text-sm">{state.error ?? 'Acesso clínico não confirmado.'}</p>
      <button className="mt-4 rounded border px-4 py-2" onClick={returnToApp}>Voltar à AutaMedica</button>
    </main>;
  }
  return <MemedPrescriptionWidget
    patientId={state.patientId}
    onPrescriptionSaved={id => onEvent('issued', id)}
    onPrescriptionDeleted={id => onEvent('deleted', id)}
    onClose={returnToApp}
  />;
}
