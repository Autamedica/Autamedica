/**
 * E2E: Appointment Booking Flow
 *
 * Covers the complete journey from searching for a doctor through booking
 * confirmation and verifying the appointment appears in the patient agenda.
 *
 * Prerequisites:
 * - `pnpm dev --filter @autamedica/web` running on localhost:3000
 * - Supabase project accessible with seeded doctor data
 * - Authenticated patient session (use global-setup.ts for login)
 */

import { test } from '@playwright/test';

test.describe('Appointment Booking', () => {
  test.describe('Doctor Search', () => {
    test.todo(
      'displays the doctor search page with specialty filter and search input',
    );

    test.todo(
      'returns matching doctors when searching by name',
    );

    test.todo(
      'filters doctors by specialty (e.g., Cardiologia, Dermatologia)',
    );

    test.todo(
      'shows empty state when no doctors match the search criteria',
    );

    test.todo(
      'displays doctor cards with name, specialty, rating, and availability indicator',
    );
  });

  test.describe('Slot Selection', () => {
    test.todo(
      'navigates to doctor profile page on card click',
    );

    test.todo(
      'displays available time slots for the selected doctor',
    );

    test.todo(
      'allows selecting a date from the calendar widget',
    );

    test.todo(
      'shows available slots for the selected date',
    );

    test.todo(
      'disables past dates and fully-booked slots',
    );

    test.todo(
      'highlights the selected time slot visually',
    );
  });

  test.describe('Booking Confirmation', () => {
    test.todo(
      'shows booking summary with doctor name, date, time, and consultation type',
    );

    test.todo(
      'allows adding optional notes or reason for visit',
    );

    test.todo(
      'submits the booking and shows success confirmation',
    );

    test.todo(
      'prevents double-booking the same slot (concurrent conflict)',
    );

    test.todo(
      'displays error message when booking fails (network or server error)',
    );
  });

  test.describe('Agenda Verification', () => {
    test.todo(
      'newly booked appointment appears in /patients/appointments list',
    );

    test.todo(
      'appointment details match what was booked (doctor, date, time, status)',
    );

    test.todo(
      'appointment status shows as "confirmed" or "pending" based on doctor setting',
    );

    test.todo(
      'appointment also appears on the doctor side at /doctors/appointments',
    );

    test.todo(
      'patient can cancel the appointment from the appointments page',
    );

    test.todo(
      'cancelled appointment no longer appears in upcoming list',
    );
  });
});
