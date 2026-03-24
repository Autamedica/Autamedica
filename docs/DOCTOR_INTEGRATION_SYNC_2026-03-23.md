# Doctor Integration Sync Report (2026-03-23)

> Diagnóstico y corrección de desincronizaciones Frontend ↔ Backend en la sección Doctor.

## Resumen Ejecutivo

Se identificaron y corrigieron **13 problemas** de desincronización entre tipos TypeScript, hooks/queries, API endpoints y componentes UI del portal Doctor. Todas las correcciones fueron verificadas con `astro check` (0 errores), `pnpm lint` (0 errores/warnings) y `pnpm build:packages:core` (8/8 exitoso).

---

## Fase 1 — Tipos

### P0-1: Colisión de nombre `DoctorProfile`

**Problema:** Dos interfaces `DoctorProfile` incompatibles:

- `packages/types/src/entities/profiles.ts:146` — DB-aligned, snake_case (exportada desde index)
- `packages/types/src/doctor/doctor.types.ts:116` — Aspiracional con branded types, campos que no existen en DB

Las funciones exportadas (`isDoctorProfileComplete`, `canPracticeInArgentina`, etc.) operaban sobre la versión compleja, pero el tipo visible al importar `@autamedica/types` era la versión simple.

**Fix:** Renombrar la versión aspiracional a `DoctorIdealProfile`. Actualizar las 10+ funciones internas y exports del index.

**Archivos:** `packages/types/src/doctor/doctor.types.ts`, `packages/types/src/index.ts`

### P0-1b: Tipo `Doctor` en `entities/doctor.ts` desalineado

**Problema:** `specialties: SpecialtyId[]` (plural, array branded) vs DB `specialty: string` (singular, texto plano). CamelCase vs snake_case.

**Resultado:** Confirmado como código muerto — ningún archivo en `apps/` lo importa. Marcado para eliminación futura.

---

## Fase 2 — Hooks y Queries

### P0-2: `AppointmentsPanel` no filtraba por `doctorId`

**Problema:** El componente recibía `doctorId` como prop pero llamaba `useAppointments(supabaseClient)` sin pasarlo. El doctor potencialmente veía citas de todos los doctores.

**Fix:** `useAppointments(supabaseClient, doctorId)` + pasar prop desde `DoctorsPortalShell`.

**Archivo:** `apps/web/src/components/doctors/appointments/AppointmentsPanel.tsx`

### P0-3: Nombres de pacientes no resueltos

**Problema:** Mostraba `Paciente ${uuid.slice(0,8)}` — un UUID truncado — en vez del nombre real.

**Fix:** Resolución batch post-carga:

1. Extraer `patient_id` únicos de las citas
2. Query `patients` → obtener `user_id`
3. Query `profiles` → obtener `first_name`, `last_name`
4. Construir lookup map `patientId → nombre`

**Archivo:** `apps/web/src/components/doctors/appointments/AppointmentsPanel.tsx`

### P0-4: `useActiveSession` se perdía en refresh

**Problema:** Estado puro con `useState` — recargar la página destruía la sesión activa del doctor.

**Fix:** Persistir a `sessionStorage` (por tab, no por browser). Inicializar desde storage, escribir en `startSession`, limpiar en `endSession`.

**Archivo:** `apps/web/src/hooks/doctors/useActiveSession.ts`

### P1-3: Sidebar stats `patientsCount` y `historyCount` eran `undefined`

**Problema:** Los badges del sidebar nunca mostraban conteos para pacientes ni historial médico.

**Fix:** Extender `useDoctorStats` con queries paralelas (`Promise.all`):

- Pacientes únicos: `SELECT DISTINCT patient_id FROM appointments WHERE doctor_id = ?`
- Historial: `SELECT count(*) FROM medical_records WHERE doctor_id = ?`

**Archivos:** `apps/web/src/hooks/doctors/useDoctorStats.ts`, `apps/web/src/components/doctors/layout/DoctorsPortalShell.tsx`

---

## Fase 3 — API Endpoints

### P1-1: `consent_patient` hardcodeado a `false`

**Problema:** `transcription.ts` insertaba `consent_patient: false` siempre, ignorando consentimiento real.

**Fix:** Leer `consentPatient` del body del request.

**Archivo:** `apps/web/src/pages/api/doctors/consultations/[roomId]/transcription.ts`

### P1-5: Onboarding escribía a `schedule` JSONB (columna deprecated)

**Problema:** El onboarding escribía a `doctors.schedule` JSONB, pero existe `doctor_availability` (tabla normalizada, migración `20260318100000`).

**Fix:** Escribir a `doctor_availability`, setear `schedule: null`.

**Archivo:** `apps/web/src/pages/api/profiles/doctors.ts`

### P1-7: `resolveRoomParticipants` duplicado y con prioridad invertida

**Problema:** Código idéntico en `report.ts` y `transcription.ts`. Intentaba `calls` primero, `telemedicine_sessions` segundo — pero sessions tiene datos más completos (`appointment_id`).

**Fix:** Extraer a utilidad compartida con prioridad corregida (sessions primero).

