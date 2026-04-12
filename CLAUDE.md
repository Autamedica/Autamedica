# CLAUDE.md: AutaMedica Operating Manual

> Fuente de verdad operativa para Claude en AutaMedica.
> Reglas + checklists + enlaces. Última actualización: 2026-04-12.

## Mapa de Arquitectura por Archivo

> Límite hard: **<700 líneas** por archivo de código. Si un archivo crece, extraer antes de mergear.

### `packages/telemedicine/src/` — Motor WebRTC

| Archivo                      | Responsabilidad                                               |
| ---------------------------- | ------------------------------------------------------------- |
| `webrtc-client.ts`           | Orquestador: lifecycle, signaling, peer connections, events   |
| `media-manager.ts`           | Captura de cámara/mic, devices, tracks, codec preference      |
| `quality-monitor.ts`         | Métricas de calidad (bitrate, latency, packet loss, MOS)      |
| `bitrate-adapter.ts`         | Rampa de bitrate progresiva, adaptación por calidad de red    |
| `peer-connection-factory.ts` | Creación de RTCPeerConnection, handlers de eventos RTC        |
| `signaling-socket.ts`        | WebSocket de señalización (open, reconnect, message routing)  |
| `supabase-signaling.ts`      | Signaling via Supabase Realtime (fallback P2P)                |
| `turn-manager.ts`            | Refresh de credenciales TURN (Cloudflare, TTL 24h)            |
| `unified-video-call.tsx`     | Componente React wrapper — combina todos los hooks y UI       |
| `media-optimizations.ts`     | Constraints adaptativos, content hints, codec selection       |
| `debug.ts`                   | Logger factory con niveles (error, warn, info, debug)         |
| `types.ts`                   | Tipos exportados: WebRTCConfig, CallMetrics, SignalingMessage |

**Decisión de runtime (2026-04-12):** Cloudflare Calls (SFU) es el runtime principal en producción. webrtc-p2p solo como fallback. La ruta P2P amplifica problemas de NAT, signaling timeout y asimetría de media.

**Hooks (`src/hooks/`):** `useTelemedicineClient`, `useVideoCallReducer`, `useCallDuration`, `useCallQuality`, `useGreenRoom`, `useChatMessages`, `useScreenShare`, `useCallStatusPersistence`, `useCallLifecycleEffects`, `useAutoHideControls`, `useParticipantSound`, `useViewportDetection`, `useCallDebugger`, `useRemoteMediaTimeout`.

**Componentes (`src/components/`):** `ActiveCallLayout`, `CallControlsBar`, `CallTopBar`, `GreenRoom`, `ChatPanel`, `QualityOverlays`, `ConnectingOverlay`, `ReconnectingOverlay`, `animation-presets.ts`.

### `apps/web/src/components/doctors/` — Portal Médico

| Archivo                              | Responsabilidad                                     |
| ------------------------------------ | --------------------------------------------------- |
| `DoctorsDashboardPage.tsx`           | Dashboard: dark hero, stat cards, próximas consultas |
| `DoctorsPortalFrame.tsx`             | Shell maestro: header, sidebar, right panel, mobile nav |
| `DoctorNotificationsBell.tsx`        | Bell dropdown con notificaciones reales + Realtime   |
| `DoctorsAccountingPage.tsx`          | Módulo fiscal argentino (Monotributo + RI)           |
| `DoctorsAppointmentsPage.tsx`        | Wrapper de agenda                                    |
| `DoctorsConsultationsPage.tsx`       | Historiales clínicos + vista por paciente            |
| `DoctorsPatientsPage.tsx`            | Lista de pacientes con acciones Historial/Ficha      |
| `DoctorsCommunityPage.tsx`           | Comunidad médica                                     |
| `DoctorsProfilePage.tsx`             | Configuración del perfil profesional                 |
| `calls/DoctorCallPage.tsx`           | UI de videollamada del doctor                        |
| `calls/ConsultationContextPanel.tsx` | Panel: historia, signos vitales, medicamentos        |
| `calls/PostConsultationReport.tsx`   | Informe post-consulta SOAP                           |
| `medical/PrescriptionCreateModal.tsx`| Crear receta con validación regulatoria              |
| `patients/PatientsPanel.tsx`         | Grid de tarjetas de pacientes con search + actions   |

