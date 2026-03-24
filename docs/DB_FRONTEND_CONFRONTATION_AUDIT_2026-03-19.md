# Auditoría DB vs Frontend

Fecha: 2026-03-19
Actualizado: 2026-03-23

## ⚠️ Hallazgos críticos post-auditoría (2026-03-23)

### `deleted_at` inexistente en `patients` y `doctors`

Las tablas `patients` y `doctors` **no tienen columna `deleted_at`** en el schema real de producción. Múltiples hooks usaban `.is('deleted_at', null)` via `selectActive()`, causando errores en runtime ("column patients.deleted_at does not exist").

- **Soft-delete en estas tablas:** se gestiona únicamente con `active: boolean`.
- **Fix aplicado:** `usePatients()` (`packages/hooks/src/medical.ts`) y `useCurrentDoctor` / `useRealDoctors` (`apps/web/src/hooks/doctors/useRealDoctors.ts`) reescritos para usar `createBrowserClient()` directo y filtrar solo por `active = true`.

### `selectActive()` de `@autamedica/shared` no funciona en browser

`selectActive()` usa `process.env` internamente, que es `undefined` en browser/Cloudflare Workers. Todos los hooks de doctor portal que lo usaban fallaban silenciosamente con "Supabase configuration is missing". Ver sección 8 de CLAUDE.md para el patrón correcto con `createBrowserClient()`.

### `patients` no tiene campos de nombre/email

Las columnas `first_name`, `last_name`, `email`, `phone` viven en `profiles`, no en `patients`. Todo código que asuma estos campos directamente en `patients` fallará. El join correcto es `profiles!inner(first_name, last_name, email, phone)` via `user_id`.

---

Alcance:

- `apps/patients`
- `apps/doctors`
- `apps/web`
- `packages/*` con acceso a Supabase

Metodología:

- Se tomó como contrato base el schema tipado en [packages/types/src/supabase/database.types.ts](/home/edu/Autamedica/packages/types/src/supabase/database.types.ts).
- Se relevó el uso real de tablas mediante `from('table')`, `selectActive<'table'>`, `insertRecord<'table'>`, `updateRecord<'table'>`.
- Se inspeccionaron hooks, rutas API y componentes para detectar mocks, drift, features sin UI y UI sin backend real.

Limitación crítica:

- Este informe confronta código vs contrato tipado.
- No prueba por sí mismo que el schema tipado coincida con producción.
- Donde se dice `missing`, significa: "usado en código pero ausente en `database.types.ts`".
- Eso puede significar una de tres cosas:
  1. falta la tabla en la BD,
  2. falta regenerar tipos,
  3. el código apunta a nombres legacy/incorrectos.

## 1. Matriz: tabla -> schema -> uso -> UI -> estado

