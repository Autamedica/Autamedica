# API Reference

> Auto-generated from `apps/web/src/pages/api/` and `supabase/functions/`.

## Authentication Patterns

| Pattern            | Where used                                                                         | Mechanism                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Session cookie     | Patient and doctor portal endpoints                                                | Supabase SSR session via `resolvePatientContext` / `resolveDoctorContext` / `withAuth` |
| Bearer token (JWT) | Edge functions (`create-call`, `update-call-status`, `ingest-patient-observation`) | `Authorization: Bearer <supabase_jwt>`                                                 |
| CRON_SECRET        | Scheduled edge functions (`send-push-notification`)                                | `Authorization: Bearer <CRON_SECRET>`                                                  |
| Webhook secret     | Webhook endpoints (`openclaw`)                                                     | `Authorization: Bearer <OPENCLAW_WEBHOOK_SECRET>`                                      |

All session-authenticated endpoints return `401 Unauthorized` when no valid session is present.
Doctor endpoints additionally verify the caller holds the `doctor` role via `resolveDoctorContext`.

---

## Auth Endpoints (`/api/auth/`)

| Method | Path           | Auth           | Description                                                          |
| ------ | -------------- | -------------- | -------------------------------------------------------------------- |
| GET    | `/api/auth/me` | Session cookie | Returns the authenticated user with profile data, role, and metadata |

## Session Endpoints

| Method  | Path                | Auth           | Description                                                                                      |
| ------- | ------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| GET     | `/api/session-sync` | Session cookie | Returns the active session for cross-portal verification (CORS-restricted to `*.autamedica.com`) |
| OPTIONS | `/api/session-sync` | None           | CORS preflight handler                                                                           |

---

## Doctor Endpoints (`/api/doctors/`)

### Appointments

| Method | Path                                       | Auth           | Description                                                                                                  |
| ------ | ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/doctors/appointments`                | Doctor session | List all appointments for the authenticated doctor                                                           |
| POST   | `/api/doctors/appointments`                | Doctor session | Create a new appointment (requires `patient_id`, `scheduled_at`)                                             |
| PATCH  | `/api/doctors/appointments/:id`            | Doctor session | Update an existing appointment (schedule, duration, type, notes, location)                                   |
| POST   | `/api/doctors/appointments/:id/transition` | Doctor session | Transition appointment status (`scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`) |

### Calls (Telemedicine)

| Method | Path                                | Auth           | Description                                                                 |
| ------ | ----------------------------------- | -------------- | --------------------------------------------------------------------------- |
| POST   | `/api/doctors/calls/start`          | Session cookie | Start a teleconsultation with a patient (creates call session via use case) |
| POST   | `/api/doctors/calls/:callId/accept` | Session cookie | Accept an incoming call                                                     |
| POST   | `/api/doctors/calls/:callId/cancel` | Session cookie | Cancel a call (reasons: `doctor_canceled`, `no_answer_timeout`)             |
| POST   | `/api/doctors/cloudflare-calls`     | Session cookie | Proxy to Cloudflare Calls API for WebRTC session management                 |
| GET    | `/api/doctors/turn-credentials`     | Session cookie | Fetch TURN server credentials for WebRTC connectivity                       |

### Consultations

| Method | Path                                               | Auth           | Description                                                              |
| ------ | -------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| GET    | `/api/doctors/consultations/:roomId/context`       | Session cookie | Fetch patient context for an active consultation (history, vitals, meds) |
| PATCH  | `/api/doctors/consultations/:roomId/report`        | Session cookie | Update consultation report content and doctor notes                      |
| POST   | `/api/doctors/consultations/:roomId/report`        | Session cookie | Generate and save AI-assisted consultation report                        |
| POST   | `/api/doctors/consultations/:roomId/transcription` | Session cookie | Save call transcription segments                                         |

### Patients (Doctor view)

| Method | Path                                         | Auth                    | Description                                                    |
| ------ | -------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| GET    | `/api/doctors/patients`                      | Doctor or admin session | List assigned patients (doctor) or all active patients (admin) |
| POST   | `/api/doctors/patients/names`                | Doctor session          | Batch-resolve patient display names by IDs (max 100)           |
| GET    | `/api/doctors/patients/:patientId/anamnesis` | Session cookie          | Fetch a patient's anamnesis with HTML export and summary       |

### Profile and Onboarding

| Method | Path                               | Auth           | Description                                                                     |
| ------ | ---------------------------------- | -------------- | ------------------------------------------------------------------------------- |
| GET    | `/api/doctors/profile`             | Session cookie | Fetch doctor profile by `userId`, `id`, `specialty`, or list all active doctors |
| POST   | `/api/doctors/onboarding-complete` | Session cookie | Mark doctor onboarding as complete, update profile name                         |

### Medical Records

| Method | Path                           | Auth           | Description                                                                                                                                |
| ------ | ------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/doctors/medical-records` | Session cookie | Query patient medical records with filters (`patientId` required; optional: `type`, `dateFrom`, `dateTo`, `diagnosisContains`, pagination) |