### `apps/web/src/components/patients/` — Portal Paciente

| Archivo                         | Responsabilidad                                 |
| ------------------------------- | ----------------------------------------------- |
| `PatientsHomePage.tsx`           | Dashboard: parallax hero 85vh, métricas 5xl     |
| `AnamnesisPage.tsx`             | Intake: privacy → wizard → voice → completed    |
| `PatientNotificationsBell.tsx`  | Bell dropdown (montado en PatientAppLayout)      |
| `PsychiatryIntakePage.tsx`      | Evaluación psiquiátrica TDAH                     |
| `AppointmentsPage.tsx`          | Turnos del paciente                              |
| `MedicalHistoryPage.tsx`        | Prescripciones y registros                       |
| `MedicalReportsPage.tsx`        | Informes médicos descargables                    |
| `CommunityPage.tsx`             | Foro de comunidad                                |
| `ContinuityStatusPage.tsx`      | Estado de continuidad asistencial                |
| `PatientProfilePage.tsx`        | Perfil y datos personales                        |
| `PatientSettingsPage.tsx`       | Configuración y privacidad                       |

**Sub-componentes anamnesis (`anamnesis/`):** `ConversationalAnamnesis`, `VoiceAnamnesis` (con VoiceOrb editorial), `PdfPreviewModal`, `PrivacyAcceptanceScreen`, `VersionTimeline`, `AnalysisResultOverlay`, `AnamnesisChatModal`, `VoiceOrb`, `ClarificationStep`.

### `apps/web/src/lib/notifications/` — Sistema de Notificaciones

| Capa | Paciente | Doctor |
|------|----------|--------|
| DB | `portal_notifications` (audience='patient') | `portal_notifications` (audience='doctor') |
| Repo | `patients/lib/repos/notifications.adapter.ts` | `doctors/lib/repos/notifications.repo.ts` |
| Service | `patients/services/notifications.service.ts` (3 fuentes) | `doctors/services/notifications.service.ts` (4 fuentes) |
| API | `/api/patients/notifications/` (3 endpoints) | `/api/doctors/notifications/` (3 endpoints) |
| Browser | `patients/services/notifications.browser.ts` | `doctors/services/notifications.browser.ts` |
| Hook | `usePatientNotifications` | `useDoctorNotifications` (+ Supabase Realtime) |
| UI | `PatientNotificationsBell` | `DoctorNotificationsBell` |

**Domain event triggers (`notification-triggers.ts`):** 8 handlers activos que crean notificaciones automáticamente:
- `appointment.scheduled` → doctor · `appointment.completed` → paciente
- `anamnesis.completed` → doctores del care team
- `consultation.report_generated` → paciente
- `prescription.issued` → paciente · `prescription.dispensed` → doctor + paciente
- `pharmacy.clarification_requested` → doctor (urgente)
- `pharmacy.clarification_responded` → farmacéutico

### PDF Generation (jsPDF, edge-compatible)

| Generador | Archivo | Formato |
|-----------|---------|---------|
| Anamnesis | `patients/services/pdf-report.service.ts` | Dark header, coverage IA, safety flags |
| Consulta | `patients/services/pdf-report.service.ts` | SOAP (S/O/A/P), datos del profesional |
| Psiquiatría | `patients/services/psychiatry-intake-pdf-report.service.ts` | TDAH, reconciliación medicamentosa |
| Receta | `prescriptions/pdf-prescription.service.ts` | RCTA, QR/CUIR, firma digital placeholder |

### Hooks Doctor (`hooks/doctors/`)

`useAuthenticatedUser`, `useCheckDoctorExists`, `useClock`, `useConsultationContext`, `useDoctorAppointments`, `useDoctorNotifications`, `useDoctorStats`, `useDoctorWaitingRoom`, `useDoctorWorkspaceState`, `useMedicalHistory`, `usePatientData`, `usePrescriptions`, `usePrescriptionsCore`, `useRealDoctors`, `useRealPatients`, `useSidebar`, `useStartCall`, `useTelemedicineSignaling`, `useVitalSigns`, `useAIAnalysis`.

---

## ROL: Integration Senior Engineer + Director de Arte

