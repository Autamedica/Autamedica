import { it, expect, describe } from 'vitest';
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
  it('includes patient name, doctor, date, time', () => {
    const msg = buildReminder24h(sampleData);
    expect(msg).toContain('Juan');
    expect(msg).toContain('María García');
    expect(msg).toContain('lunes 20 de marzo');
    expect(msg).toContain('10:30');
    expect(msg).toContain('Consulta General');
  });

  it('includes location when provided', () => {
    const msg = buildReminder24h(sampleData);
    expect(msg).toContain('Consultorio 3');
  });

  it('shows telemedicina when no location', () => {
    const msg = buildReminder24h({ ...sampleData, location: undefined });
    expect(msg).toContain('Telemedicina');
    expect(msg).not.toContain('Consultorio');
  });

  it('includes CONFIRMO and CANCELO options', () => {
    const msg = buildReminder24h(sampleData);
    expect(msg).toContain('CONFIRMO');
    expect(msg).toContain('CANCELO');
  });
});

describe('buildReminder2h', () => {
  it('includes patient name and time', () => {
    const msg = buildReminder2h(sampleData);
    expect(msg).toContain('Juan');
    expect(msg).toContain('10:30');
  });

  it('shorter than 24h reminder', () => {
    const msg24 = buildReminder24h(sampleData);
    const msg2 = buildReminder2h(sampleData);
    expect(msg2.length).toBeLessThan(msg24.length);
  });
});

describe('buildWaitlistOffer', () => {
  it('includes all offer details', () => {
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
  it('recognizes confirmation keywords', () => {
    expect(parsePatientResponse('CONFIRMO')).toBe('confirmed');
    expect(parsePatientResponse('si')).toBe('confirmed');
    expect(parsePatientResponse('Sí')).toBe('confirmed');
    expect(parsePatientResponse('ok')).toBe('confirmed');
    expect(parsePatientResponse('confirmar')).toBe('confirmed');
  });

  it('recognizes cancellation keywords', () => {
    expect(parsePatientResponse('CANCELO')).toBe('cancelled');
    expect(parsePatientResponse('cancelar')).toBe('cancelled');
    expect(parsePatientResponse('no')).toBe('cancelled');
  });

  it('recognizes acceptance keywords', () => {
    expect(parsePatientResponse('ACEPTO')).toBe('accepted');
    expect(parsePatientResponse('aceptar')).toBe('accepted');
    expect(parsePatientResponse('quiero')).toBe('accepted');
    expect(parsePatientResponse('dale')).toBe('accepted');
  });

  it('returns null for unrecognized input', () => {
    expect(parsePatientResponse('hola')).toBeNull();
    expect(parsePatientResponse('qué hora es?')).toBeNull();
    expect(parsePatientResponse('')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(parsePatientResponse('  confirmo  ')).toBe('confirmed');
    expect(parsePatientResponse('\ncancelo\n')).toBe('cancelled');
  });
});
