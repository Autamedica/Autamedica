/**
 * EventBus — Bus de eventos de dominio liviano y tipado.
 *
 * Desacopla acciones de side-effects. Los use cases emiten;
 * los handlers reaccionan sin acoplamiento directo.
 *
 * NO reemplaza Supabase Realtime (UI reactiva) ni SignalingService (WebRTC).
 * Complementa para lógica de negocio backend/server-side.
 *
 * @example
 * import { domainEvents } from '@autamedica/shared'
 *
 * // Suscribir
 * const unsub = domainEvents.on('appointment.completed', async (payload) => {
 *   await notifyPatient(payload.patientId)
 * })
 *
 * // Emitir
 * await domainEvents.emit('appointment.completed', {
 *   appointmentId: '123', doctorId: 'doc1', patientId: 'pat1'
 * })
 */

import { logger } from '../services/logger.service'
import type { DomainEventName, DomainEventPayload } from './types'

type Handler<T> = (payload: T) => void | Promise<void>

export interface IEventBus {
  on<K extends DomainEventName>(event: K, handler: Handler<DomainEventPayload<K>>): () => void
  off<K extends DomainEventName>(event: K, handler: Handler<DomainEventPayload<K>>): void
  emit<K extends DomainEventName>(event: K, payload: DomainEventPayload<K>): Promise<void>
  clear(): void
}

class EventBus implements IEventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>()

  on<K extends DomainEventName>(
    event: K,
    handler: Handler<DomainEventPayload<K>>
  ): () => void {
    const existing = this.handlers.get(event)
    const set = existing ?? new Set<Handler<unknown>>()
    if (!existing) this.handlers.set(event, set)
    set.add(handler as Handler<unknown>)
    return () => set.delete(handler as Handler<unknown>)
  }

  off<K extends DomainEventName>(
    event: K,
    handler: Handler<DomainEventPayload<K>>
  ): void {
    this.handlers.get(event)?.delete(handler as Handler<unknown>)
  }

  async emit<K extends DomainEventName>(
    event: K,
    payload: DomainEventPayload<K>
  ): Promise<void> {
    const handlers = this.handlers.get(event)
    if (!handlers || handlers.size === 0) return

    const results = await Promise.allSettled(
      [...handlers].map((h) => h(payload))
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error(`[EventBus] Handler failed for "${event}":`, result.reason)
      }
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}

/** Singleton del event bus de dominio */
export const domainEvents: IEventBus = new EventBus()