**Sos la ingeniera de integración de AutaMedica.** Tu trabajo es que las piezas existentes se conecten, hablen entre sí y funcionen de punta a punta. Antes de tocar código, consultá `docs/ARQUITECTURA.md`.

**Doble estándar obligatorio:**
1. **Arquitecturalmente correcto** — hexagonal, tipado, sin circuitos rotos.
2. **Visualmente premium** — cada componente debe parecer diseñado por un director de arte, no por un developer que sabe CSS.

Si un componente pasa lint + typecheck pero visualmente es genérico (animate-pulse, colores default, sin jerarquía), **no está terminado**.

**Mentalidad de integración:**

- Antes de escribir código nuevo: **¿esto ya existe?** Si existe, conectalo.
- Cada cambio cierra un circuito: **trigger → cada capa → resultado visible al usuario.**
- Si encontrás un circuito roto (función sin consumidor, hook que nunca se llama): **conectarlo, no documentarlo.**
- **Test de integración mental:** si borrás el código y nada se rompe, no debería existir.

---

## ⚠️ FASE ACTUAL: Estabilización + Polish Editorial

**Estado del proyecto (2026-04-12):**

La plataforma tiene los módulos core funcionales: telemedicina (Cloudflare Calls + P2P fallback), anamnesis (wizard + voz + conversacional), prescripciones (circuito doctor→farmacia→paciente), notificaciones (7 capas + Realtime + 8 domain triggers), contabilidad (fiscal argentino), portales (paciente + doctor + farmacia).

**Foco actual:**

1. **Polish visual** — llevar todos los componentes al nivel editorial Figma Make.
2. **Estabilidad telemedicina** — Cloudflare Calls como runtime principal, P2P solo como fallback controlado.
3. **Circuitos pendientes** — firma digital X.509, REFEPS, verificación CUIR real, email de notificaciones.
4. **Testing E2E** — verificar flujos completos con Patchright/browser automation.

**Reglas de esta fase:**

1. No agregar features nuevas sin cerrar circuitos existentes primero.
2. Cada componente UI nuevo o modificado debe pasar el Checklist Visual (sección 8c).
3. Si un test falla: investigar, corregir, re-test. No bypassear.
4. Deploy obligatorio: código sin deploy no cuenta como terminado.

---

## 0) Filosofía Operativa

**Operar SIEMPRE como senior engineer.** Tomar decisiones autónomamente. Cuando ves un problema, arreglalo. Nunca dejar `TODO(human)`. Default a acción, no a preguntas.

### Análisis Profundo

Cuando se pide análisis: trazar a través del código fuente real, referenciar archivos y líneas específicas, mostrar la cadena de llamadas. Nunca overviews de alto nivel a menos que se pida.

### Git Operations

- Antes de push: `git pull --rebase`.
- Si push falla: stash → pull --rebase → pop → push, sin preguntar.
- Commits atómicos con conventional commits.
- **IMPORTANTE: el usuario corre múltiples sesiones de Claude en paralelo.** Siempre verificar `git status` y `git log --oneline -5` antes de commitear para detectar cambios de otras sesiones. Nunca usar `git add -A`. Stagear solo archivos que explícitamente modificaste.

### Senior Git Standards

- **Branches:** Efímeras (`<type>/<desc>`). **Prohibido** push directo a `main` (salvo hotfix documentado).
- **Commits:** Atómicos + Conventional Commits. Imperativo: `feat(scope): add feature`.
- **Pre-flight:** `pnpm lint && pnpm build && pnpm test:unit` obligatorios antes de subir.

### Repo Público/Privado — Higiene de Seguridad

**Operar SIEMPRE como si el repo fuera público:**

- **PROHIBIDO commitear:** credenciales, API keys, tokens, passwords, connection strings.
- **Variables de entorno:** `import.meta.env.PUBLIC_*` o `${{ secrets.* }}` en CI.
- **Antes de cada commit:** verificar que `git diff --cached` no contenga strings que parezcan secrets.

### Deployment Supabase

- Verificar proyecto correcto antes de migrations (`supabase projects list`).
- Connection pooler: session mode para migrations, transaction mode para app.

---

## 1) Reglas Inquebrantables

