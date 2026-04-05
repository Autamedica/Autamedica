/**
 * E2E: Patient Registration Flow
 *
 * Covers the complete journey from signup through onboarding to dashboard.
 * Requires a running Astro dev server and Supabase backend.
 *
 * Prerequisites:
 * - `pnpm dev --filter @autamedica/web` running on localhost:3000
 * - Supabase project accessible (or local via `supabase start`)
 * - Test email accounts configured in environment
 */

import { test } from '@playwright/test';

test.describe('Patient Registration', () => {
  test.describe('Signup', () => {
    test.todo(
      'loads the registration page and displays the signup form',
    );

    test.todo(
      'shows validation errors for empty required fields (email, password)',
    );

    test.todo(
      'shows validation error for password shorter than 8 characters',
    );

    test.todo(
      'shows validation error for invalid email format',
    );

    test.todo(
      'creates account with valid email and password, receives confirmation',
    );

    test.todo(
      'prevents duplicate registration with an already-used email',
    );
  });

  test.describe('Role Selection', () => {
    test.todo(
      'redirects to /auth/select-role after first login when no role is set',
    );

    test.todo(
      'displays patient and doctor role options',
    );

    test.todo(
      'persists selected role (patient) to user metadata and redirects to patient portal',
    );
  });

  test.describe('Onboarding', () => {
    test.todo(
      'shows privacy acceptance screen on first visit to patient portal',
    );

    test.todo(
      'blocks access to patient features until privacy terms are accepted',
    );

    test.todo(
      'redirects to anamnesis intake after accepting privacy terms',
    );

    test.todo(
      'displays anamnesis form with all required sections',
    );

    test.todo(
      'saves partial anamnesis progress and allows resuming later',
    );

    test.todo(
      'completes full anamnesis submission and navigates to dashboard',
    );
  });

  test.describe('Dashboard Access', () => {
    test.todo(
      'displays patient dashboard with profile summary after onboarding',
    );

    test.todo(
      'shows upcoming appointments section (empty state for new patient)',
    );

    test.todo(
      'shows navigation links to appointments, profile, and medical history',
    );

    test.todo(
      'redirects unauthenticated users from /patients to /auth/login',
    );
  });
});
