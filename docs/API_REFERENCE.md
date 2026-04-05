# API Reference

> Auto-generated from `apps/web/src/pages/api/`. All endpoints are Astro API routes
> deployed to Cloudflare Pages. Auth is enforced via Supabase session cookies
> (`withAuth` / `resolvePatientContext` / `resolveDoctorContext`).

## Auth & Session

| Method  | Path                | Auth           | Description                                                                  |
| ------- | ------------------- | -------------- | ---------------------------------------------------------------------------- |
| GET     | `/api/auth/me`      | Session        | Returns authenticated user with profile, role, and linked doctor/patient IDs |
| GET     | `/api/session-sync` | Session (CORS) | Validates active session for cross-subdomain portals. Returns session + user |
| OPTIONS | `/api/session-sync` | None           | CORS preflight for session-sync                                              |

## Call Infrastructure

| Method | Path                            | Auth    | Description                                                        |
| ------ | ------------------------------- | ------- | ------------------------------------------------------------------ |
| POST   | `/api/calls/[callId]/status`    | Session | Update call status (`connecting`, `connected`, `ended`)            |
| GET    | `/api/calls/[roomId]/bootstrap` | Session | Bootstrap call session data for a room (participants, TURN, state) |

## Doctor Endpoints

### Appointments

| Method | Path                                        | Auth   | Description                                                                             |
| ------ | ------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| GET    | `/api/doctors/appointments`                 | Doctor | List all appointments for the authenticated doctor                                      |
| POST   | `/api/doctors/appointments`                 | Doctor | Create a new appointment (requires `patient_id`, `scheduled_at`)                        |
| PATCH  | `/api/doctors/appointments/[id]`            | Doctor | Update appointment fields (time, type, notes, location, duration)                       |
| POST   | `/api/doctors/appointments/[id]/transition` | Doctor | Transition appointment status (scheduled, confirmed, in_progress, completed, cancelled) |

### Calls

| Method | Path                                 | Auth   | Description                                                                 |
| ------ | ------------------------------------ | ------ | --------------------------------------------------------------------------- |
| POST   | `/api/doctors/calls/start`           | Doctor | Start a teleconsultation with a patient (creates call session + room)       |
| POST   | `/api/doctors/calls/[callId]/accept` | Doctor | Accept an incoming call                                                     |
| POST   | `/api/doctors/calls/[callId]/cancel` | Doctor | Cancel a call with optional reason (`doctor_canceled`, `no_answer_timeout`) |

### Consultations

| Method | Path                                                | Auth   | Description                                                                   |
| ------ | --------------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| GET    | `/api/doctors/consultations/[roomId]/context`       | Doctor | Get patient context for an active consultation (history, vitals, medications) |
| PATCH  | `/api/doctors/consultations/[roomId]/report`        | Doctor | Update or save consultation report content                                    |
| POST   | `/api/doctors/consultations/[roomId]/report`        | Doctor | Generate AI-assisted consultation report                                      |
| POST   | `/api/doctors/consultations/[roomId]/transcription` | Doctor | Save consultation transcription segments                                      |

### Patients (Doctor View)

| Method | Path                                          | Auth         | Description                                                       |
| ------ | --------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| GET    | `/api/doctors/patients`                       | Doctor/Admin | List patients assigned to the doctor (admin: all active patients) |
| POST   | `/api/doctors/patients/names`                 | Doctor       | Batch resolve patient display names from IDs (max 100)            |
| GET    | `/api/doctors/patients/[patientId]/anamnesis` | Doctor       | Get patient anamnesis with summary and export HTML                |

### Medical Records

| Method | Path                           | Auth   | Description                                                                               |
| ------ | ------------------------------ | ------ | ----------------------------------------------------------------------------------------- |
| GET    | `/api/doctors/medical-records` | Doctor | Query patient medical records with filters (type, date range, diagnosis text, pagination) |

### Community

| Method | Path                                         | Auth    | Description                                                  |
| ------ | -------------------------------------------- | ------- | ------------------------------------------------------------ |
| GET    | `/api/doctors/community/leaderboard`         | Session | Get community leaderboard with doctor rankings               |
| GET    | `/api/doctors/community/posts`               | Doctor  | List community posts (sort by recent or popular, limit 1-50) |
| POST   | `/api/doctors/community/posts`               | Doctor  | Create a community post                                      |
| GET    | `/api/doctors/community/posts/[id]/comments` | Doctor  | List comments on a community post                            |
| POST   | `/api/doctors/community/posts/[id]/comments` | Doctor  | Add a comment to a community post                            |

### Profile & Onboarding