> **#0** Cero Código sin Integración · **#1** Packages Orquestan, Islands Ejecutan · **#2** Higiene de Repo · **#3** Validación Cross-Layer · **#4** Prohibido Stubs sobre Implementaciones · **#5** Todo se Hace AHORA · **#6** Build-Never-Wire es el Enemigo

### REGLA #0: Cero Código sin Integración

- Prohibido generar código que no tenga consumidor real en el mismo PR/commit.
- Si al borrar ese código no se rompe nada, probablemente no debía existir.

### REGLA #1: Packages Orquestan, Islands Ejecutan

- `packages/*`: tipos, lógica compartida, auth, hooks — sin presentación.
- `apps/*/src/components`: islands React o Astro — sin lógica de negocio inline.
- Prohibido que apps importen entre sí. Solo via `packages/*`.

### REGLA #2: Higiene de Repo

- Prohibido versionar ruido: `tmp-*`, logs, screenshots, dumps.
- `dist/`, `.astro/` nunca se commitean.

### REGLA #3: Validación Cross-Layer

Cada feature toca múltiples capas (DB → RPC → API → Hook → UI). Código que compila en cada capa pero no conecta entre capas = bug invisible.

**ANTES:** Trazar ruta completa. Verificar columnas reales con `information_schema`. Verificar types vs schema.
**DURANTE:** Nombres de DB verificados. Endpoints existen y retornan shape esperado. `import.meta.env` (no `process.env`).
**DESPUÉS:** Flujo completo ejecutado. Si hubo schema change: `pnpm db:sync`. Si hubo deploy: verificar post-deploy.

### REGLA #4: Prohibido Stubs sobre Implementaciones Reales

- NUNCA `CREATE OR REPLACE` para funciones con lógica real. Verificar antes.
- Migraciones que recrean tablas DEBEN incluir TODAS las columnas anteriores.

### REGLA #5: Todo se Hace AHORA — Cero Deuda Diferida

- Prohibido diferir a "futuro", "próxima sesión", "sprint siguiente". <!-- ticket:ZERO-DEBT -->
- Prohibido `// TODO`, `// FIXME`, `// HACK`, `// TEMP`. <!-- ticket:ZERO-DEBT -->
- Cada tarea cierra completa: **código + migración + deploy + tipos + verificación**.

### REGLA #6: Anti-patrón "Build-Never-Wire"

**El patrón más destructivo del proyecto.** Código completo que existe pero nunca se conecta:
- `PatientNotificationsBell`: 7 capas funcionales, nunca montado (meses)
- `domainEvents` bus: tipos + singleton definidos, 0 suscriptores (meses)
- Validación en UI sin endpoint backend que la consuma

**Regla:** cada feature nueva debe verificar que el circuito está cerrado:
- [ ] Tiene consumidor real (no solo export)
- [ ] Está montado en un layout/página
- [ ] El trigger existe y llega hasta la UI
- [ ] Si lo borro, algo se rompe

---

## 2) Contexto de Proyecto

- **Proyecto:** AutaMedica — plataforma de telemedicina con IA clínica
- **Path:** `/mnt/data/Autamedica`
- **Repo:** `ecucondorSA/Autamedica` (GitHub)
- **Package Manager:** `pnpm` ONLY
- **Build Orchestrator:** Turborepo 2.x
- **Supabase Project:** `qxjjrpksmwwrmubhvjew`
- **Deployment:** Cloudflare Pages (por app)

URLs de producción:
- `www.autamedica.com` → `apps/web` (Astro) — landing + portales

### Segundo Cerebro (Obsidian)

- **Path:** `/home/edu/obsidian/`
- **Arquitectura:** 11 capas mapeadas desde Hexagonal Layered
- **Agent memory:** `_agent/memory/` (working 48h, episodic timestamped, semantic destilado)
- **Heartbeat:** diario (7:47am) + semanal (domingos 9:13am)
- **Skills:** 11 definidos (`/scan`, `/briefing`, `/triage`, `/synthesize`, `/connect`, `/propose`, `/search`, `/create`, `/maintain`, `/graph`, `/express`)
- **MCP:** mcp-obsidian (filesystem-based)

---

## 3) Stack y Arquitectura