### Community

| Method | Path                                        | Auth           | Description                                                        |
| ------ | ------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| GET    | `/api/doctors/community/leaderboard`        | Session cookie | Fetch the community leaderboard (doctor rankings)                  |
| GET    | `/api/doctors/community/posts`              | Doctor session | List community posts (supports `limit`, `sort_by=recent\|popular`) |
| GET    | `/api/doctors/community/posts/:id/comments` | Doctor session | List comments on a community post                                  |
| POST   | `/api/doctors/community/posts/:id/comments` | Doctor session | Add a comment to a community post                                  |

### Ranking

| Method | Path                   | Auth           | Description                                                   |
| ------ | ---------------------- | -------------- | ------------------------------------------------------------- |
| GET    | `/api/doctors/ranking` | Session cookie | Fetch doctor ranking/leaderboard for the authenticated doctor |

---

## Patient Endpoints (`/api/patients/`)

### Anamnesis

| Method | Path                                  | Auth            | Description                                                                         |
| ------ | ------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/patients/anamnesis`             | Patient session | Fetch the patient's current anamnesis snapshot                                      |
| POST   | `/api/patients/anamnesis`             | Patient session | Save a single anamnesis section (`stepId`, `data`, `completed`)                     |
| PATCH  | `/api/patients/anamnesis`             | Patient session | Update anamnesis metadata (mode, filling preferences)                               |
| POST   | `/api/patients/anamnesis/ai-question` | Patient session | AI-generated follow-up questions from chief complaint (rate-limited: 5/day)         |
| POST   | `/api/patients/anamnesis/chat`        | Patient session | Conversational anamnesis turn (message + history + checkpoint)                      |
| POST   | `/api/patients/anamnesis/extract`     | Patient session | Trigger AI extraction of clinical entities from conversation (rate-limited: 10/day) |
| GET    | `/api/patients/anamnesis/live-token`  | Patient session | Get Gemini Live WebSocket URL and session config (rate-limited: 3/hour)             |
| POST   | `/api/patients/anamnesis/live-token`  | Patient session | Same as GET with request body for checkpoint context                                |
| POST   | `/api/patients/anamnesis/live-relay`  | Patient session | Stateless Gemini conversation relay for voice anamnesis                             |
| GET    | `/api/patients/anamnesis/pdf`         | Patient session | Download anamnesis as PDF (optional `?version=N` for specific snapshot)             |
| GET    | `/api/patients/anamnesis/versions`    | Patient session | List all anamnesis versions (history timeline)                                      |
| POST   | `/api/patients/anamnesis/versions`    | Patient session | Create a new anamnesis version (manual update trigger)                              |

### Appointments

| Method | Path                                  | Auth            | Description                                                                 |
| ------ | ------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| GET    | `/api/patients/appointments`          | Patient session | List all appointments for the authenticated patient                         |
| POST   | `/api/patients/appointments`          | Patient session | Book a new appointment (validated via Zod schema)                           |
| GET    | `/api/patients/appointments/:id`      | Patient session | Fetch a single appointment by ID                                            |
| PATCH  | `/api/patients/appointments/:id`      | Patient session | Update an appointment (reschedule, cancel)                                  |
| POST   | `/api/patients/appointments/:id/join` | Patient session | Join a teleconsultation for a scheduled appointment (validates time window) |

### Calls (Telemedicine)

| Method | Path                             | Auth           | Description                                                 |
| ------ | -------------------------------- | -------------- | ----------------------------------------------------------- |
| POST   | `/api/patients/calls/respond`    | Session cookie | Respond to an incoming call (`accept` or `decline`)         |
| POST   | `/api/patients/cloudflare-calls` | Session cookie | Proxy to Cloudflare Calls API for WebRTC session management |
| GET    | `/api/patients/turn-credentials` | Session cookie | Fetch TURN server credentials for WebRTC connectivity       |

### Community

| Method | Path                                             | Auth            | Description                                                    |
| ------ | ------------------------------------------------ | --------------- | -------------------------------------------------------------- |
| GET    | `/api/patients/community`                        | Patient session | Get community overview (posts feed with sorting and filtering) |
| POST   | `/api/patients/community/posts`                  | Patient session | Create a new community post                                    |
| PATCH  | `/api/patients/community/posts/:id`              | Patient session | Update own community post                                      |
| DELETE | `/api/patients/community/posts/:id`              | Patient session | Delete own community post                                      |
| GET    | `/api/patients/community/posts/:id/comments`     | Patient session | List comments on a post                                        |
| POST   | `/api/patients/community/posts/:id/comments`     | Patient session | Add a comment to a post                                        |
| POST   | `/api/patients/community/posts/:id/reactions`    | Patient session | Add a reaction to a post (default: `like`)                     |
| POST   | `/api/patients/community/comments/:id/reactions` | Patient session | Add a reaction to a comment                                    |

### Doctors (Patient view)

| Method | Path                              | Auth            | Description                                                                              |
| ------ | --------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/patients/doctors`           | Patient session | List all active doctors available for booking                                            |
| GET    | `/api/patients/doctors/:id/slots` | Session cookie  | Get open appointment slots for a doctor (requires `from` and `to` dates in `YYYY-MM-DD`) |

