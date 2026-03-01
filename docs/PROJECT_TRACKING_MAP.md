# AutaMedica — Mapa Estructural de Seguimiento

> Guia de consulta para revision, analisis, testing, optimizaciones y logica del proyecto.
> Actualizado: 2026-03-01

---

## Indice

1. [Vista General del Sistema](#1-vista-general-del-sistema)
2. [Estado de Salud por Modulo](#2-estado-de-salud-por-modulo)
3. [Metricas de Deuda Tecnica](#3-metricas-de-deuda-tecnica)
4. [Mapa de Flujos de Datos](#4-mapa-de-flujos-de-datos)
5. [Estrategia de Testing](#5-estrategia-de-testing)
6. [Plan de Optimizaciones](#6-plan-de-optimizaciones)
7. [Checklists de Revision](#7-checklists-de-revision)
8. [Riesgos y Mitigaciones](#8-riesgos-y-mitigaciones)
9. [Cadencia de Seguimiento](#9-cadencia-de-seguimiento)

---

## 1. Vista General del Sistema

### Arquitectura

```
                    ┌─────────────────────────────────────────────┐
                    │              CLOUDFLARE PAGES               │
                    │  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
                    │  │  web    │ │ patients │ │   doctors   │  │
                    │  │ (Astro) │ │ (Next.js)│ │  (Next.js)  │  │
                    │  └────┬────┘ └────┬─────┘ └──────┬──────┘  │
                    │  ┌────┴────┐ ┌────┴─────┐ ┌──────┴──────┐  │
                    │  │companies│ │  admin   │ │  signaling  │  │
                    │  │(Next.js)│ │(Next.js) │ │  (Express)  │  │
                    │  └─────────┘ └──────────┘ └─────────────┘  │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────────────┐
                    │              PACKAGES (shared)              │
                    │  types · shared · auth · hooks · ui         │
                    │  telemedicine · session · tailwind-config    │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────────────┐
                    │           SUPABASE (PostgreSQL)             │
                    │  43+ tablas · 50+ RLS policies              │
                    │  40+ RPCs · 6 Edge Functions                │
                    │  LiveKit (WebRTC SFU)                       │
                    └────────────────────────────────────────────-┘
```

### Apps — Estado Actual

| App                | Framework           | Puerto | URL Produccion                 | Fase             |
| ------------------ | ------------------- | ------ | ------------------------------ | ---------------- |
| `web`              | Astro 5 + React 19  | 3000   | www.autamedica.com             | Migracion activa |
| `patients`         | Next.js 15          | 3002   | autamedica-patients.pages.dev  | Produccion       |
| `doctors`          | Next.js 15          | 3001   | autamedica-doctors.pages.dev   | Produccion       |
| `companies`        | Next.js 15          | 3003   | autamedica-companies.pages.dev | MVP              |
| `admin`            | Next.js 15          | 3004   | autamedica-admin.pages.dev     | MVP              |
| `signaling-server` | Express + Socket.io | 8080   | -                              | Produccion       |

### Packages — Grafo de Dependencias

```
typescript-config ──► (todos)
tailwind-config ───► (apps con UI)

types ─────────────► shared ──────► auth ──────► hooks
                        │              │            │
                        ▼              ▼            ▼
                     session      supabase-client   ui
                                                    │
                                                    ▼
                                               telemedicine
```

---

## 2. Estado de Salud por Modulo

### Semaforo de Apps

| App         | strict TS    | `any` count | Tests   | Console.\* | Middleware | Score |
| ----------- | ------------ | ----------- | ------- | ---------- | ---------- | ----- |
| `web`       | ✅           | 151         | 0 files | 65         | ✅         | 🟡    |
| `patients`  | ❌ **false** | 219         | 10 e2e  | 26         | ✅         | 🔴    |
| `doctors`   | ✅           | 83          | 0 files | 42         | ✅         | 🟡    |
| `companies` | ✅           | bajo        | 0 files | bajo       | ✅         | 🟡    |
| `admin`     | ✅           | bajo        | 0 files | bajo       | ✅         | 🟡    |
| `signaling` | ✅           | 16          | 2 files | bajo       | N/A        | 🟢    |

### Semaforo de Packages

| Package        | Build   | Tests | Exports limpios | Score |
| -------------- | ------- | ----- | --------------- | ----- |
| `types`        | ✅ tsc  | 0     | ✅              | 🟢    |
| `shared`       | ✅ tsup | 5     | ✅              | 🟢    |
| `auth`         | ✅ tsup | 3     | ✅              | 🟢    |
| `hooks`        | ✅ tsc  | 0     | ✅              | 🟡    |
| `telemedicine` | ✅ tsc  | 2     | ✅              | 🟡    |
| `ui`           | ✅ tsc  | 0     | ✅              | 🟡    |
| `session`      | ✅ tsup | 0     | ✅              | 🟡    |

### Semaforo de Infraestructura

| Area                   | Estado | Detalle                         |
| ---------------------- | ------ | ------------------------------- |
| CI/CD (GitHub Actions) | 🟢     | 6 workflows, PR validation      |
| Pre-commit hooks       | 🟢     | Debt tags, convenciones, lint   |
| Pre-push hooks         | 🟢     | Lint, typecheck, build          |
| Supabase migrations    | 🟢     | 2 activas, baseline consolidado |
| Edge Functions         | 🟢     | 6 funciones, auth validado      |
| RLS policies           | 🟢     | 50+ policies, tests basicos     |
| Deployment             | 🟢     | Cloudflare Pages, automatizado  |

---

## 3. Metricas de Deuda Tecnica

### Dashboard de Deuda (snapshot 2026-03-01)

```
CRITICO (bloquea calidad):
  ├── any types .............. 567+  (target: 0)
  ├── strict:false ........... 1 app (target: 0)
  ├── TS errors (doctors) .... 19    (target: 0)
  └── .next en git ........... 667MB (target: 0)

ALTO (degrada mantenibilidad):
  ├── console.* en prod ...... 133   (target: 0, usar logger)
  ├── debt tags sin ref ...... 73    (target: 0) <!-- ticket:TRACKING -->
  ├── Cross-app imports ...... 4     (target: 0)
  └── TURN servers hardcoded . 2     (target: config via env)

MEDIO (mejora incremental):
  ├── Test coverage apps ..... ~5%   (target: >40%)
  ├── Test coverage pkgs ..... ~12%  (target: >60%)
  └── Duplicate components ... ~6    (web ↔ companies)

BAJO (mantenimiento):
  ├── .gitignore gaps ........ 3 patrones
  ├── Bundle analysis ........ no configurado
  └── Docs desactualizados ... revisar TTL
```

### Detalle por Categoria

#### `any` Types — Top 5 Archivos

| Archivo                                               | Count | Prioridad |
| ----------------------------------------------------- | ----- | --------- |
| `apps/patients/src/lib/ai/context-builder.ts`         | ~15   | P0        |
| `apps/web/src/lib/patients/lib/ai/context-builder.ts` | ~12   | P0        |
| `apps/web/src/lib/supabase.ts`                        | ~8    | P0        |
| `apps/doctors/src/components/medical/*`               | ~10   | P1        |
| `apps/patients/src/hooks/useWebRTC.ts`                | ~6    | P1        |

#### TODOs Criticos (requieren accion inmediata)

| Archivo                                                      | Linea | Descripcion                   | Riesgo       |
| ------------------------------------------------------------ | ----- | ----------------------------- | ------------ |
| `apps/web/src/hooks/patients/useWebRTC.ts`                   | 89    | TURN servers para produccion  | 🔴 Prod      |
| `apps/patients/src/app/consultation/[id]/page.tsx`           | 16    | IDs reales del usuario        | 🔴 Seguridad |
| `packages/auth/src/email.ts`                                 | 114   | Verificacion existencia en DB | 🟠 Auth      |
| `apps/web/src/components/doctors/vitals/VitalSignsPanel.tsx` | -     | Hook no existe aun            | 🟠 Feature   |
| `apps/web/src/components/doctors/records/RecordsPanel.tsx`   | -     | Replace con hook real         | 🟠 Feature   |

---

## 4. Mapa de Flujos de Datos

### 4.1 Autenticacion

```
Usuario                  Astro/Next.js             Supabase
  │                         │                         │
  ├──► Login ──────────────►│                         │
  │                         ├──► signInWithOAuth() ──►│
  │                         │◄── redirect callback ◄──┤
  │                         │                         │
  │                         ├──► exchangeCodeForSession│
  │                         │◄── session (JWT) ◄──────┤
  │                         │                         │
  │                         ├── Set cookies ──────────│
  │                         │                         │
  │◄── Redirect a portal ◄─┤                         │
  │    segun rol            │                         │
```

**Roles y portales:**

```
patient         ──► /dashboard          (apps/patients)
doctor          ──► /doctor/dashboard   (apps/doctors)
company_admin   ──► /company/dashboard  (apps/companies)
admin           ──► /admin/dashboard    (apps/admin)
sin rol         ──► /auth/select-role   (apps/web)
```

### 4.2 Consulta Medica (Telemedicina)

```
Paciente              API Route            Supabase          LiveKit/Signaling
  │                      │                    │                    │
  ├──► Iniciar sesion ──►│                    │                    │
  │                      ├──► INSERT session ►│                    │
  │                      │◄── session data ◄──┤                    │
  │                      │                    │                    │
  │                      ├──► POST /create ──────────────────────►│
  │                      │◄── {token, url} ◄─────────────────────┤
  │                      │                    │                    │
  │◄── {session, token} ─┤                    │                    │
  │                      │                    │                    │
  ├──► Connect LiveKit ──────────────────────────────────────────►│
  │                      │                    │                    │
  │◄─────────── WebRTC P2P / SFU ──────────────────────────────►│
```

### 4.3 Ingesta de Observaciones Clinicas

```
Paciente/Dispositivo     Edge Function         Supabase
  │                          │                    │
  ├──► POST observation ────►│                    │
  │    {type, payload}       │                    │
  │                          ├──► getUser() ─────►│
  │                          │◄── user ◄─────────┤
  │                          │                    │
  │                          ├──► INSERT vital ──►│
  │                          │                    │
  │                          ├── deriveAlert() ───│
  │                          │   (reglas clinicas)│
  │                          │                    │
  │                          ├──► RPC alert ─────►│
  │                          │   (si critico)     │
  │                          │                    │
  │◄── {source, alert_id} ◄─┤                    │
```

### 4.4 Patrones de Acceso a Datos

| Patron                        | Uso             | Ejemplo                                  | Seguridad     |
| ----------------------------- | --------------- | ---------------------------------------- | ------------- |
| **Cliente directo** (60%)     | CRUD simple     | `supabase.from('appointments').select()` | RLS           |
| **API Route** (30%)           | Logica compleja | `POST /api/telemedicine/session`         | Session + RLS |
| **Edge Function → RPC** (10%) | Privilegiado    | `ingest-patient-observation`             | Service role  |
| **Service class** (doctors)   | Abstraccion     | `AppointmentsService.getAppointments()`  | RLS           |

---

## 5. Estrategia de Testing

### Estado Actual

```
                    Tests Existentes          Cobertura Objetivo
                    ─────────────────         ──────────────────
apps/web:           0 unit, 0 e2e            20 unit, 5 e2e
apps/patients:      0 unit, 10 e2e           15 unit, 10 e2e
apps/doctors:       0 unit, 0 e2e            15 unit, 5 e2e
apps/companies:     0 unit, 0 e2e            5 unit, 2 e2e
apps/admin:         0 unit, 0 e2e            5 unit, 2 e2e
apps/signaling:     2 unit, 0 e2e            10 unit, 3 e2e
packages/shared:    5 unit                   10 unit
packages/auth:      3 unit                   8 unit
packages/telemed:   2 unit                   8 unit
packages/hooks:     0 unit                   5 unit
packages/types:     0 (puro tipos)           validators only
```

### Plan de Testing por Prioridad

#### P0: Flujos Criticos (sin tests, riesgo alto)

1. **Auth flow completo** (login → session → role redirect)
   - Unit: middleware de cada app (session validation)
   - E2E: login con Google, redirect segun rol, logout
   - Archivo: `tests/e2e/auth-flow.spec.ts`

2. **Telemedicina session lifecycle** (crear → conectar → finalizar)
   - Unit: API routes de session, participants, events
   - E2E: crear sesion, verificar token LiveKit, cerrar sesion
   - Archivo: `tests/e2e/telemedicine-session.spec.ts`

3. **Ingesta de observaciones** (edge function: vital signs + alertas)
   - Unit: `deriveAlert()` logic, edge function handler
   - Integration: POST observacion → verificar alerta en DB
   - Archivo: `packages/telemedicine/src/__tests__/observations.test.ts`

#### P1: Datos Medicos (riesgo medio-alto)

4. **Appointments CRUD** (crear, actualizar, cancelar)
   - Unit: API routes en patients app
   - E2E: crear cita, ver en dashboard, cancelar

5. **Medical history** (alergias, medicaciones, condiciones)
   - Unit: API routes, validacion de datos
   - E2E: agregar alergia, verificar en historial

6. **Preventive screenings** (recomendaciones por edad/genero/riesgo)
   - Unit: RPC `get_recommended_screenings` logic
   - Integration: verificar recomendaciones para perfiles distintos

#### P2: UI y UX (riesgo medio)

7. **Dashboard paciente** (carga correcta de datos, navegacion)
8. **Dashboard doctor** (lista de pacientes, citas del dia)
9. **Componentes compartidos** (ui package)

### Frameworks y Herramientas

| Tipo          | Herramienta         | Config                             |
| ------------- | ------------------- | ---------------------------------- |
| Unit tests    | Vitest              | `vitest.config.ts` por app/package |
| E2E tests     | Playwright          | `playwright.config.ts` root        |
| Browser tests | Vitest Browser Mode | `vitest.browser.config.ts`         |
| Coverage      | @vitest/coverage-v8 | threshold 40% P0, 60% packages     |
| Duplicacion   | JSCPD               | `.jscpd.json`                      |
| Dependencias  | Dependency Cruiser  | `.dependency-cruiser.cjs`          |

### Comandos

```bash
pnpm test:unit                    # Todos los unit tests
pnpm test:unit -t "auth"          # Filtrar por nombre
pnpm test:e2e                     # Playwright completo
pnpm test:auth                    # Auth browser tests
pnpm dup                          # Deteccion de duplicacion
pnpm depcruise                    # Validar dependencias
```

---

## 6. Plan de Optimizaciones

### 6.1 Acciones Inmediatas (esta semana)

| #   | Accion                  | Impacto     | Esfuerzo | Comando/Archivo                                    |
| --- | ----------------------- | ----------- | -------- | -------------------------------------------------- |
| 1   | Remover `.next` de git  | -667MB repo | 5min     | `git rm -rf apps/patients/.next --cached`          |
| 2   | Actualizar `.gitignore` | Higiene     | 5min     | Agregar `**/.turbo/*.log`, `**/type-errors.log`    |
| 3   | Fix TS errors doctors   | Build roto  | 1h       | `apps/doctors/type-errors.log` (19 errores)        |
| 4   | Fix cross-app imports   | REGLA #1    | 30min    | 4 archivos en `apps/web/src/components/companies/` |

### 6.2 Sprint 1: TypeScript Strictness (1-2 semanas)

| #   | Accion                         | Archivos        | Estrategia                                   |
| --- | ------------------------------ | --------------- | -------------------------------------------- |
| 5   | Habilitar strict en patients   | `tsconfig.json` | Habilitar, corregir errores incrementalmente |
| 6   | Eliminar `any` en auth/session | ~15 archivos    | `unknown` + type guards                      |
| 7   | Eliminar `any` en supabase.ts  | 1 archivo       | Tipar cookies adapter                        |
| 8   | Eliminar `any` en AI context   | 2 archivos      | Interfaces para AI payloads                  |

### 6.3 Sprint 2: Observabilidad y Logging (1 semana)

| #   | Accion                           | Archivos       | Estrategia                                    |
| --- | -------------------------------- | -------------- | --------------------------------------------- |
| 9   | Reemplazar console.\* con logger | 133 instancias | `import { logger } from '@autamedica/shared'` |
| 10  | Configurar TURN servers via env  | 2 archivos     | `PUBLIC_TURN_URL`, `PUBLIC_TURN_USER`         |
| 11  | Resolver TODOs criticos          | 5 archivos     | Ver tabla en seccion 3                        |

### 6.4 Sprint 3: Testing Foundation (2 semanas)

| #   | Accion                         | Cobertura                                    |
| --- | ------------------------------ | -------------------------------------------- |
| 12  | Tests de middleware (auth)     | 5 apps x 1 test = 5 tests                    |
| 13  | Tests de API routes (patients) | 23 endpoints x 1 test = 23 tests             |
| 14  | Tests de edge functions        | 4 funciones x 2 tests = 8 tests              |
| 15  | Tests de hooks criticos        | useWebRTC, usePreventiveScreenings = 4 tests |

### 6.5 Sprint 4: Performance y Bundle (1 semana)

| #   | Accion                        | Herramienta                                  |
| --- | ----------------------------- | -------------------------------------------- |
| 16  | Configurar bundle analysis    | `@next/bundle-analyzer` / Astro analyzer     |
| 17  | Auditar dependencias pesadas  | `pnpm why <package>`                         |
| 18  | Lazy load islands no criticos | `client:visible` en vez de `client:load`     |
| 19  | Optimizar imagenes            | `@astrojs/image` o Cloudflare Image Resizing |

### 6.6 Sprint 5: Consolidacion (1 semana)

| #   | Accion                          | Detalle                            |
| --- | ------------------------------- | ---------------------------------- |
| 20  | Eliminar componentes duplicados | web ↔ companies (6 archivos)       |
| 21  | Limpiar migrations_archive      | Mover a branch o tag de referencia |
| 22  | Actualizar docs con TTL         | `pnpm docs:ttl:check`              |
| 23  | Coverage gates en CI            | Fail si cobertura < threshold      |

---

## 7. Checklists de Revision

### 7.1 Revision de PR (antes de merge)

```
CODIGO:
  [ ] No introduce `any` nuevos
  [ ] No introduce TODO/FIXME sin referencia (ticket:XXX)
  [ ] No usa console.* (usa logger)
  [ ] No importa cross-app
  [ ] Variables de entorno: PUBLIC_* en Astro, process.env solo en server Next.js

TYPES:
  [ ] Si toca DB: pnpm db:sync ejecutado
  [ ] Si toca enums: verificado contra DB real
  [ ] Si toca RPCs: verificado con pg_proc
  [ ] Interfaces explicitas para datos externos

BUILD:
  [ ] pnpm lint (0 errores, 0 warnings)
  [ ] pnpm typecheck (0 errores)
  [ ] pnpm build:packages:core (exitoso)
  [ ] Si toca apps/web: pnpm check (astro check)

TESTS:
  [ ] Tests existentes pasan
  [ ] Si es feature nueva: test minimo incluido
  [ ] Si es bugfix: test de regresion incluido

SEGURIDAD:
  [ ] No hay secrets hardcodeados
  [ ] RLS cubre los datos nuevos
  [ ] Auth context validado (quien llama, con que JWT)
```

### 7.2 Revision de Migracion DB

```
PRE-MIGRACION:
  [ ] supabase projects list → confirmar proyecto correcto
  [ ] SELECT column_name FROM information_schema.columns WHERE table_name = '...'
  [ ] SELECT proname, LEFT(prosrc, 100) FROM pg_proc WHERE proname = '...'
  [ ] No hay CREATE OR REPLACE sobre funciones con logica real
  [ ] IF NOT EXISTS en toda creacion de tabla/indice/policy

POST-MIGRACION:
  [ ] Verificacion SQL ejecutada (query que prueba el nuevo comportamiento)
  [ ] RLS policies alineadas con el cambio
  [ ] pnpm db:sync ejecutado
  [ ] Types en packages/types actualizados
  [ ] UI refleja los nuevos estados/campos
  [ ] Edge functions compatibles con el nuevo schema
```

### 7.3 Revision de Deploy

```
PRE-DEPLOY:
  [ ] Branch actualizado con main (git pull --rebase)
  [ ] pnpm lint && pnpm typecheck && pnpm build:packages:core
  [ ] Si hay migracion: aplicada ANTES del deploy de app
  [ ] Si hay edge function: deployada ANTES del deploy de app
  [ ] Variables de entorno configuradas en Cloudflare

POST-DEPLOY:
  [ ] URL de produccion accesible
  [ ] Login funciona (OAuth callback correcto)
  [ ] Flujo principal funciona (segun app)
  [ ] No hay errores en console del navegador
  [ ] No hay errores en Supabase Edge Function logs
```

### 7.4 Revision Semanal de Salud

```
METRICAS (comparar con semana anterior):
  [ ] any count: _____ (target: 0)
  [ ] Debt tag count: _____ (target: 0) <!-- ticket:TRACKING -->
  [ ] console.* count: _____ (target: 0)
  [ ] Test count: _____ (target: creciendo)
  [ ] Build time: _____ (target: estable o mejorando)

HIGIENE:
  [ ] git status limpio en main
  [ ] No hay archivos temporales versionados
  [ ] .gitignore actualizado si hay patrones nuevos
  [ ] Docs con TTL expirado revisados

SEGURIDAD:
  [ ] Dependencias sin vulnerabilidades criticas (pnpm audit)
  [ ] No hay secrets en commits recientes
  [ ] RLS policies cubren tablas nuevas
```

---

## 8. Riesgos y Mitigaciones

### Riesgos Activos

| ID  | Riesgo                                            | Probabilidad | Impacto    | Mitigacion                                          |
| --- | ------------------------------------------------- | ------------ | ---------- | --------------------------------------------------- |
| R1  | TURN servers no configurados para prod            | Alta         | 🔴 Critico | Configurar via env ANTES de lanzar telemedicina     |
| R2  | strict:false en patients permite bugs silenciosos | Alta         | 🟠 Alto    | Sprint 1: habilitar strict mode                     |
| R3  | 567 `any` types ocultan errores de tipo           | Alta         | 🟠 Alto    | Eliminar incrementalmente, empezar por auth/session |
| R4  | 0 unit tests en apps principales                  | Media        | 🟠 Alto    | Sprint 3: testing foundation                        |
| R5  | Migracion Astro incompleta puede causar drift     | Media        | 🟡 Medio   | Completar Phase 1 antes de Phase 2                  |
| R6  | 19 TS errors en doctors bloquean build limpio     | Alta         | 🟠 Alto    | Accion inmediata: fix esta semana                   |
| R7  | 667MB .next en git degrada clone/CI               | Confirmado   | 🟡 Medio   | Accion inmediata: remover de git                    |
| R8  | AI context-builder usa ~27 `any`                  | Media        | 🟡 Medio   | Sprint 1: tipar interfaces AI                       |

### Riesgos Mitigados

| ID  | Riesgo                       | Mitigacion Implementada             |
| --- | ---------------------------- | ----------------------------------- |
| M1  | Schema drift DB ↔ TypeScript | Pre-commit hook + `pnpm db:sync`    |
| M2  | Secrets en codigo            | Pre-push hook + CI scan             |
| M3  | Cross-app imports            | ESLint rules + dependency cruiser   |
| M4  | TODO sin seguimiento         | Pre-commit hook requiere ticket ref |
| M5  | Enums desincronizados        | Enum Sync Protocol en CLAUDE.md     |

---

## 9. Cadencia de Seguimiento

### Diario (automatico via hooks)

- Pre-commit: debt tags, convenciones, lint staged
- Pre-push: lint, typecheck, build packages
- Post-commit: QA rapido en background

### Semanal (manual, 15 min)

```bash
# 1. Metricas de deuda
grep -r "as any\|: any" apps/ packages/ --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist | wc -l

# 2. TODOs pendientes
grep -rn 'T''ODO\|FI''XME\|HACK\|TEMP' apps/ packages/ --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist | wc -l

# 3. Console statements
grep -rn "console\.\(log\|warn\|error\)" apps/*/src/ --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules | wc -l

# 4. Test count
find apps/ packages/ -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \
  | grep -v node_modules | wc -l

# 5. Build health
pnpm lint && pnpm typecheck && pnpm build:packages:core
```

### Quincenal (revision profunda, 1h)

- Revisar tabla de riesgos activos
- Actualizar metricas de deuda en este documento
- Verificar progreso de sprints de optimizacion
- Auditar dependencias: `pnpm audit`
- Verificar TTL de documentacion: `pnpm docs:ttl:check`

### Mensual (revision arquitectonica, 2h)

- Progreso de migracion Next.js → Astro
- Revision de RLS policies vs tablas nuevas
- Analisis de bundle size (cuando este configurado)
- Revision de test coverage vs targets
- Actualizar este documento con findings

---

## Apendice A: Tablas de Base de Datos (43+)

### Core

| Tabla             | RLS | Tests | Descripcion         |
| ----------------- | --- | ----- | ------------------- |
| `profiles`        | ✅  | ✅    | Perfiles de usuario |
| `user_roles`      | ✅  | -     | Asignacion de roles |
| `patients`        | ✅  | -     | Datos de paciente   |
| `doctors`         | ✅  | -     | Datos de medico     |
| `companies`       | ✅  | ✅    | Organizaciones      |
| `company_members` | ✅  | ✅    | Miembros de empresa |

### Medico

| Tabla               | RLS | Tests | Descripcion               |
| ------------------- | --- | ----- | ------------------------- |
| `appointments`      | ✅  | -     | Citas medicas             |
| `medical_records`   | ✅  | -     | Registros medicos         |
| `anamnesis`         | ✅  | -     | Cuestionario medico       |
| `vital_signs`       | ✅  | -     | Signos vitales            |
| `symptom_reports`   | ✅  | -     | Reportes de sintomas      |
| `medication_logs`   | ✅  | -     | Registro de medicacion    |
| `lab_results`       | ✅  | -     | Resultados de laboratorio |
| `patient_alerts`    | ✅  | -     | Alertas clinicas          |
| `patient_care_team` | ✅  | -     | Equipo de atencion        |
| `doctor_patient`    | ✅  | -     | Relacion medico-paciente  |

### Telemedicina

| Tabla                            | RLS | Tests | Descripcion          |
| -------------------------------- | --- | ----- | -------------------- |
| `telemedicine_sessions`          | ✅  | -     | Sesiones de video    |
| `telemedicine_room_participants` | ✅  | -     | Participantes        |
| `telemedicine_session_events`    | ✅  | -     | Eventos de sesion    |
| `consultation_rooms`             | ✅  | -     | Salas de consulta    |
| `calls`                          | ✅  | -     | Registro de llamadas |
| `call_events`                    | ✅  | -     | Eventos de llamada   |

### Preventivo

| Tabla                   | RLS              | Tests | Descripcion             |
| ----------------------- | ---------------- | ----- | ----------------------- |
| `preventive_screenings` | ✅ (public read) | -     | Catalogo de screenings  |
| `patient_screenings`    | ✅               | -     | Screenings del paciente |
| `risk_factors`          | ✅ (public read) | -     | Factores de riesgo      |
| `patient_risk_factors`  | ✅               | -     | Riesgos del paciente    |

### Auditoria

| Tabla                           | RLS | Tests | Descripcion               |
| ------------------------------- | --- | ----- | ------------------------- |
| `audit_logs`                    | ✅  | -     | Auditoria general         |
| `auth_audit`                    | ✅  | -     | Eventos de auth           |
| `medical_audit_log`             | ✅  | -     | Acceso a datos medicos    |
| `medical_record_authorizations` | ✅  | -     | Autorizaciones temporales |

---

## Apendice B: Edge Functions

| Funcion                      | Auth                           | Descripcion                       | Estado  |
| ---------------------------- | ------------------------------ | --------------------------------- | ------- |
| `create-call`                | Bearer JWT                     | Crear llamada de video            | ✅ Prod |
| `update-call-status`         | Bearer JWT                     | Actualizar estado de llamada      | ✅ Prod |
| `get-meeting-token`          | Bearer JWT + participant check | Generar token LiveKit             | ✅ Prod |
| `ingest-patient-observation` | Bearer JWT                     | Ingestar datos clinicos + alertas | ✅ Prod |

---

## Apendice C: API Endpoints (patients app)

| Endpoint                                      | Metodos            | Auth    | Descripcion              |
| --------------------------------------------- | ------------------ | ------- | ------------------------ |
| `/api/appointments`                           | GET, POST          | Session | CRUD citas               |
| `/api/appointments/[id]`                      | GET, PATCH, DELETE | Session | Cita individual          |
| `/api/profile`                                | PATCH              | Session | Actualizar perfil        |
| `/api/profile/ensure`                         | POST               | Session | Garantizar perfil existe |
| `/api/medical-history`                        | GET, POST          | Session | Historia medica          |
| `/api/medical-history/allergies`              | GET, POST          | Session | Alergias                 |
| `/api/medical-history/medications`            | GET, POST          | Session | Medicaciones             |
| `/api/medical-history/conditions`             | GET, POST          | Session | Condiciones cronicas     |
| `/api/anamnesis`                              | GET, POST, PATCH   | Session | Cuestionario medico      |
| `/api/telemedicine/session`                   | GET, POST          | Session | Sesiones de video        |
| `/api/telemedicine/session/[id]`              | PATCH, DELETE      | Session | Sesion individual        |
| `/api/telemedicine/session/[id]/participants` | GET, POST          | Session | Participantes            |
| `/api/telemedicine/session/[id]/events`       | GET, POST          | Session | Eventos                  |
| `/api/ai/chat`                                | POST               | Session | Chat con IA              |
| `/api/ai/context`                             | GET, POST          | Session | Contexto IA              |
| `/api/ai/context/sync`                        | POST               | Session | Sync contexto            |
| `/api/ai/intent`                              | POST               | Session | Clasificar intencion     |
| `/api/ai/patterns`                            | GET                | Session | Patrones de usuario      |
| `/api/ai/telemetry`                           | POST               | Session | Telemetria IA            |
| `/api/files`                                  | GET, POST, DELETE  | Session | Archivos                 |

---

## Apendice D: Comandos de Referencia Rapida

```bash
# === DESARROLLO ===
pnpm dev                              # Todos los apps
pnpm --filter @autamedica/web dev     # Solo Astro
pnpm dev:videoconsulta                # Signaling + patients + doctors

# === BUILD ===
pnpm build:packages:core              # Packages primero (SIEMPRE)
pnpm build                            # Todo (Turbo)
pnpm typecheck                        # TypeScript check
pnpm lint                             # ESLint

# === TESTING ===
pnpm test:unit                        # Vitest
pnpm test:e2e                         # Playwright
pnpm test:auth                        # Auth browser tests
pnpm test:rls                         # RLS policies

# === DATABASE ===
pnpm db:sync                          # Regenerar tipos
pnpm docs:db                          # Actualizar glosario
pnpm docs:db:ci                       # Validar glosario
supabase db push                      # Aplicar migraciones

# === DEPLOY ===
pnpm deploy:web                       # Astro → Cloudflare
pnpm deploy:doctors                   # Next.js → Cloudflare
pnpm deploy:patients                  # Next.js → Cloudflare

# === CALIDAD ===
pnpm dup                              # Duplicacion de codigo
pnpm depcruise                        # Validar dependencias
pnpm docs:ttl:check                   # Docs expirados
pnpm audit                            # Vulnerabilidades
```

---

> **Mantenimiento de este documento:** Actualizar metricas en cada revision semanal.
> Archivo: `docs/PROJECT_TRACKING_MAP.md`
> Owner: equipo de desarrollo