| Tabla / recurso                    | En schema tipado | Uso en código | Superficie UI visible                                       | Estado                       |
| ---------------------------------- | ---------------: | ------------: | ----------------------------------------------------------- | ---------------------------- |
| `profiles`                         |               Sí |          Alto | login, perfil, sesión, doctor/patient shell                 | Integrado                    |
| `patients`                         |               Sí |          Alto | perfil, quick actions, citas, contexto IA                   | Integrado                    |
| `doctors`                          |               Sí |          Alto | agenda, especialistas, doctor shell                         | Integrado                    |
| `appointments`                     |               Sí |          Alto | citas paciente, stats doctor, telemedicina                  | Integrado                    |
| `anamnesis`                        |               Sí |         Medio | historia clínica/anamnesis paciente, lectura médica parcial | Integrado con hallazgos      |
| `anamnesis_sections`               |               Sí |         Medio | anamnesis paciente, lectura médica parcial                  | Integrado con hallazgos      |
| `medical_records`                  |               Sí |          Alto | historial médico paciente y médico                          | Integrado                    |
| `vital_signs`                      |               Sí |         Medio | quick actions, vitals doctor                                | Integrado                    |
| `lab_results`                      |               Sí |          Bajo | quick actions / resultados                                  | Integrado parcial            |
| `patient_screenings`               |               Sí |         Medio | salud preventiva                                            | Integrado parcial            |
| `preventive_screenings`            |               Sí |          Bajo | salud preventiva                                            | Integrado parcial            |
| `reproductive_health_appointments` |               Sí |         Medio | salud reproductiva                                          | Integrado parcial            |
| `reproductive_health_specialists`  |               Sí |         Medio | salud reproductiva                                          | Integrado parcial            |
| `medical_chats`                    |               Sí |         Medio | chat médico paciente                                        | Integrado parcial            |
| `medical_messages`                 |               Sí |         Medio | chat médico paciente                                        | Integrado parcial            |
| `symptom_reports`                  |               Sí |          Bajo | observaciones médicas                                       | Integrado parcial            |
| `medication_logs`                  |               Sí |          Bajo | quick actions / observaciones                               | Integrado parcial            |
| `telemedicine_sessions`            |               Sí |          Alto | telemedicina                                                | Integrado con drift          |
| `telemedicine_room_participants`   |               Sí |         Medio | telemedicina                                                | Integrado                    |
| `telemedicine_session_events`      |               Sí |         Medio | telemedicina                                                | Integrado                    |
| `appointment_waitlist`             |               Sí |         Medio | waitlist                                                    | Integrado parcial            |
| `appointment_reminders`            |               Sí |         Medio | scheduling package                                          | Backend sin UI directa clara |
| `appointment_history`              |               Sí |         Medio | scheduling package                                          | Backend sin UI directa clara |
| `patient_care_team`                |               Sí |          Bajo | acceso doctor-paciente                                      | Integrado backend            |
| `patient_ai_chats`                 |               Sí |          Bajo | telemetría IA                                               | Backend sin UI directa       |
| `ai_user_patterns`                 |               Sí |          Bajo | IA paciente                                                 | Backend sin UI directa       |
| `ai_user_faq`                      |               Sí |          Bajo | IA paciente                                                 | Backend sin UI directa       |
| `health_centers`                   |               Sí |         Medio | geolocalización / centros                                   | Integrado                    |
| `company_members`                  |               Sí |          Bajo | companies                                                   | Integrado parcial            |
| `community_groups`                 |               No |         Medio | comunidad paciente                                          | Drift crítico                |
| `community_posts`                  |               No |         Medio | comunidad paciente                                          | Drift crítico                |
| `group_memberships`                |               No |         Medio | comunidad paciente                                          | Drift crítico                |
| `post_reactions`                   |               No |          Bajo | comunidad paciente                                          | Drift crítico                |
| `call_notifications`               |               No |         Medio | telemedicina package                                        | Drift                        |
| `session_recordings`               |               No |         Medio | recording telemedicina                                      | Drift                        |
| `session_participants`             |               No |         Medio | telemedicina package                                        | Drift                        |
| `session_events`                   |               No |          Bajo | telemedicina package                                        | Drift                        |
| `session_chat_messages`            |               No |         Medio | chat de sesión                                              | Drift                        |
| `user_preferences`                 |               No |          Bajo | notificaciones telemedicina                                 | Drift                        |
| `medications`                      |               No |      Muy bajo | sin UI real                                                 | Referencia legacy            |
| `users`                            |               No |      Muy bajo | sólo test legacy                                            | Referencia legacy            |
| `prescriptions`                    |               No |           N/A | UI doctor existe pero no integrada                          | Falta tabla o migración      |

## 2. Gaps confirmados

### 2.1. Tablas usadas en código pero ausentes en `database.types.ts`

Confirmado por static analysis:

- `community_groups`
- `community_posts`
- `group_memberships`
- `post_reactions`
- `call_notifications`
- `session_recordings`
- `session_participants`
- `session_events`
- `session_chat_messages`
- `user_preferences`
- `medications`
- `users`

