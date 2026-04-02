# Arquitectura AutaMedica — Mapa Real

> Este documento describe el mapa funcional del sistema.
> La gobernanza arquitectónica vigente está en [ARQUITECTURA_V2.md](/home/edu/Autamedica/docs/ARQUITECTURA_V2.md).

> Referencia para mirar y saber siempre si falta una pieza.
> Ultima actualizacion: 2026-03-24

---

## El recorrido de la informacion

```
PACIENTE                         DOCTOR                          SISTEMA
───────                          ──────                          ───────

1. Se registra                   1. Se registra
   ↓                                ↓
2. Completa anamnesis            2. Configura disponibilidad
   ↓                                ↓
3. Busca doctor → agenda turno ─────────────────────────────→ 3. Reminder worker
   ↓                                                            envia WhatsApp 24h antes
4. Entra a sala de espera ──────→ 4. Ve paciente en espera
   ↓                                ↓
5. Teleconsulta (WebRTC) ◄═══════► 5. Teleconsulta (WebRTC) ←── Signaling server
   ↓                                ↓                            coordina SDP/ICE
6. (Opcional) Audio ────────────────────────────────────────→ 6. Clinical AI Orchestrator
                                                                 STT → Normalizar → Razonar
   ↓                                ↓                            ↓
7. Ve resultados ◄──────────────── 7. Revisa informe IA ◄─────── 7. Output JSON
                                    ↓
                                 8. Genera reporte final
                                    ↓
                                 9. Prescribe, registra vitales
                                    ↓
                                    ▼
                              ┌──────────────┐
                              │  SUPABASE    │
                              │  PostgreSQL  │
                              │  + RLS       │
                              └──────────────┘
                                    ↓
                              PDF / Historial medico
                              disponible para paciente
```

---

## Piezas del sistema

### Apps (servicios desplegados)

| App                             | Que hace                                                                        | Estado                 | Deploy                           |
| ------------------------------- | ------------------------------------------------------------------------------- | ---------------------- | -------------------------------- |
| `apps/web`                      | App principal — Astro 5 + React 19 islands                                      | **Produccion**         | Cloudflare Pages (5 subdominios) |
| `apps/signaling-server`         | WebRTC signaling (Socket.io)                                                    | **Funcional**          | Cloudflare Worker                |
| `apps/clinical-ai-orchestrator` | Audio → STT → IA → JSON clinico                                                 | **Funcional, aislado** | Independiente (Express)          |
| `apps/reminder-worker`          | Recordatorios WhatsApp (cron cada 1 min)                                        | **Funcional**          | Daemon (Bun)                     |
| `apps/mobile`                   | Superficie movil convergente pensada para el canal unico Android+iOS            | **Reservada**          | No activa                        |
| `apps/android`                  | Implementacion movil actual para validar el contrato compartido de videollamada | **En desarrollo**      | Local / pruebas                  |

### Lectura vigente del canal de videollamada

- El foco actual del producto es **un solo canal de telemedicina `web + mobile`**.
- `apps/web` define hoy la ruta canonica del flujo funcional y del contrato de negocio de la videollamada.
- `apps/android` se usa como implementacion movil actual para validar permisos, media devices, signaling y experiencia movil real.
- **No estamos tratando Android e iOS como productos separados**. Las decisiones deben tomarse primero a nivel de capacidad movil comun; las divergencias por plataforma solo se aceptan cuando el hardware, permisos o SDKs las fuerzan.
- `apps/mobile` permanece reservado como espacio de convergencia futura; no debe leerse como un segundo frente activo paralelo a Android.

### Packages (logica compartida)

| Package           | Que exporta                                                             |
| ----------------- | ----------------------------------------------------------------------- |
| `types`           | 190+ tipos TypeScript, branded types (PatientId, DoctorId), Zod schemas |
| `shared`          | Env validation, logger, role routing, DB helpers                        |
| `auth`            | createServerClient(), createBrowserClient(), hooks de sesion            |
| `hooks`           | usePatients(), useAppointments()                                        |
| `telemedicine`    | WebRTCClient, UnifiedVideoCall.tsx, hooks de media/stats                |
| `scheduling`      | Tipos de disponibilidad, waitlist, recordatorios                        |
| `ui`              | Componentes compartidos (buttons, forms, modals)                        |
| `tailwind-config` | Preset Tailwind                                                         |

### Supabase Edge Functions