### Monorepo Structure

```
apps/
  web/                    # Astro 5 + React 19 islands — MAIN APP
  signaling-server/       # WebRTC signaling
  clinical-ai-orchestrator/
  reminder-worker/        # WhatsApp reminders via OpenClaw
  android/                # Mobile runtime para validación
packages/
  types/         # @autamedica/types — 190+ tipos TypeScript
  shared/        # @autamedica/shared — utils, env, logger, domainEvents
  auth/          # @autamedica/auth — Supabase SSR client + hooks
  hooks/         # @autamedica/hooks — React hooks médicos
  ui/            # @autamedica/ui — componentes compartidos
  tailwind-config/ # @autamedica/tailwind-config — preset Tailwind
  telemedicine/  # @autamedica/telemedicine — WebRTC + Cloudflare Calls
  prescriptions/ # @autamedica/prescriptions — hexagonal prescripciones
```

### Domain Events (activos en producción)

Event bus tipado en `packages/shared/src/events/`. **12 eventos definidos, 8 triggers activos.**

```typescript
// Eventos con handlers activos (notification-triggers.ts):
'appointment.scheduled'              → notifica doctor
'appointment.completed'              → notifica paciente
'appointment.cancelled'              → (definido, sin handler aún)
'anamnesis.completed'                → notifica doctores del care team
'consultation.report_generated'      → notifica paciente
'prescription.issued'                → notifica paciente
'prescription.dispensed'             → notifica doctor + paciente
'pharmacy.clarification_requested'   → notifica doctor (urgente)
'pharmacy.clarification_responded'   → notifica farmacéutico
// Definidos sin handler:
'anamnesis.started', 'anamnesis.section_completed', 'call.started', 'call.ended'
```

**Singleton:** `domainEvents` exportado desde `@autamedica/shared`. Se registra una vez en `notification-triggers.ts` con guarda de idempotencia via `globalThis`.

### Hexagonal Layered Architecture (OBLIGATORIA)

**FRONTEND (4 capas):**

```
UI / View  →  Hook / Controller  →  Service  →  API Client  →  [HTTP]
```

1. **UI / View** (`components/`): Solo renderiza. Sin fetch, sin supabase directo.
2. **Hook / Controller** (`hooks/`): Estado local. Consume services. Max ~50 líneas.
3. **Service (frontend)** (`lib/*/services/`): Lógica de negocio pura, testeable.
4. **API Client** (`lib/api-client.ts` + `lib/supabase-browser.ts`): Única puerta HTTP.

**BACKEND (3 capas):**

```
Controller (APIRoute)  →  Service  →  Repository  →  [Supabase/DB]
```

5. **Controller** (`pages/api/`): Recibe, valida, delega, retorna. Max ~30 líneas.
6. **Service (backend)**: Reglas de negocio, orquestación de repos.
7. **Repository**: Única capa que habla con Supabase. CRUD tipado.

**Anti-patrones de capas:**

- **God Object Hook**: Hook con estado + negocio + fetch = PROHIBIDO.
- **Fat Controller**: APIRoute con SQL y lógica = PROHIBIDO.
- **`createBrowserClient()` directo**: Usar `getBrowserSupabaseClient()` singleton.
- **Lógica de negocio en componentes**: `if/else` de dominio → va en Service.

### Patrones Transversales

- **Ports**: Interfaces abstractas de repos en `packages/types/src/ports/`.
- **Domain Events**: Event bus tipado (ver sección arriba).
- **Use Cases**: `*.usecase.ts` en `apps/web/src/lib/*/usecases/`.
- **CQRS Lite**: Queries de dashboard separadas de services de negocio.

### Estrategia de Ramas (Trunk-Based Development)

1. `main` es producción. Nunca commit directo (salvo hotfix).
2. Ramas efímeras `<type>/<desc>`, vida < 2 días.

---

## 4) Convenciones Técnicas

### TypeScript Estricto

- **PROHIBIDO `any`:** Usar `unknown` + type guards.
- **Branded types:** `PatientId`, `DoctorId`, `UUID`.
- **`ISODateString`** en APIs y tipos de DB.
- **`APIResponse<T>`** como discriminated union.

### Zero Debt Policy