Impacto:

- No hay contrato tipado estable.
- Riesgo alto de romper queries en runtime.
- Señal de drift entre migrations, producción y código.

Archivos relevantes:

- [useCommunity.ts](/home/edu/Autamedica/apps/patients/src/hooks/useCommunity.ts)
- [useCommunity.ts](/home/edu/Autamedica/apps/web/src/hooks/patients/useCommunity.ts)
- [sessionRecording.ts](/home/edu/Autamedica/packages/@autamedica/telemedicine/src/lib/sessionRecording.ts)
- [telemedicine.ts](/home/edu/Autamedica/packages/@autamedica/telemedicine/src/lib/telemedicine.ts)
- [notifications.ts](/home/edu/Autamedica/packages/@autamedica/telemedicine/src/lib/notifications.ts)

### 2.2. UI existente pero backend/tabla no implementado o explícitamente mock

#### Prescripciones

Confirmado:

- [usePrescriptions.ts](/home/edu/Autamedica/apps/doctors/src/hooks/usePrescriptions.ts) y [usePrescriptions.ts](/home/edu/Autamedica/apps/web/src/hooks/doctors/usePrescriptions.ts) advierten que `prescriptions` no existe en DB.

Diagnóstico:

- Hay superficie funcional de prescripciones.
- Falta tabla real o falta integrar el modelo sobre `medical_records`.

Severidad:

- Alta.

#### Screenings en paciente/web

Confirmado:

- [usePatientScreenings.ts](/home/edu/Autamedica/apps/patients/src/hooks/usePatientScreenings.ts)
- [usePatientScreenings.ts](/home/edu/Autamedica/apps/web/src/hooks/patients/usePatientScreenings.ts)

Diagnóstico:

- Devuelven mock data.
- Conviven con hooks reales de `patient_screenings`.

Severidad:

- Alta por duplicación y ambigüedad de implementación canónica.

#### Salud reproductiva: slots

Confirmado:

- [useReproductiveHealthAppointments.ts](/home/edu/Autamedica/apps/patients/src/hooks/useReproductiveHealthAppointments.ts)
- [useReproductiveHealthAppointments.ts](/home/edu/Autamedica/apps/web/src/hooks/patients/useReproductiveHealthAppointments.ts)

Diagnóstico:

- Parte de la experiencia usa slots mock o implementación todavía bloqueada.
- Las citas existen, la disponibilidad completa no.

Severidad:

- Media.

#### Telemedicina / video / recording

Confirmado:

- [EnhancedVideoCall.tsx](/home/edu/Autamedica/apps/web/src/components/patients/telemedicine/EnhancedVideoCall.tsx)
- [DoctorVideoConsultation.tsx](/home/edu/Autamedica/apps/doctors/src/components/consultation/DoctorVideoConsultation.tsx)
- [supabaseClient.ts](/home/edu/Autamedica/packages/@autamedica/telemedicine/src/lib/supabaseClient.ts)

Diagnóstico:

- Hay mocks e implementación todavía bloqueada.
- Recording depende de tablas no tipadas (`session_recordings`) y configuración faltante.

Severidad:

- Alta.

#### IA médica / análisis

Confirmado:

- [medical-data-api.ts](/home/edu/Autamedica/apps/doctors/src/services/medical-data-api.ts)
- [gemini-ai-service.ts](/home/edu/Autamedica/apps/doctors/src/services/gemini-ai-service.ts)
- [ai-analysis-service.ts](/home/edu/Autamedica/apps/doctors/src/services/ai-analysis-service.ts)

Diagnóstico:

- Gran parte cae en mock/fallback.
- No es sólo un tema de tabla faltante; es integración incompleta de servicios.

Severidad:

- Media.

### 2.3. Backend/modelado existente sin UI o sin superficie clara

Tablas/recursos tipados sin exposición clara comparable:

- `medical_record_authorizations`
- `medical_audit_log`
- `patient_alerts`
- `patient_risk_factors`
- `risk_factors`
- `screening_reminder_notifications`
- `consultation_rooms`
- `user_roles`
- `user_identifiers`
- `audit_logs`
- `auth_audit`

Diagnóstico:

- Hay capacidad de plataforma y compliance.
- No aparece una UX clara que capitalice esto en los portales.

Severidad:

- Media.

### 2.4. Duplicación estructural entre frontends

Confirmado:

- `apps/patients` y `apps/web` duplican hooks y parte del dominio paciente.

Ejemplos:

- [useAnamnesis.ts](/home/edu/Autamedica/apps/patients/src/hooks/useAnamnesis.ts)
- [useAnamnesis.ts](/home/edu/Autamedica/apps/web/src/hooks/patients/useAnamnesis.ts)
- [useAppointments.ts](/home/edu/Autamedica/apps/patients/src/hooks/useAppointments.ts)
- [useAppointments.ts](/home/edu/Autamedica/apps/web/src/hooks/patients/useAppointments.ts)
- [useCommunity.ts](/home/edu/Autamedica/apps/patients/src/hooks/useCommunity.ts)
- [useCommunity.ts](/home/edu/Autamedica/apps/web/src/hooks/patients/useCommunity.ts)

Diagnóstico:

- Aunque la tabla exista, la confrontación con BD queda debilitada porque hay dos implementaciones del mismo dominio.
- Se multiplica el riesgo de drift y fixes parciales.

Severidad:

- Alta.

### 2.5. Integración E2E real de anamnesis hoy no está probada como sana

Confirmado por prueba:

- [ui-anamnesis-db.spec.ts](/home/edu/Autamedica/apps/patients/e2e/ui-anamnesis-db.spec.ts)

Resultado:

- La UI quedó autenticada, pero `/api/anamnesis` respondió `401` en la prueba.

Diagnóstico:

- Hay inconsistencia entre sesión visible en UI y acceso a route handler.
- No se puede marcar la integración como cerrada.

Artefactos:

- [test-failed-1.png](/home/edu/Autamedica/apps/patients/test-results/ui-anamnesis-db-Patients-a-11cb5-namnesis-real-desde-la-base-Chromium-Desktop-/test-failed-1.png)
- [error-context.md](/home/edu/Autamedica/apps/patients/test-results/ui-anamnesis-db-Patients-a-11cb5-namnesis-real-desde-la-base-Chromium-Desktop-/error-context.md)

Severidad:

- Alta.

## 3. Plan de cierre por dominio

### 3.1. Dominio Patients

Objetivo:

- Tener un único frontend canónico y cerrar integración real con BD.

Acciones:

1. Elegir `apps/patients` como implementación canónica del portal paciente.
2. Congelar o retirar duplicados equivalentes en `apps/web/src/hooks/patients`.
3. Cerrar el bug de sesión/API en anamnesis hasta que [ui-anamnesis-db.spec.ts](/home/edu/Autamedica/apps/patients/e2e/ui-anamnesis-db.spec.ts) pase.
4. Reemplazar [usePatientScreenings.ts](/home/edu/Autamedica/apps/patients/src/hooks/usePatientScreenings.ts) mock por consumo real de `patient_screenings`.
5. Resolver si `wallet` es sólo UI informacional o debe persistir en BD. Hoy [page.tsx](/home/edu/Autamedica/apps/patients/src/app/wallet/page.tsx) no prueba integración de tabla.

Prioridad:

- P0: anamnesis/session inconsistency
- P1: screenings mock
- P1: duplicación con `apps/web`

### 3.2. Dominio Doctors

Objetivo:

- Eliminar mocks clínicos críticos y alinear UI con tablas reales.

Acciones:

1. Decidir contrato de prescripciones:
   - crear tabla `prescriptions`, o
   - modelarlas sobre `medical_records`.
