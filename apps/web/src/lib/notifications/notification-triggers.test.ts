import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followupScheduleService } from '@/lib/calls/services/followup-schedule.service';

const { fakeBus } = vi.hoisted(() => {
  type Handler = (payload: unknown) => unknown | Promise<unknown>;
  const handlers = new Map<string, Set<Handler>>();
  return {
    fakeBus: {
      on(event: string, handler: Handler) {
        let set = handlers.get(event);
        if (!set) {
          set = new Set();
          handlers.set(event, set);
        }
        set.add(handler);
        return () => set?.delete(handler);
      },
      off(event: string, handler: Handler) {
        handlers.get(event)?.delete(handler);
      },
      async emit(event: string, payload: unknown) {
        const listeners = handlers.get(event);
        if (!listeners || listeners.size === 0) return;
        await Promise.all([...listeners].map((h) => h(payload)));
      },
      clear() {
        handlers.clear();
      },
    },
  };
});

vi.mock('@autamedica/shared', () => ({
  domainEvents: fakeBus,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const insertedRows: Array<Record<string, unknown>> = [];
const appointmentsRow = { doctor_id: 'doc-1', patient_id: 'pat-1', start_time: '2026-04-20T15:00:00Z' };
const doctorsRow = { user_id: 'doctor-user-1' };
const patientsRow = { user_id: 'patient-user-1' };
const profilesRow = { first_name: 'Ana', last_name: 'Paciente' };

function makeMaybeSingleResponse(data: unknown) {
  return Promise.resolve({ data, error: null });
}

function makeTableQuery(table: string) {
  const builder = {
    _filters: {} as Record<string, unknown>,
    select() {
      return builder;
    },
    eq(_col: string, value: string) {
      builder._filters[_col] = value;
      return builder;
    },
    in() {
      return builder;
    },
    is() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
    maybeSingle() {
      switch (table) {
        case 'appointments':
          return makeMaybeSingleResponse(appointmentsRow);
        case 'doctors':
          return makeMaybeSingleResponse(doctorsRow);
        case 'patients':
          return makeMaybeSingleResponse(patientsRow);
        case 'profiles':
          return makeMaybeSingleResponse(profilesRow);
        case 'portal_notifications':
          return makeMaybeSingleResponse(null);
        default:
          return makeMaybeSingleResponse(null);
      }
    },
    insert(row: Record<string, unknown>) {
      insertedRows.push({ ...row, _table: table });
      return Promise.resolve({ error: null });
    },
  };
  return builder;
}

const fakeAdminClient = {
  from(table: string) {
    return makeTableQuery(table);
  },
};

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => fakeAdminClient,
}));

// Reset the init guard before importing so the module registers against our fake bus.
(globalThis as Record<string, unknown>).__autamedicaNotificationTriggersInitialized__ = false;

await import('./notification-triggers');

describe('appointment.cancelled notification trigger', () => {
  beforeEach(() => {
    insertedRows.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('notifica al doctor y al paciente cuando el doctor cancela', async () => {
    await fakeBus.emit('appointment.cancelled', {
      appointmentId: 'appt-1',
      cancelledBy: 'doctor',
      reason: 'Reprograma vacaciones',
    });

    const notifs = insertedRows.filter((row) => row._table === 'portal_notifications');
    expect(notifs).toHaveLength(2);

    const doctorNotif = notifs.find((row) => row.audience === 'doctor');
    const patientNotif = notifs.find((row) => row.audience === 'patient');

    expect(doctorNotif).toBeDefined();
    expect(doctorNotif?.user_id).toBe('doctor-user-1');
    expect(doctorNotif?.type).toBe('event_appointment_cancelled');
    expect(doctorNotif?.dedupe_key).toBe('event:appointment.cancelled:appt-1:doctor');
    expect(String(doctorNotif?.body)).toContain('Ana Paciente');
    expect(String(doctorNotif?.body)).toContain('Reprograma vacaciones');

    expect(patientNotif).toBeDefined();
    expect(patientNotif?.user_id).toBe('patient-user-1');
    expect(patientNotif?.dedupe_key).toBe('event:appointment.cancelled:appt-1:patient');
    expect(String(patientNotif?.body)).toMatch(/medico cancelo/i);
    expect(String(patientNotif?.body)).toContain('Reprograma vacaciones');
  });

  it('incluye motivo opcional solo si viene en el payload', async () => {
    await fakeBus.emit('appointment.cancelled', {
      appointmentId: 'appt-2',
      cancelledBy: 'patient',
    });

    const notifs = insertedRows.filter((row) => row._table === 'portal_notifications');
    expect(notifs).toHaveLength(2);

    const doctorNotif = notifs.find((row) => row.audience === 'doctor');
    expect(String(doctorNotif?.body)).toContain('Ana Paciente');
    expect(String(doctorNotif?.body)).not.toContain('Motivo:');
  });

  it('ejecuta la programación del seguimiento a 48h cuando se emite call.ended', async () => {
    const spy = vi.spyOn(followupScheduleService, 'schedule48hFollowup').mockResolvedValue({
      ok: true,
      callId: 'call-ended-1',
    } as any);

    await fakeBus.emit('call.ended', {
      callId: 'call-ended-1',
      roomId: 'room-1',
      durationSeconds: 900,
    });

    expect(spy).toHaveBeenCalledWith(expect.anything(), { callId: 'call-ended-1' });
  });
});