| Funcion                      | Trigger                      | Que hace                                                     |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------ |
| `create-call`                | POST al iniciar teleconsulta | Crea registro en `calls`                                     |
| `ingest-patient-observation` | POST desde paciente/doctor   | Inserta vital/medicamento/sintoma + genera alerta si critico |
| `send-push-notification`     | Cambio critico o mensaje     | Firebase Cloud Messaging                                     |
| `update-call-status`         | Disconnect del signaling     | Marca call como completed + duracion                         |

---

## Modelo de datos (tablas principales)

```
IDENTIDAD
├── auth.users (Supabase auth)
├── profiles (nombre, email, telefono, avatar, fcm_token)
├── patients (user_id, active)
└── doctors (user_id, specialty, bio, active, ranking_score)

AGENDA
├── appointments (patient_id, doctor_id, start/end_time, status)
├── doctor_availability (dia, hora inicio/fin, duracion slot)
├── doctor_availability_overrides (excepciones: vacaciones, guardias)
├── appointment_waitlist (cola de espera inteligente)
├── appointment_reminders (canal, scheduled_for, sent_at, status)
└── appointment_history (log inmutable de cambios)

TELECONSULTA
├── telemedicine_sessions (appointment_id, room_id, status)
├── calls (patient_id, doctor_id, duracion, timestamps)
├── session_chat_messages (mensajes en consulta)
└── session_recordings (grabaciones)

HISTORIA MEDICA
├── anamnesis (patient_id, status, completion_percentage)
├── anamnesis_sections (seccion, data JSON, completed)
├── medical_records (contenido del reporte final)
├── vital_signs (presion, FC, temp, O2)
├── medication_logs (nombre, dosis, status: taken/late/skipped)
├── symptom_reports (sintoma, severidad 0-10, urgencia)
├── lab_results (tipo test, status: pending/reviewed/flagged)
└── patient_alerts (source_table, severity, titulo, mensaje)

IA CLINICA
├── clinical_ai_sessions (doctor, paciente, canal, status)
├── clinical_ai_media_items (audio recibido)
├── clinical_ai_jobs (etapa del pipeline, status, idempotency)
├── clinical_ai_transcripts (STT output, confidence)
├── clinical_ai_normalized_transcripts (entidades clinicas extraidas)
└── clinical_ai_outputs (JSON final para el doctor)

RANKING
├── doctor_rankings (consultas totales, rating promedio, tasa completitud)
└── doctor_profile_badges (gold, responsive, verified, high_completion)
```

**Patron de borrado:**

- Tablas medicas → `deleted_at` (soft delete con timestamp)
- Tablas de negocio (patients, doctors, appointments) → `active: boolean`

---

## Pipeline de IA clinica (9 etapas)

```
WhatsApp/PWA
     ↓
MEDIA_FETCH ──→ Descarga audio del mensaje
     ↓
AUDIO_PREP ───→ Normaliza formato de audio
     ↓
STT_SUBMIT ───→ Envia a Google Cloud Speech-to-Text
     ↓
STT_FINALIZE ─→ Recibe transcripcion + confidence
     ↓
NORMALIZE ────→ Extrae entidades clinicas del texto
     ↓
REASON ───────→ Analisis clinico (IA)
     ↓
VALIDATE ─────→ Verifica coherencia del output
     ↓
DELIVER ──────→ Guarda en clinical_ai_outputs
     ↓
CLEANUP ──────→ Limpia artefactos temporales
```

---

## Lo que FALTA o esta ROTO

### Circuitos rotos (Tier 3)

| Problema                                              | Impacto                                                                                | Donde                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **`startSession()` nunca se llama**                   | Session siempre null → notas, prescribir, vitales, telemedicina son no-ops silenciosos | `useActiveSession` hook sin consumidor         |
| **AI output no visible en portal doctor**             | El orchestrator genera JSON pero el doctor no lo ve en la UI                           | `clinical_ai_outputs` sin fetch en `/doctors/` |
| **"Dr. Garcia" hardcodeado**                          | Placeholder que viola reglas del proyecto                                              | `VideoLayout.tsx`                              |
| **Sin UI para seleccionar paciente → iniciar sesion** | Doctor no puede arrancar el flujo de quick actions                                     | Falta componente                               |

### Piezas que no existen (Tier 4)

| Pieza                          | Que seria                                                        |
| ------------------------------ | ---------------------------------------------------------------- |
| App mobile funcional           | React Native / Expo con funcionalidad real                       |
| Integracion AI ↔ portal doctor | Mostrar output del orchestrator en la UI del doctor              |
| Pagos y facturacion            | Flujo completo de cobro (mencionado en E2E pero no implementado) |

---

## Infraestructura