### Medical History

| Method | Path                                        | Auth            | Description                                                     |
| ------ | ------------------------------------------- | --------------- | --------------------------------------------------------------- |
| GET    | `/api/patients/medical-history`             | Patient session | Fetch full medical history (conditions, allergies, medications) |
| POST   | `/api/patients/medical-history/allergies`   | Patient session | Add an allergy record                                           |
| POST   | `/api/patients/medical-history/conditions`  | Patient session | Add a medical condition record                                  |
| POST   | `/api/patients/medical-history/medications` | Patient session | Add a medication record                                         |

### Notifications

| Method | Path                                   | Auth            | Description                           |
| ------ | -------------------------------------- | --------------- | ------------------------------------- |
| GET    | `/api/patients/notifications`          | Patient session | Fetch the patient's notification feed |
| POST   | `/api/patients/notifications/:id/read` | Patient session | Mark a single notification as read    |
| POST   | `/api/patients/notifications/read-all` | Patient session | Mark all notifications as read        |

### Profile and Onboarding

| Method | Path                                        | Auth           | Description                                           |
| ------ | ------------------------------------------- | -------------- | ----------------------------------------------------- |
| POST   | `/api/patients/profile/ensure`              | Session cookie | Ensure profile and patient records exist (idempotent) |
| PATCH  | `/api/patients/profile`                     | Session cookie | Update patient profile fields                         |
| POST   | `/api/patients/profile/onboarding-complete` | Session cookie | Mark patient onboarding as complete                   |

### Reports

| Method | Path                            | Auth            | Description                                             |
| ------ | ------------------------------- | --------------- | ------------------------------------------------------- |
| GET    | `/api/patients/reports`         | Patient session | List consultation reports for the authenticated patient |
| GET    | `/api/patients/reports/:id/pdf` | Patient session | Download a consultation report as PDF                   |

### Reviews

| Method | Path                    | Auth            | Description                                                                       |
| ------ | ----------------------- | --------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/patients/reviews` | Patient session | List appointment IDs the patient has already reviewed                             |
| POST   | `/api/patients/reviews` | Patient session | Submit a doctor review (ratings 1-5 across multiple dimensions, optional comment) |

---

## Shared Endpoints

### Calls (Role-agnostic)

| Method | Path                           | Auth           | Description                                                                  |
| ------ | ------------------------------ | -------------- | ---------------------------------------------------------------------------- |
| POST   | `/api/calls/:callId/status`    | Session cookie | Update call status (`connecting`, `connected`, `ended`) with optional reason |
| GET    | `/api/calls/:roomId/bootstrap` | Session cookie | Bootstrap call session data for a room (participant info, TURN, call state)  |

### Profiles

| Method | Path                    | Auth           | Description                                                        |
| ------ | ----------------------- | -------------- | ------------------------------------------------------------------ |
| POST   | `/api/profiles/doctors` | Session cookie | Complete doctor profile setup (availability schedule, specialties) |

---

## Admin Endpoints (`/api/admin/`)

| Method | Path                            | Auth          | Description                                                       |
| ------ | ------------------------------- | ------------- | ----------------------------------------------------------------- |
| GET    | `/api/admin/telemedicine-stats` | Admin session | Fetch platform-wide telemedicine statistics (verified admin only) |

---

## Webhooks (`/api/webhooks/`)

| Method | Path                     | Auth                                     | Description                                                                                                                      |
| ------ | ------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/webhooks/openclaw` | Bearer token (`OPENCLAW_WEBHOOK_SECRET`) | Receive patient responses from OpenClaw (WhatsApp/Telegram). Parses `CONFIRMO`/`CANCELO`/`ACEPTO` and updates appointment status |

---

## Edge Functions (`supabase/functions/`)

| Function                     | Auth                | Description                                                                                                                                       |
| ---------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-call`                | Bearer JWT          | Create a telemedicine call session via Supabase RPC (requires `doctorId`, `patientId`, optional `appointmentId`)                                  |
| `update-call-status`         | Bearer JWT          | Update call status (`callId`, `status`, optional `reason`)                                                                                        |
| `ingest-patient-observation` | Bearer JWT          | Ingest patient health observations (vital signs, medications, symptoms, lab results) with automatic alert generation                              |
| `process-reminders`          | Service role / CRON | Process pending appointment reminders via OpenClaw (WhatsApp). Designed for `pg_cron` invocation every minute. Also expires stale waitlist offers |
| `send-push-notification`     | CRON_SECRET         | Send push notifications to a specific user (`userId`, `title`, `body`, optional `data`)                                                           |
