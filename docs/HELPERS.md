# Helpers de AutaMedica

Inventario de helpers compartidos en `apps/web/src/lib/`.

---

## Helpers existentes

### `api-helpers.ts`

Respuestas HTTP estandarizadas para endpoints Astro.

| Export                                       | Descripción                                         |
| -------------------------------------------- | --------------------------------------------------- |
| `jsonOk(data, status?)`                      | `{ success: true, data }`                           |
| `jsonFail(code, message, status?, details?)` | `{ success: false, error: { code, message, ... } }` |
| `unauthorized(msg?)`                         | 401                                                 |
| `forbidden(msg?)`                            | 403                                                 |
| `notFound(msg?)`                             | 404                                                 |
| `badRequest(msg)`                            | 400                                                 |
| `internalError(msg?)`                        | 500                                                 |

### `doctors/lib/resolve-room.ts`

Resolución de participantes y contexto en consultas.

| Export                                               | Descripción                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `resolveDoctorId(admin, userId)`                     | userId → doctorId                                 |
| `resolveRoomParticipants(admin, roomId)`             | roomId → `{ patientId, doctorId, appointmentId }` |
| `resolvePatientProfile(admin, patientId)`            | patientId → `{ name, dateOfBirth, gender }`       |
| `doctorHasPatientAccess(admin, doctorId, patientId)` | Verifica acceso via care team o cita previa       |

---

## Helpers nuevos (2026-03-24)

### `api-client.ts`

Fetch wrapper tipado para llamadas internas desde islands React.

```typescript
import { fetchApi, ApiError } from "@/lib/api-client";

// GET — retorna T directamente (desenvuelve { success, data })
const appointments = await fetchApi<Appointment[]>("/api/patients/appointments");

// POST — auto-serializa body, auto-agrega Content-Type
const created = await fetchApi<Appointment>("/api/patients/appointments", {
  body: { doctor_id: "...", start_time: "..." },
});

// Error handling tipado
try {
  await fetchApi("/api/...");
} catch (err) {
  if (err instanceof ApiError) {
    err.status; // 401, 403, 500...
    err.code; // 'UNAUTHENTICATED', 'VALIDATION'...
    err.message; // Mensaje legible
  }
}
```

Comportamiento:

- `credentials: 'include'` siempre (cookies de sesión)
- Auto-serializa body como JSON
- Parsea envelope `{ success, data, error }`, retorna `T`
- Lanza `ApiError` en error HTTP o `success: false`

### `api-auth.ts`

Auth helpers server-side para endpoints Astro.

```typescript
import { withAuth, withSession, isAuthed } from "@/lib/api-auth";

// withAuth — valida JWT con Supabase Auth (seguro, roundtrip)
export const POST: APIRoute = async ({ request }) => {
  const auth = await withAuth(request);
  if (!isAuthed(auth)) return auth; // Response 401
  const { user, supabase } = auth;
  // ...
};

// withSession — lee JWT de cookie (rápido, sin roundtrip)
export const GET: APIRoute = async ({ request }) => {
  const auth = await withSession(request);
  if (!isAuthed(auth)) return auth;
  const { session, supabase } = auth;
  // ...
};
```

Cuándo usar cada uno:

- `withAuth()` → endpoints que escriben datos o requieren verificación fuerte
- `withSession()` → endpoints de lectura donde la cookie es suficiente

### `date-utils.ts`

Formateo de fechas consistente. Locale default: `es-AR`.

```typescript
import { formatDate, formatDateTime, formatTime, formatDuration, timeAgo } from "@/lib/date-utils";

formatDate("2026-03-24"); // "24 mar 2026"
formatDate("2026-03-24", { month: "long" }); // "24 de marzo de 2026"
formatDate("2026-03-24", { locale: "pt-BR" }); // "24 de mar. de 2026"
formatDate(null); // ""

formatDateTime("2026-03-24T14:30:00Z"); // "24 mar 2026, 14:30"
formatDateTime("2026-03-24T14:30:00Z", { month: "long" }); // "24 de marzo de 2026, 14:30"

formatTime("2026-03-24T14:30:00Z"); // "14:30"
formatTime(new Date()); // "14:30" (acepta Date)

formatDuration(125); // "2m 5s"
formatDuration(3665); // "1h 1m"

timeAgo("2026-03-24T14:25:00Z"); // "5m"
timeAgo("2026-03-23T14:30:00Z"); // "1d"
```

---

## Consumidores migrados

### `api-client.ts` (13 archivos)

- `hooks/patients/useAnamnesis.ts` — 4 fetch calls
- `hooks/patients/useAppointments.ts` — 4 fetch calls
- `hooks/patients/useReviews.ts` — 2 fetch calls
- `hooks/patients/useProfile.ts` — 1 fetch call
- `hooks/doctors/useConsultationContext.ts` — 1 fetch call
- `components/admin/TelemedicineDashboard.tsx` — 1 fetch call
- `components/doctors/ranking/MedicalRankingPanel.tsx` — 1 fetch call
- `components/doctors/settings/SettingsPanel.tsx` — 1 fetch call
- `components/doctors/calls/PostConsultationReport.tsx` — 2 fetch calls

### `api-auth.ts` (9 endpoints)

- `pages/api/doctors/ranking.ts` — `withAuth()`
- `pages/api/doctors/onboarding-complete.ts` — `withAuth()`
- `pages/api/profiles/doctors.ts` — `withAuth()`
- `pages/api/doctors/consultations/[roomId]/context.ts` — `withSession()`
- `pages/api/doctors/consultations/[roomId]/report.ts` — `withSession()` (x2 handlers)
- `pages/api/doctors/consultations/[roomId]/transcription.ts` — `withSession()`
- `pages/api/doctors/patients/[patientId]/anamnesis.ts` — `withSession()`
- `pages/api/admin/telemedicine-stats.ts` — `withSession()`
- `pages/api/patients/doctors/[id]/slots.ts` — `withSession()`

### `date-utils.ts` (10 componentes)

- `components/admin/TelemedicineDashboard.tsx` — `formatDuration`, `timeAgo`
- `components/doctors/patients/PatientsPanel.tsx` — `formatDate`
- `components/doctors/medical/PrescriptionsTab.tsx` — `formatDate`
- `components/doctors/medical/AIHistoryTab.tsx` — `formatDateTime`
- `components/doctors/medical/MedicalHistoryTab.tsx` — `formatDateTime`
- `components/doctors/medical/VitalSignsTab.tsx` — `formatDateTime`
- `components/patients/appointments/AppointmentsTable.tsx` — `formatDate`, `formatTime`
- `components/patients/medical-history/MedicalHistoryTimeline.tsx` — `formatDate`
- `components/patients/medical-history/MedicalHistorySummary.tsx` — `formatDate`
- `components/patients/telemedicine/ChatPanel.tsx` — `formatTime`

### `resolve-room.ts` (6 duplicados eliminados)

- `context.ts` — eliminadas `resolveDoctorId`, `resolveRoomParticipants`, `resolvePatientProfile`
- `report.ts` — eliminada `resolvePatientProfile`
- `anamnesis.ts` — eliminadas `resolveDoctorId`, `doctorHasPatientAccess`