| Method | Path                               | Auth    | Description                                                              |
| ------ | ---------------------------------- | ------- | ------------------------------------------------------------------------ |
| GET    | `/api/doctors/profile`             | Doctor  | Get doctor profile(s) by `userId`, `id`, `specialty`, or list all active |
| GET    | `/api/doctors/ranking`             | Session | Get doctor ranking leaderboard with metrics and badges                   |
| POST   | `/api/doctors/onboarding-complete` | Doctor  | Mark doctor onboarding as complete (sets profile timestamps)             |

### Telemedicine Infrastructure

| Method | Path                            | Auth    | Description                                                 |
| ------ | ------------------------------- | ------- | ----------------------------------------------------------- |
| POST   | `/api/doctors/cloudflare-calls` | Session | Proxy to Cloudflare Calls API for WebRTC session management |
| GET    | `/api/doctors/turn-credentials` | Session | Get TURN server credentials (Cloudflare, TTL-based)         |

### Public Profiles

| Method | Path                    | Auth   | Description                                                |
| ------ | ----------------------- | ------ | ---------------------------------------------------------- |
| POST   | `/api/profiles/doctors` | Doctor | Create or update doctor profile with availability schedule |

## Patient Endpoints

### Anamnesis

| Method | Path                                  | Auth    | Description                                                                      |
| ------ | ------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| GET    | `/api/patients/anamnesis`             | Patient | Get current anamnesis snapshot for the patient                                   |
| POST   | `/api/patients/anamnesis`             | Patient | Save an anamnesis section (validated via Zod schema)                             |
| PATCH  | `/api/patients/anamnesis`             | Patient | Update anamnesis metadata                                                        |
| POST   | `/api/patients/anamnesis/ai-question` | Patient | Generate AI follow-up questions from chief complaint (rate limited: 5/day)       |
| POST   | `/api/patients/anamnesis/chat`        | Patient | Process conversational anamnesis chat message                                    |
| POST   | `/api/patients/anamnesis/extract`     | Patient | Trigger AI extraction of clinical entities from anamnesis (rate limited: 10/day) |
| GET    | `/api/patients/anamnesis/live-token`  | Patient | Get Gemini Live session config for voice anamnesis (rate limited: 3/hour)        |
| POST   | `/api/patients/anamnesis/live-token`  | Patient | Same as GET, accepts POST for body params                                        |
| POST   | `/api/patients/anamnesis/live-relay`  | Patient | Stateless Gemini conversation relay for voice anamnesis                          |
| GET    | `/api/patients/anamnesis/pdf`         | Patient | Download anamnesis as PDF (optional `?version=N` for specific version)           |
| GET    | `/api/patients/anamnesis/versions`    | Patient | List all anamnesis versions (history)                                            |
| POST   | `/api/patients/anamnesis/versions`    | Patient | Create a new anamnesis version (manual update)                                   |

### Appointments

| Method | Path                                   | Auth    | Description                                                                    |
| ------ | -------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| GET    | `/api/patients/appointments`           | Patient | List all appointments for the patient                                          |
| POST   | `/api/patients/appointments`           | Patient | Create a new appointment (validated via Zod schema)                            |
| GET    | `/api/patients/appointments/[id]`      | Patient | Get a specific appointment by ID                                               |
| PATCH  | `/api/patients/appointments/[id]`      | Patient | Update appointment (status, type, notes)                                       |
| POST   | `/api/patients/appointments/[id]/join` | Patient | Join a telemedicine appointment (finds or creates call, validates time window) |

### Calls

| Method | Path                             | Auth    | Description                                                 |
| ------ | -------------------------------- | ------- | ----------------------------------------------------------- |
| POST   | `/api/patients/calls/respond`    | Patient | Respond to incoming call (`accept` or `decline`)            |
| POST   | `/api/patients/cloudflare-calls` | Session | Proxy to Cloudflare Calls API for WebRTC session management |
| GET    | `/api/patients/turn-credentials` | Session | Get TURN server credentials                                 |

### Community

| Method | Path                                              | Auth    | Description                                                   |
| ------ | ------------------------------------------------- | ------- | ------------------------------------------------------------- |
| GET    | `/api/patients/community`                         | Patient | Get community overview (posts with sort, limit, group filter) |
| GET    | `/api/patients/community/posts/[id]/comments`     | Patient | List comments on a post                                       |
| POST   | `/api/patients/community/posts/[id]/comments`     | Patient | Add a comment to a post                                       |
| PATCH  | `/api/patients/community/posts/[id]`              | Patient | Update a community post                                       |
| POST   | `/api/patients/community/posts/[id]/reactions`    | Patient | Add reaction to a post (default: `like`)                      |
| POST   | `/api/patients/community/comments/[id]/reactions` | Patient | Add reaction to a comment                                     |
| POST   | `/api/patients/community/posts`                   | Patient | Create a community post                                       |