2. Reemplazar `usePrescriptions` placeholder.
3. Reducir fallback mock en [medical-data-api.ts](/home/edu/Autamedica/apps/doctors/src/services/medical-data-api.ts) para historial y signos vitales.
4. Definir si recording/chat de sesión usarán tablas `session_*` o el namespace `telemedicine_*` ya existente.
5. Conectar estadísticas del shell doctor con queries reales.

Prioridad:

- P0: prescripciones
- P1: telemedicina recording/session tables
- P1: stats reales

### 3.3. Dominio Community

Objetivo:

- Resolver drift de contrato y evitar runtime failure.

Acciones:

1. Verificar si las tablas reales son:
   - `community_groups`, `community_posts`, `group_memberships`, `post_reactions`
   - o si faltan migrations.
2. Regenerar [database.types.ts](/home/edu/Autamedica/packages/types/src/supabase/database.types.ts).
3. Agregar E2E mínimo de comunidad con login real y lectura de grupos/posts.

Prioridad:

- P0.

### 3.4. Dominio Telemedicine

Objetivo:

- Unificar nombres de tablas y eliminar drift entre `session_*` y `telemedicine_*`.

Acciones:

1. Definir naming canónico:
   - Opción A: `telemedicine_sessions`, `telemedicine_room_participants`, `telemedicine_session_events`
   - Opción B: `session_recordings`, `session_participants`, `session_events`, `session_chat_messages`
2. Migrar código al naming canónico.
3. Regenerar tipos.
4. Quitar mocks de recording/chat donde sea posible.
5. Agregar pruebas end-to-end de sesión, participante y eventos.

Prioridad:

- P0.

### 3.5. Dominio Preventive / Screenings

Objetivo:

- Consolidar un solo flujo real sobre `patient_screenings` + `preventive_screenings`.

Acciones:

1. Eliminar hooks mock de screenings.
2. Mantener sólo hooks reales con RPC `get_recommended_screenings`.
3. Resolver joins incompletos como `specialty` pendiente.
4. Revisar `screening_reminder_notifications` para decidir si falta UI o sólo background worker.

Prioridad:

- P1.

### 3.6. Dominio Medical / Compliance

Objetivo:

- Exponer o cerrar explícitamente capacidades backend hoy invisibles.

Acciones:

1. Revisar si `medical_record_authorizations` debe tener UI para compartir/restringir registros.
2. Revisar si `patient_alerts` debe verse en paciente, médico o ambos.
3. Revisar si `patient_risk_factors` / `risk_factors` deben alimentar dashboards preventivos.
4. Revisar si `medical_audit_log` y `auth_audit` son sólo compliance interno.

Prioridad:

- P2.

## Priorización ejecutiva

### P0

- Corregir sesión/API real de anamnesis.
- Resolver drift de comunidad.
- Resolver drift de telemedicina (`session_*` vs `telemedicine_*`).
- Definir backend real de prescripciones.

### P1

- Eliminar mocks de screenings.
- Reducir duplicación `apps/patients` vs `apps/web`.
- Conectar stats doctor y recording/session features reales.

### P2

- Exponer capacidades backend hoy huérfanas o documentarlas como internas.

## Resumen ejecutivo

La plataforma no está hoy completamente confrontada contra la BD.

Estado confirmado:

- Hay un núcleo funcional real: pacientes, perfiles, médicos, citas, anamnesis, historial médico, parte de telemedicina, signos vitales y screenings.
- Hay drift estructural en comunidad y telemedicina.
- Hay features visibles todavía mockeadas o declaradas sin tabla real, especialmente prescripciones y parte de screenings.
- Hay bastante backend existente sin una superficie equivalente en producto.

Definición práctica:

- No falta "solo UI".
- No falta "solo BD".
- Faltan ambas cosas según dominio, y además falta cerrar el contrato canónico entre código y schema.