**Archivo nuevo:** `apps/web/src/lib/doctors/lib/resolve-room.ts`

---

## Fase 4 — Componentes UI

### P1-2: `SettingsPanel` no persistía al backend

**Problema:** Solo guardaba a `localStorage`. Cambios de perfil (specialty, license) se perdían al cambiar de dispositivo.

**Fix:** Separar UI prefs (localStorage) de datos de perfil (POST `/api/profiles/doctors`).

**Archivo:** `apps/web/src/components/doctors/settings/SettingsPanel.tsx`

### P1-4: `DiagnosisPanel` simulaba flujo de error

**Problema:** El panel simulaba un flujo de IA que siempre terminaba en error sin intentar nada real.

**Fix:** Mostrar estado honesto "Servicio no disponible" desde el inicio, sin simular carga.

**Archivo:** `apps/web/src/components/doctors/diagnosis/DiagnosisPanel.tsx`

---

## Fase 5 — Calidad

### P2-1: Eliminación de `@ts-nocheck`

**Archivos limpiados:**

- `useAuthenticatedUser.ts` — removido `@ts-nocheck` + `eslint-disable`, corregido `email!` → `email ?? ''`
- `useDoctorStats.ts` — removido `@ts-nocheck`, reescrito patrón de inicialización Supabase
- `AppointmentsPanel.tsx` — removido `@ts-nocheck`, corregido `[...new Set()]` → `Array.from(new Set())`

**Errores corregidos durante la limpieza:**

- `TS2802`: `Set<UUID>` no iterable sin `--downlevelIteration` → `Array.from()`
- `@typescript-eslint/no-non-null-assertion`: `email!` → `email ?? ''`

---

## Archivos Modificados

| Archivo                                                                  | Cambio                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| `packages/types/src/doctor/doctor.types.ts`                              | `DoctorProfile` → `DoctorIdealProfile`           |
| `packages/types/src/index.ts`                                            | Export `DoctorIdealProfile`                      |
| `apps/web/src/components/doctors/appointments/AppointmentsPanel.tsx`     | Filtro doctorId, nombres pacientes, -@ts-nocheck |
| `apps/web/src/components/doctors/layout/DoctorsPortalShell.tsx`          | Pass doctorId, consume stats reales              |
| `apps/web/src/components/doctors/settings/SettingsPanel.tsx`             | Persistencia backend                             |
| `apps/web/src/components/doctors/diagnosis/DiagnosisPanel.tsx`           | Estado honesto                                   |
| `apps/web/src/hooks/doctors/useActiveSession.ts`                         | sessionStorage persistence                       |
| `apps/web/src/hooks/doctors/useDoctorStats.ts`                           | +patientsCount, +historyCount, -@ts-nocheck      |
| `apps/web/src/hooks/doctors/useAuthenticatedUser.ts`                     | -@ts-nocheck, -eslint-disable                    |
| `apps/web/src/pages/api/doctors/consultations/[roomId]/transcription.ts` | consentPatient, shared resolve-room              |
| `apps/web/src/pages/api/doctors/consultations/[roomId]/report.ts`        | shared resolve-room                              |
| `apps/web/src/pages/api/profiles/doctors.ts`                             | doctor_availability, schedule=null               |
| `apps/web/src/lib/doctors/lib/resolve-room.ts`                           | **NUEVO** — utilidad compartida                  |

## Verificacion

```
pnpm build:packages:core     → 8/8 exitoso
pnpm --filter @autamedica/web check → 0 errors, 0 warnings (346 files)
pnpm lint                    → 0 errors, 0 warnings
```

---

## Trabajo Pendiente (Roadmap)

### Fase A — Deuda Tecnica Restante

- Remover `@ts-nocheck` de 6 archivos restantes (DoctorOnboardingWizard, VitalSignsTab, EducationCertificationStep, MarketplacePanel, InteractiveMap, LeafletMap)
- Eliminar tipo `Doctor` muerto en `entities/doctor.ts`
- Migración para DROP `doctors.schedule` column
- Reducir uso de admin client donde browser client es suficiente

### Fase B — Paneles con Datos Reales

- `RecordsPanel` y `VitalSignsPanel` → queries reales (no placeholders)
- `PatientsPanel` → paginación
- `MarketplacePanel` → integrar con tabla `marketplace_listings`

### Fase C — Testing E2E (Patchright Streaming)

10 flujos criticos:

1. Login doctor → dashboard con stats reales
2. Onboarding completo → doctor_availability poblado
3. Citas filtradas por doctor + nombres de pacientes
4. Consulta telemedicina → start → call → end
5. Anamnesis con contexto previo del paciente
6. Reporte SOAP post-consulta
7. Edición de reporte antes de firmar
8. Ranking y badges mostrados correctamente
9. Settings persisten al backend
10. Sesión activa sobrevive refresh

### Fase D — Integraciones Cross-Domain

- DiagnosisPanel → servicio IA real (Gemini)
- MediAgenda: booking publico para pacientes
- Notificaciones de cita (push/email)
- Predicción de no-show
- Care team management