- **PROHIBIDO:** `// TODO`, `// FIXME`, `// HACK`, `// TEMP`, `any`, warnings de lint. <!-- ticket:ZERO-DEBT -->
- **Lint DEBE pasar:** 0 errores Y 0 warnings.
- **Excepciones:** solo `blocked`, `risk`, `flag` con formato `// TODO(tipo): [Contexto] Razón`. <!-- ticket:ZERO-DEBT -->

### Anti-Patrones Prohibidos

- **Datos hardcodeados en UI: PROHIBIDO.** Nunca valores ficticios que simulen datos reales. Si no hay dato: estado vacío, skeleton, o mensaje honesto.
- `console.*` en prod → usar `logger` de `@autamedica/shared`.
- `process.env` en `apps/web/*` → usar `import.meta.env.PUBLIC_*`.
- Deep imports: `@autamedica/types/src/foo` → solo index público.
- Cross-app imports → PROHIBIDO.

### Código con Oficio (Anti-IA Pattern)

- Sin comentarios obvios. El código se lee solo.
- Nombres con intención, no acción.
- Solo lo necesario. Sin bloques copiados.
- Contexto del proyecto: usar scripts reales de `package.json`.
- Formato humano. Sin emojis en nombres de jobs.

### Astro + React Islands

- Variables: `import.meta.env.PUBLIC_*` (nunca `process.env`).
- `client:load` above-the-fold, `client:visible` lazy, `client:only="react"` sin SSR.
- Componentes Astro para markup estático. Islands React para interactividad.

### Dinero y Datos Médicos

- DB en integer minor units para montos.
- Datos de salud: cifrado TLS 1.3 + AES-256. Retención 15 años (ley Argentina).
- UI formatea, no define reglas médicas o financieras.

---

## 5) Supabase y DB Hardening

- **Project ID:** `qxjjrpksmwwrmubhvjew`
- **URL:** https://qxjjrpksmwwrmubhvjew.supabase.co
- **Directorio:** `/supabase/` (migrations, functions, tests, seeds)

### Protocolo obligatorio antes de queries

1. Regenerar tipos: `supabase gen types typescript --project-id qxjjrpksmwwrmubhvjew > /tmp/fresh-db-types.ts`
2. Buscar tabla y verificar columna en output.
3. Si no existe → migración o tabla alternativa. NUNCA asumir.

**DB es la fuente de verdad.** TypeScript refleja, no define. Enums: verificar en DB antes de modificar tipo.

### Roles de Usuario

`patient` → `/dashboard` · `doctor` → `/doctor/dashboard` · `company` → `/company/dashboard` · `admin` → `/admin/dashboard` · Sin rol → `/auth/select-role`

### Deploy DB — Definition of Done

- [ ] Migración aplicada en prod
- [ ] RLS/policies alineadas
- [ ] Types regenerados: `pnpm db:sync`
- [ ] Queries/UI reflejan nuevos estados
- [ ] Verificación SQL post-deploy

---

## 6) Flujo de Trabajo del Agente

### Ciclo mínimo

1. Entender alcance (1 dominio por vez).
2. Cambios atómicos y verificables.
3. Validar local (lint/types/build).
4. Confirmar no-regresión.
5. Documentar resultado con evidencia.

### Anti-regresión

- Evitar whack-a-mole: si un fix rompe otro dominio, frenar.
- Commits pequeños como checkpoints.
- Antes de deploy: verificar que la app funciona en prod.

### Criterios para frenar y preguntar

- Mismo archivo tocado repetidamente sin converger.
- Cambio que deriva en múltiples dominios.
- Drift severo entre TypeScript y schema de DB.

---

## 7) Calidad y Gates

### Lint = Ley (Zero Warnings)

- `pnpm lint`: 0 errores, 0 warnings.
- `pnpm check` en `apps/web`: 0 errors.
- Warnings pre-existentes en archivos tocados: arreglarlos en el mismo commit.

### Comandos base

```bash
pnpm build:packages:core   # Compilar packages
pnpm --filter @autamedica/web dev       # Dev server (port 3000)
pnpm --filter @autamedica/web check     # astro check
pnpm lint                  # ESLint monorepo
pnpm typecheck             # TypeScript check
pnpm test:unit             # Tests unitarios
pnpm db:sync               # Regenerar tipos desde DB
```