### Doctors (Patient View)

| Method | Path                               | Auth    | Description                                                                     |
| ------ | ---------------------------------- | ------- | ------------------------------------------------------------------------------- |
| GET    | `/api/patients/doctors`            | Patient | List all active doctors on the platform                                         |
| GET    | `/api/patients/doctors/[id]/slots` | Session | Get available appointment slots for a doctor (`?from=YYYY-MM-DD&to=YYYY-MM-DD`) |

### Medical History

| Method | Path                                        | Auth    | Description                                                            |
| ------ | ------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| GET    | `/api/patients/medical-history`             | Patient | Get full medical history (conditions, allergies, medications, records) |
| POST   | `/api/patients/medical-history/allergies`   | Patient | Add an allergy record                                                  |
| POST   | `/api/patients/medical-history/conditions`  | Patient | Add a medical condition                                                |
| POST   | `/api/patients/medical-history/medications` | Patient | Add a medication record                                                |

### Notifications

| Method | Path                                    | Auth    | Description                           |
| ------ | --------------------------------------- | ------- | ------------------------------------- |
| GET    | `/api/patients/notifications`           | Patient | Get notification feed for the patient |
| POST   | `/api/patients/notifications/[id]/read` | Patient | Mark a single notification as read    |
| POST   | `/api/patients/notifications/read-all`  | Patient | Mark all notifications as read        |

### Profile

| Method | Path                                        | Auth    | Description                                         |
| ------ | ------------------------------------------- | ------- | --------------------------------------------------- |
| PATCH  | `/api/patients/profile`                     | Patient | Update patient profile and/or patient record fields |
| POST   | `/api/patients/profile/ensure`              | Patient | Ensure profile + patient records exist (idempotent) |
| POST   | `/api/patients/profile/onboarding-complete` | Patient | Mark patient onboarding as complete                 |

### Reports

| Method | Path                             | Auth    | Description                                    |
| ------ | -------------------------------- | ------- | ---------------------------------------------- |
| GET    | `/api/patients/reports`          | Patient | List consultation reports for the patient      |
| GET    | `/api/patients/reports/[id]/pdf` | Patient | Download a specific consultation report as PDF |

### Reviews

| Method | Path                    | Auth    | Description                                                 |
| ------ | ----------------------- | ------- | ----------------------------------------------------------- |
| POST   | `/api/patients/reviews` | Patient | Submit a doctor review (rating 1-5 with optional breakdown) |

## Admin Endpoints

| Method | Path                            | Auth  | Description                       |
| ------ | ------------------------------- | ----- | --------------------------------- |
| GET    | `/api/admin/telemedicine-stats` | Admin | Get telemedicine usage statistics |

## Webhooks

| Method  | Path                     | Auth         | Description                                                                                                              |
| ------- | ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| POST    | `/api/webhooks/openclaw` | Bearer token | Receive patient responses from OpenClaw (WhatsApp/Telegram). Handles confirmation, cancellation, and waitlist acceptance |
| OPTIONS | `/api/webhooks/openclaw` | None         | CORS preflight                                                                                                           |

## Supabase Edge Functions

| Function                     | Trigger                 | Description                                                                                                    |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `create-call`                | RPC (POST)              | Creates a telemedicine call session in DB with room ID and participant records                                 |
| `update-call-status`         | RPC (POST)              | Updates call status (`connecting`, `connected`, `ended`) with timestamp tracking                               |
| `ingest-patient-observation` | RPC (POST)              | Ingests patient observations (vital signs, medications, symptoms, lab results) with automatic alert generation |
| `process-reminders`          | Cron (every minute)     | Processes pending appointment reminders via OpenClaw (WhatsApp). Also expires stale waitlist offers            |
| `send-push-notification`     | RPC (POST, cron-secret) | Sends FCM push notifications to a user by looking up their device token                                        |

## Auth Patterns

- **Session**: Supabase session cookie validated via `withAuth(request)` or middleware `locals.session`.
- **Doctor**: Session + role verification via `resolveDoctorContext()` (checks `user_metadata.role === 'doctor'` and resolves `doctorId`).
- **Patient**: Session + patient context via `resolvePatientContext()` (resolves `patientId` from user).
- **Admin**: Session + admin role verified via service-level check.
- **Bearer token**: Server-to-server auth via `Authorization: Bearer <secret>` header (webhooks, cron).
