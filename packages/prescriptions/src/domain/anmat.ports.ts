export type AnmatEventType = 'informar_medicamento' | 'confirmar_transaccion' | 'anular_transaccion';

export type AnmatTraceStatus = 'pending' | 'reported' | 'confirmed' | 'failed' | 'skipped';

export interface AnmatTraceEvent {
  id: string;
  dispensationEventId: string;
  gtin: string;
  serie: string;
  lote: string;
  vencimiento: string;
  eventType: AnmatEventType;
  anmatTransactionId?: string;
  status: AnmatTraceStatus;
  attemptCount: number;
  nextAttemptAt?: string;
  lastError?: string;
  reportedAt?: string;
  confirmedAt?: string;
}

export interface AnmatInformPayload {
  gtin: string;
  serie: string;
  lote: string;
  vencimiento: string;
  origenCuit: string;
  destinoCuit: string;
  eventoTipo: string;
  fechaEvento: string;
  prescriptionCuir?: string;
  pacienteDocumento?: string;
}

export interface AnmatInformResult {
  transactionId: string;
  raw: Record<string, unknown>;
}

export interface IAnmatSntReporter {
  informarMedicamento(payload: AnmatInformPayload): Promise<AnmatInformResult>;
  confirmarTransaccion(transactionId: string): Promise<AnmatInformResult>;
  anularTransaccion(transactionId: string, motivo: string): Promise<AnmatInformResult>;
}

export interface IAnmatTraceRepository {
  enqueueInform(params: { dispensationEventId: string; gtin: string; serie: string; lote: string; vencimiento: string }): Promise<AnmatTraceEvent>;
  listPending(batchSize: number): Promise<AnmatTraceEvent[]>;
  markReported(eventId: string, transactionId: string, response: Record<string, unknown>): Promise<void>;
  markConfirmed(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string, nextAttemptAt: string): Promise<void>;
}