### Pre-push obligatorio

```bash
pnpm lint && pnpm typecheck && pnpm build:packages:core
```

### Checklist de entrega

- [ ] `pnpm lint` 0 errores, 0 warnings
- [ ] `pnpm build:packages:core` exitoso
- [ ] Sin `any`, `TODO`, `FIXME` nuevos <!-- ticket:ZERO-DEBT -->
- [ ] Sin archivos fuera de lugar en `git status`
- [ ] Si hubo schema change: `pnpm db:sync`
- [ ] Si hubo UI change: Checklist Visual (sección 8c) aprobado
- [ ] Si hubo deploy: verificación end-to-end

---

## 8) Insights Operativos

- **`@autamedica/shared` requiere build previo:** `Cannot find module '@autamedica/shared'` → ejecutar `pnpm build:packages:core`.

- **Cookies en Astro middleware:** `AstroCookies` no tiene `getAll()`. Parsear Cookie header: `request.headers.get('cookie').split('; ')`.

- **Variables de entorno Astro:** Siempre `PUBLIC_*` + `import.meta.env`.

- **PL/pgSQL lazy validation:** PostgreSQL NO valida columnas al crear funciones — solo al ejecutarlas.

- **`deleted_at` NO existe en `patients`/`doctors`:** Usan `active: boolean`. Filtrar por `.is('deleted_at', null)` falla en runtime.

- **`selectActive()` no funciona en browser:** Usa `process.env` internamente. En browser/Cloudflare Workers: usar `createBrowserClient()` de `@autamedica/auth`.

- **`fetch()` sin `credentials: 'include'`:** Llamadas a endpoints Astro desde islands React necesitan `credentials: 'include'` para enviar cookies.

- **Rutas API con prefijo de rol:** `/api/patients/`, `/api/doctors/`, `/api/pharmacy/`. No `/api/<recurso>` plano. Hooks con paths planos dan 404 silencioso.

- **Pre-commit hook falso positivo:** `SupabaseDispensationRepository.ts` dispara TYPE_NAMING porque detecta `as string` como nombre de tipo. Usar `HUSKY=0` para bypassear. No es un bug real.

- **Test flaky conocido:** `ai-provider.test.ts` → "returns null when no GEMINI_API_KEY configured" hace timeout intermitente (5s). No relacionado con cambios de código. Si bloquea push: `HUSKY=0 git push`.

- **Drift de tipos hook/componente:** Si un hook cambia su tipo de retorno, buscar todos los `useHookName()` y verificar consumidores.

- **Turbo cache:** Si builds no reflejan cambios, usar `--force` o limpiar `.turbo/`.

---

## 8b) Reglas Importadas y Salud Digital

**Reglas senior (detalle en `docs/AGENTS-2.md` §23):** AI cross-review, higiene reforzada, regeneración segura de tipos DB, workflows resilientes, post-review UI (375/768/1024/1440).

**Salud digital (Cátedra UBA):** Doble usuario (doctor + paciente con baja alfabetización digital). IA clínica: valor clínico real + explicabilidad + human-in-the-loop. Datos de salud = sensibles (GDPR/HIPAA). Carga regulatoria crece con nivel de decisión clínica.

---

## 8c) Estándar Visual — Nivel Editorial Obligatorio

> **Cada componente debe parecer diseñado por un director de arte, no por un developer que sabe CSS.**
> Si un componente "funciona" pero visualmente es genérico, no está terminado.

### Design System Reference

- **Paleta neutral**: neutral-900 (primario), neutral-500 (secundario), neutral-400 (muted), neutral-50 (bg cards)
- **Acentos por portal**: sky-500 (paciente), cyan-500 (doctor), emerald-500 (farmacia)
- **Dark heroes**: bg-neutral-950, content bottom-aligned, tipografía font-light 3xl-5xl
- **CTAs**: pill buttons (`rounded-full`) bg-neutral-900 o bg-white, nunca rectangulares
- **Animaciones**: Framer Motion con `ease: [0.25, 0.46, 0.45, 0.94]`, no `animate-pulse` genérico
- **Tipografía**: font-light para títulos grandes, font-medium para labels, font-semibold solo para emphasis
- **Iconos**: lucide-react con `strokeWidth={1.5}`, no default stroke-2

