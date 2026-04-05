import { describe, it, expect } from 'vitest';
import {
  mapDbTypeToAppointmentType,
  mapTypeToDb,
  computeEndTime,
  mapAppointment,
  type DbAppointmentRow,
} from '../appointment-utils';

describe('mapDbTypeToAppointmentType', () => {
  it('maps "telemedicine" to telemedicine', () => {
    expect(mapDbTypeToAppointmentType('telemedicine')).toBe('telemedicine');
  });

  it('maps "follow_up" to follow_up', () => {
    expect(mapDbTypeToAppointmentType('follow_up')).toBe('follow_up');
  });

  it('maps "emergency" to emergency', () => {
    expect(mapDbTypeToAppointmentType('emergency')).toBe('emergency');
  });

  it('maps "consultation" to consultation', () => {
    expect(mapDbTypeToAppointmentType('consultation')).toBe('consultation');
  });

  it('maps "lab_test" to lab_test', () => {
    expect(mapDbTypeToAppointmentType('lab_test')).toBe('lab_test');
  });

  it('defaults to consultation for null', () => {
    expect(mapDbTypeToAppointmentType(null)).toBe('consultation');
  });

  it('defaults to consultation for undefined', () => {
    expect(mapDbTypeToAppointmentType(undefined)).toBe('consultation');
  });

  it('defaults to consultation for unknown string', () => {
    expect(mapDbTypeToAppointmentType('something_else')).toBe('consultation');
  });
});

describe('mapTypeToDb', () => {
  it('maps telemedicine to telemedicine', () => {
    expect(mapTypeToDb('telemedicine')).toBe('telemedicine');
  });

  it('maps follow_up to follow_up', () => {
    expect(mapTypeToDb('follow_up')).toBe('follow_up');
  });

  it('maps emergency to emergency', () => {
    expect(mapTypeToDb('emergency')).toBe('emergency');
  });

  it('maps consultation to consultation', () => {
    expect(mapTypeToDb('consultation')).toBe('consultation');
  });

  it('maps lab_test to lab_test', () => {
    expect(mapTypeToDb('lab_test')).toBe('lab_test');
  });

  it('defaults to consultation for null', () => {
    expect(mapTypeToDb(null)).toBe('consultation');
  });

  it('defaults to consultation for undefined', () => {
    expect(mapTypeToDb(undefined)).toBe('consultation');
  });
});

describe('computeEndTime', () => {
  it('computes end time 30 minutes after start', () => {
    const start = '2026-03-22T10:00:00.000Z';
    const result = computeEndTime(start, 30);
    expect(result).toBe('2026-03-22T10:30:00.000Z');
  });

  it('computes end time 60 minutes after start', () => {
    const start = '2026-03-22T23:30:00.000Z';
    const result = computeEndTime(start, 60);
    expect(result).toBe('2026-03-23T00:30:00.000Z');
  });

  it('computes end time 15 minutes after start', () => {
    const start = '2026-01-01T08:45:00.000Z';
    const result = computeEndTime(start, 15);
    expect(result).toBe('2026-01-01T09:00:00.000Z');
  });
});

describe('mapAppointment', () => {
  const baseRow: DbAppointmentRow = {
    id: 'apt-001',
    patient_id: 'pat-001',
    doctor_id: 'doc-001',
    start_time: '2026-03-22T14:00:00.000Z',
    end_time: '2026-03-22T14:30:00.000Z',
    duration_minutes: 30,
    type: 'telemedicine',
    status: 'confirmed',
    notes: 'Follow up on blood work',
    reason: 'Lab results review',
    meeting_url: 'https://meet.example.com/abc',
    location: null,
    created_at: '2026-03-20T10:00:00.000Z',
    updated_at: '2026-03-21T12:00:00.000Z',
    doctor: {
      id: 'doc-001',
      specialty: 'Cardiologia',
      profile: {
        first_name: 'Ana',
        last_name: 'Garcia',
      },
    },
  };

  it('maps all basic fields correctly', () => {
    const result = mapAppointment(baseRow);

    expect(result.id).toBe('apt-001');
    expect(result.patient_id).toBe('pat-001');
    expect(result.doctor_id).toBe('doc-001');
    expect(result.start_time).toBe('2026-03-22T14:00:00.000Z');
    expect(result.duration_minutes).toBe(30);
    expect(result.status).toBe('confirmed');
    expect(result.type).toBe('telemedicine');
    expect(result.notes).toBe('Follow up on blood work');
    expect(result.reason).toBe('Lab results review');
    expect(result.meeting_url).toBe('https://meet.example.com/abc');
  });

  it('maps doctor information correctly', () => {
    const result = mapAppointment(baseRow);

    expect(result.doctor).toEqual({
      id: 'doc-001',
      first_name: 'Ana',
      last_name: 'Garcia',
      specialty: 'Cardiologia',
      profile_picture_url: null,
    });
  });

  it('sets doctor to null when no doctor in row', () => {
    const row: DbAppointmentRow = { ...baseRow, doctor: null };
    const result = mapAppointment(row);
    expect(result.doctor).toBeNull();
  });

  it('defaults duration to 30 when both duration_minutes and end_time are null', () => {
    const row: DbAppointmentRow = { ...baseRow, duration_minutes: null, end_time: null };
    const result = mapAppointment(row);
    expect(result.duration_minutes).toBe(30);
  });

  it('computes duration from start/end time when duration_minutes is null', () => {
    const row: DbAppointmentRow = {
      ...baseRow,
      duration_minutes: null,
      start_time: '2026-03-22T14:00:00.000Z',
      end_time: '2026-03-22T14:45:00.000Z',
    };
    const result = mapAppointment(row);
    expect(result.duration_minutes).toBe(45);
  });

  it('defaults status to scheduled for unknown status', () => {
    const row: DbAppointmentRow = { ...baseRow, status: 'weird_status' };
    const result = mapAppointment(row);
    expect(result.status).toBe('scheduled');
  });

  it('defaults status to scheduled for null', () => {
    const row: DbAppointmentRow = { ...baseRow, status: null };
    const result = mapAppointment(row);
    expect(result.status).toBe('scheduled');
  });

  it('maps all valid statuses correctly', () => {
    const validStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'] as const;
    for (const status of validStatuses) {
      const row: DbAppointmentRow = { ...baseRow, status };
      const result = mapAppointment(row);
      expect(result.status).toBe(status);
    }
  });

  it('uses notes as reason fallback when reason is null', () => {
    const row: DbAppointmentRow = { ...baseRow, reason: null, notes: 'General checkup' };
    const result = mapAppointment(row);
    expect(result.reason).toBe('General checkup');
  });

  it('returns null reason when both reason and notes are null', () => {
    const row: DbAppointmentRow = { ...baseRow, reason: null, notes: null };
    const result = mapAppointment(row);
    expect(result.reason).toBeNull();
  });

  it('returns undefined start_time when row.start_time is null', () => {
    const row: DbAppointmentRow = { ...baseRow, start_time: null };
    const result = mapAppointment(row);
    expect(result.start_time).toBeUndefined();
  });
});