```
Cloudflare Pages (5 deploys, mismo codebase)
├── www.autamedica.com        → autamedica-web.pages.dev
├── paciente.autamedica.com   → autamedica-patients-82t.pages.dev
├── doctor.autamedica.com     → autamedica-doctors-az6.pages.dev
├── empresa.autamedica.com    → autamedica-companies-drl.pages.dev
└── admin.autamedica.com      → autamedica-admin.pages.dev

Cloudflare Workers
├── automedica-signaling-server (WebRTC)
└── automedica-http-signaling-server

Supabase (qxjjrpksmwwrmubhvjew)
├── PostgreSQL + RLS
├── Edge Functions (Deno)
├── Auth (email/password + OAuth)
└── Storage (archivos medicos)

GitHub Actions (CI/CD)
├── ci.yml (PR: build + lint)
├── deploy-production.yml (push main: preflight → DB → deploy → smoke)
├── quality-gates.yml (DB drift, edge functions, clinical)
└── security-scan.yml (audit, TruffleHog, dep review)
```

---

## API endpoints (patron de rutas)

```
/api/patients/
├── appointments/          GET listar, POST crear
├── appointments/[id]      GET detalle, PUT actualizar
├── anamnesis/             GET estado, POST guardar seccion
├── doctors/               GET listar con filtros
├── doctors/[id]/slots     GET slots disponibles
├── medical-history/       GET registros
├── medical-history/allergies    GET/POST
├── medical-history/medications  GET/POST
├── medical-history/conditions   GET/POST
└── turn-credentials       GET credenciales TURN

/api/doctors/
├── ranking                GET ranking del doctor
├── onboarding-complete    POST marcar onboarding
├── patients/              GET pacientes del doctor
├── patients/[id]/anamnesis GET anamnesis del paciente
├── consultations/[roomId]/context       GET contexto
├── consultations/[roomId]/report        PATCH generar reporte
├── consultations/[roomId]/transcription GET transcripcion
├── cloudflare-calls       GET crear SFU session
└── turn-credentials       GET credenciales TURN

/api/admin/
└── telemedicine-stats     GET estadisticas
```

---

## Hexagonal Layered — Patrones Transversales (2026-03-27)

### Ports (Interfaces de Repositorio)

Cada repositorio tiene una interfaz abstracta en `packages/types/src/ports/`.
La implementación concreta (adaptador Supabase) vive en `apps/web`.
Tests pueden usar mock adapters sin tocar Supabase.

```
packages/types/src/ports/
├── index.ts                    # barrel export
├── patients.port.ts            # IPatientRepository
├── appointments.port.ts        # IAppointmentRepository (Query + Command)
└── anamnesis.port.ts           # IAnamnesisRepository
```

Uso en services/use cases:

```typescript
import type { IPatientRepository } from "@autamedica/types";
// El service no sabe si habla con Supabase, Postgres directo, o un mock
```

### Domain Events (Event Bus)

Bus de eventos tipado en `packages/shared/src/events/`.
Desacopla acciones de side-effects. No reemplaza Supabase Realtime.

```typescript
import { domainEvents } from "@autamedica/shared";

// Suscribir (en un handler de notificaciones, por ejemplo)
domainEvents.on("appointment.completed", async ({ patientId }) => {
  await notifyPatient(patientId);
});

// Emitir (en un use case)
await domainEvents.emit("appointment.completed", { appointmentId, doctorId, patientId });
```

Eventos definidos: `appointment.*`, `anamnesis.*`, `call.*`, `consultation.*`

### Use Cases (Orquestación de Flujos)

Archivos `*.usecase.ts` en `apps/web/src/lib/*/usecases/`.
Un use case = 1 flujo de negocio que cruza múltiples repos/services.
Recibe dependencias por parámetro (inversión de dependencias).

```
apps/web/src/lib/
├── patients/usecases/complete-anamnesis.usecase.ts
├── calls/usecases/start-teleconsultation.usecase.ts
└── doctors/usecases/get-leaderboard.usecase.ts
```

### CQRS Lite (Read Models de Dashboard)

Queries pesadas de dashboard separadas en `queries/`.
Son read-only, optimizadas con `Promise.all`, sin side-effects.

```
apps/web/src/lib/
├── doctors/queries/dashboard-stats.query.ts    # Stats del doctor
└── patients/queries/notification-feed.query.ts  # Feed de notificaciones
```

### Flujo completo (11 capas)

```
UI → Hook → Service(FE) → API Client → [HTTP]
  → Controller → Use Case → Service(BE) → Repository(Port) → [Supabase]
                    ↓
              Domain Events → Handlers (notificaciones, logging, sync)
                    ↓
              Queries (CQRS) ← Dashboard reads optimizados
```
