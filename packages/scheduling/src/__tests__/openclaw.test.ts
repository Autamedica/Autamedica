import { test, expect, describe } from 'bun:test';
import {
  buildReminder24h,
  buildReminder2h,
  buildWaitlistOffer,
  parsePatientResponse,
} from '../openclaw';
import type { ReminderMessageData } from '../openclaw';

const sampleData: ReminderMessageData = {
  patientName: 'Juan',
  doctorName: 'María García',
  date: 'lunes 20 de marzo',
  time: '10:30',
  type: 'Consulta General',
  location: 'Consultorio 3',
};

describe('buildReminder24h', () => {
  test('includes patient name, doctor, date, time', () => {
    const msg = buildReminder24h(sampleData);
    expect(msg).toContain('Juan');
    expect(msg).toContain('María García');
    expect(msg).toContain('lunes 20 de marzo');
    expect(msg).toContain('10:30');
    expect(msg).toContain('Consulta General');
  });

  test('includes location when provided', () => {
    const msg = buildReminder24h(sampleData);
    expect(msg).toContain('Consultorio 3');
  });

  test('shows telemedicina when no location', () => {
    const msg = buildReminder24h({ ...sampleData, location: undefined });
    expect(msg).toContain('Telemedicina');
    expect(msg).not.toContain('Consultorio');
  });

  test('includes CONFIRMO and CANCELO options', () => {
    const msg = buildReminder24h(sampleData);
    expect(msg).toContain('CONFIRMO');
    expect(msg).toContain('CANCELO');
  });
});

describe('buildReminder2h', () => {
  test('includes patient name and time', () => {
    const msg = buildReminder2h(sampleData);
    expect(msg).toContain('Juan');
    expect(msg).toContain('10:30');
  });

  test('shorter than 24h reminder', () => {
    const msg24 = buildReminder24h(sampleData);
    const msg2 = buildReminder2h(sampleData);
    expect(msg2.length).toBeLessThan(msg24.length);
  });
});

describe('buildWaitlistOffer', () => {
  test('includes all offer details', () => {
    const msg = buildWaitlistOffer({
      patientName: 'Ana',
      doctorName: 'Pedro López',
      date: 'martes 21 de marzo',
      time: '14:00',
      expiresIn: '4 horas',
    });
    expect(msg).toContain('Ana');
    expect(msg).toContain('Pedro López');
    expect(msg).toContain('martes 21 de marzo');
    expect(msg).toContain('14:00');
    expect(msg).toContain('4 horas');
    expect(msg).toContain('ACEPTO');
  });
});

describe('parsePatientResponse', () => {
  test('recognizes confirmation keywords', () => {
    expect(parsePatientResponse('CONFIRMO')).toBe('confirmed');
    expect(parsePatientResponse('si')).toBe('confirmed');
    expect(parsePatientResponse('Sí')).toBe('confirmed');
    expect(parsePatientResponse('ok')).toBe('confirmed');
    expect(parsePatientResponse('confirmar')).toBe('confirmed');
  });

  test('recognizes cancellation keywords', () => {
    expect(parsePatientResponse('CANCELO')).toBe('cancelled');
    expect(parsePatientResponse('cancelar')).toBe('cancelled');
    expect(parsePatientResponse('no')).toBe('cancelled');
  });

  test('recognizes acceptance keywords', () => {
    expect(parsePatientResponse('ACEPTO')).toBe('accepted');
    expect(parsePatientResponse('aceptar')).toBe('accepted');
    expect(parsePatientResponse('quiero')).toBe('accepted');
    expect(parsePatientResponse('dale')).toBe('accepted');
  });

  test('returns null for unrecognized input', () => {
    expect(parsePatientResponse('hola')).toBeNull();
    expect(parsePatientResponse('qué hora es?')).toBeNull();
    expect(parsePatientResponse('')).toBeNull();
  });

  test('trims whitespace', () => {
    expect(parsePatientResponse('  confirmo  ')).toBe('confirmed');
    expect(parsePatientResponse('\ncancelo\n')).toBe('cancelled');
  });
});