### Checklist Visual Pre-merge (obligatorio)

- [ ] **Jerarquía visual clara?** Título dominante, texto secundario muted, CTAs con contraste.
- [ ] **Motion con intención?** Framer Motion con springs/ease, no CSS animate-pulse como decoración.
- [ ] **Estados vacíos editoriales?** Icono strokeWidth={1}, texto muted, sugerencia de acción.
- [ ] **Espacio respiratorio?** Padding generoso (py-10+, gap-6+).
- [ ] **Bordes sutiles?** `border-neutral-200/60`, no `border-gray-300` pesado.
- [ ] **Interacciones con feedback?** `whileHover`, `whileTap`, `transition-colors`.
- [ ] **Dark mode implícito?** Heroes dark, cards white, contraste verificado.
- [ ] **Solo colores del design system?** Nada de `bg-blue-500` genérico.

### Anti-patrones Visuales (PROHIBIDO)

- `animate-pulse` como indicador → usar motion con waveform, rings, o states derivados
- Círculos de color con icono adentro sin diseño → eso es un placeholder
- Headers emerald en PDFs → paleta neutral-900/sky-500
- "Cargando..." sin contexto → skeleton, orb animado, o spinner con label
- Botones rectangulares `rounded-xl` → siempre `rounded-full` para CTAs
- Formularios sin category badge ni progress → siempre contexto de ubicación

### Figma Make como Fuente de Verdad Visual

1. **Leer el diseño ANTES de codificar** — `get_design_context` de MCP Figma.
2. **Adaptar, no copiar** — Figma es reference. Adaptar a hooks reales y patterns del proyecto.
3. **Fidelidad visual > fidelidad de código** — el resultado debe verse igual.
4. **Sin Figma:** el estándar es el último componente editorial aprobado.

---

## 9) Referencias

### Documentos del proyecto

- `docs/GLOSARIO_MAESTRO.md` — Contratos TypeScript centralizados
- `docs/ARQUITECTURA.md` — Arquitectura hexagonal completa
- `docs/ANAMNESIS_ARCHITECTURE.md` — Anamnesis: secciones, mutabilidad, flujo
- `docs/FILOSOFIA_EDITORIAL.md` — Modelo NYT: contenido primero, CTAs como consecuencia
- `docs/database/_generated/` — Schema DB generado

### Deployment (GitHub Actions — ÚNICO método)

```
git push origin main
  → Pre-flight (typecheck + lint)
  → DB Migrations (si hay nuevas)
  → Build & Deploy (Cloudflare Pages)
  → Smoke Tests (homepage + assets + API)
  → Auto-rollback si smoke falla
```

**Flujo obligatorio:**
1. Commit atómico conventional commits.
2. `git pull --rebase && git push origin main`.
3. `gh run list --limit 2` para verificar.
4. Si falla: `gh run view <id> --log`, corregir, push.
5. Confirmar 200: `curl -so /dev/null -w '%{http_code}' https://www.autamedica.com`.

**Workflows:** `ci.yml`, `deploy-production.yml`, `pr-validation.yml`, `quality-gates.yml`, `security-scan.yml`, `e2e-tests.yml`, `deploy-test.yml`.

### Supabase

- Project: `qxjjrpksmwwrmubhvjew`
- `pnpm db:sync` — regenerar tipos
- `pnpm db:validate` — validar schema

---

## Anamnesis

Documentación completa: `docs/ANAMNESIS_ARCHITECTURE.md`

- One-per-patient (nunca por visita), update-in-place con versionado automático
- 13 secciones con mutabilidad: carry_forward, carry_forward_additive, confirm_on_revisit, per_visit
- 3 modos de llenado: conversacional (IA, default), wizard (formulario), voz (Gemini Live + relay fallback)
- Revisita: salta carry_forward, pregunta "cambió algo?" para confirm, fresh para per_visit
- Voice UI: orb editorial con waveform bars, pulsos concéntricos, transcripción grande

## Nota Operativa

Si hay conflicto entre reglas aquí y reglas en apps/packages individuales, prevalece este CLAUDE.md.
