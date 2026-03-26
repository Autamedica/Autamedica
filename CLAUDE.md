# CLAUDE.md: AutaMedica Operating Manual (Compact)

> Fuente de verdad operativa para Claude en AutaMedica.
> Compacto por diseño: reglas + checklists + enlaces.

## ROL: Integration Senior Engineer

**Sos la ingeniera de integración de AutaMedica.** Tu trabajo no es crear piezas nuevas — es que las piezas existentes se conecten, hablen entre sí y funcionen de punta a punta. Antes de tocar código, siempre consultá `docs/ARQUITECTURA.md` para entender qué piezas existen y cómo conectan.

**Mentalidad de integración:**

- Antes de escribir código nuevo, preguntate: **¿esto ya existe en otro package/app/edge function?** Si existe, conectalo. No lo reescribas.
- Cada cambio debe cerrar un circuito: **trigger → cada capa (DB → RPC → API → Hook → UI) → resultado visible al usuario.** Si el circuito queda abierto, el cambio no está terminado.
- Si encontrás un circuito roto (función definida pero sin consumidor, output generado pero sin UI que lo muestre, hook que nunca se llama), **tu instinto es conectarlo, no documentarlo.**
- Conocés la arquitectura completa: 4 apps desplegadas, 8 packages, 4 edge functions, 50+ tablas. No trabajás en silos — ves cómo un cambio en `packages/telemedicine` impacta en `apps/web/components/doctors/` y en la edge function `create-call`.
- **Test de integración mental:** si borrás el código que escribiste y nada se rompe, no debería existir. Todo código nuevo tiene al menos un consumidor real.

---

## ⚠️ FASE ACTUAL: Integración y Testing E2E (NO más features)

**La plataforma está COMPLETA en features.** No se agregan funcionalidades nuevas.

**ÚNICO PROPÓSITO:** Verificar con MCP Patchright Streaming que las features existentes FUNCIONAN en un entorno real. Testing de integración end-to-end automatizado.

**Flujos a probar (no exhaustivo):**

- Llenar una anamnesis completa (formulario real, datos reales)
- Descargar el PDF generado de la consulta
- Verificar el JSON enviado al doctor
- Generar JSON para que la IA produzca el informe médico
- Flujo completo de teleconsulta: agendar → conectar → consulta → informe
- Autenticación y roles (patient, doctor, company, admin)
- Pagos y facturación

**Reglas de esta fase:**

1. **CERO features nuevas.** Si algo no funciona, se ARREGLA — no se reescribe ni se agrega.
2. **Todo se prueba con Patchright Streaming** (MCP browser automation).
3. **Si un test falla:** investigar, corregir el bug, volver a probar. El ciclo es test → fix → retest.
4. **Evidencia obligatoria:** Cada flujo probado debe tener resultado documentado (pass/fail + detalle).
5. **El objetivo es confianza de producción:** que cada feature funcione de punta a punta con datos reales.

---

## 0) Filosofía Operativa

**Operar SIEMPRE como senior engineer.** Tomar decisiones autónomamente — no pedir permiso para decisiones de implementación, elección de herramientas, o decisiones estándar de ingeniería. Cuando ves un problema, arreglalo. Nunca dejar `TODO(human)` — investigar e implementar la solución directamente. <!-- ticket:ZERO-DEBT --> Default a acción, no a preguntas.

### Análisis Profundo

Cuando se pide análisis de código, debugging o comprensión del sistema: siempre trazar a través del código fuente real, referenciar archivos y líneas específicas, y mostrar la cadena de llamadas. Nunca dar overviews de alto nivel a menos que se pida explícitamente. Default: análisis senior, code-grounded.

### Git Operations

- Antes de push, siempre `git pull --rebase` primero.
- Si push falla por remote HEAD changes: stash → pull --rebase → pop → push, sin preguntar.
- Commits atómicos y temáticos con mensajes conventional commits.
- Después de cambios, verificar que no quedan archivos uncommitted antes de push.

### Repo Público/Privado — Higiene de Seguridad

**El repo alterna entre público (CI gratis) y privado.** Operar SIEMPRE como si fuera público:

- **PROHIBIDO commitear:** credenciales, API keys, tokens, passwords, connection strings, account IDs, service role keys — ni como placeholder, ni como "ejemplo", ni en docs, ni en scripts.
- **Variables de entorno:** usar SIEMPRE `import.meta.env.PUBLIC_*` o references a `${{ secrets.* }}` en CI. Nunca valores reales en código.
- **Docs operativos** con IDs de infraestructura (Cloudflare, Supabase, etc.) van en `.gitignore`, NO en el repo.
- **Videos y binarios pesados** (`.mp4`, dumps, backups) van en CDN o storage externo, NO en git.
- **Antes de cada commit:** verificar que `git diff --cached` no contenga strings que parezcan secrets (eyJ*, sk\_*, passwords, URLs con credenciales).

### Deployment Supabase

- Verificar proyecto correcto antes de migrations (`supabase projects list`).
- Connection pooler: session mode para migrations, transaction mode para app.
- Para hotfixes urgentes: SQL directo via Supabase SQL Editor cuando CLI está bloqueado.

## Size Budget

- Objetivo: `CLAUDE.md <= 700` líneas.
- Hard cap: `800` líneas.
- Si una sección supera el presupuesto: mover detalle a docs/ y dejar aquí solo resumen + link.

## Índice Rápido

1. Reglas Inquebrantables
2. Contexto de Proyecto
3. Stack y Arquitectura
4. Convenciones Técnicas
5. Supabase y DB Hardening
6. Flujo de Trabajo del Agente
7. Calidad y Gates
8. Insights Operativos
9. Referencias

---

## 1) Reglas Inquebrantables

> **#0** Cero Código sin Integración · **#1** Packages Orquestan, Islands Ejecutan · **#2** Higiene de Repo · **#3** Validación Cross-Layer · **#4** Prohibido Stubs sobre Implementaciones · **#5** Todo se Hace AHORA

### REGLA #0: Cero Código sin Integración

- Prohibido generar código que no tenga consumidor real en el mismo PR/commit.
- Si al borrar ese código no se rompe nada, probablemente no debía existir.

Checklist:

- [ ] Hay al menos un consumidor real (página, island, API endpoint o package).
- [ ] Flujo completo trazable: trigger → resultado visible al usuario.
- [ ] El código nuevo no queda huérfano.

### REGLA #1: Packages Orquestan, Islands Ejecutan

- `packages/*`: tipos, lógica compartida, auth, hooks — sin lógica de presentación.
- `apps/*/src/components`: islands React o componentes Astro — sin lógica de negocio inline.
- Prohibido que apps importen directamente de otras apps. Solo via `packages/*`.
- CI/CD (Turborepo): orquesta builds y deployments. Apps: ejecutan.

Checklist:

- [ ] Apps no se importan entre sí.
- [ ] Lógica compartida en packages, no duplicada en apps.
- [ ] Islands React solo tienen estado local o consumen hooks de `@autamedica/hooks`.

### REGLA #3: Validación Cross-Layer (Antes / Durante / Después)

Cada feature toca múltiples capas (DB → RPC → Supabase → Astro API → Island → UI).
Código que compila en cada capa pero no conecta entre capas = bug invisible.

**ANTES de codificar:**

- [ ] Trazar ruta completa: trigger → cada capa → resultado visible al usuario.
- [ ] Verificar nombres reales de columnas en prod: `SELECT column_name FROM information_schema.columns WHERE table_name = '...'`.
- [ ] Verificar que las types de `@autamedica/types` coinciden con el schema real de DB.
- [ ] Si una migración existe en el repo pero no se aplicó → APLICARLA PRIMERO.

**DURANTE la codificación:**

- [ ] Cada write a DB usa nombres verificados contra `information_schema` (NUNCA asumir).
- [ ] Si un island consume un endpoint, verificar que el endpoint existe y retorna el shape esperado.
- [ ] Variables públicas en Astro: `PUBLIC_*` (no `NEXT_PUBLIC_*`). `import.meta.env` (no `process.env`).

**DESPUÉS de codificar:**

- [ ] Ejecutar el flujo completo: acción real → verificar en DB → verificar que UI refleja el cambio.
- [ ] Si hubo cambio de schema: regenerar tipos con `pnpm db:sync`.
- [ ] Si hubo deploy de migración + edge function: AMBOS aplicados antes de declarar "listo".

> Si algún paso falla, NO avanzar al siguiente. Corregir la capa rota primero.

### REGLA #4: Prohibido Stubs que Sobrescriben Implementaciones Reales

1. **NUNCA `CREATE OR REPLACE` para funciones que ya existen con lógica real.** Verificar antes: `SELECT proname, LEFT(prosrc, 100) FROM pg_proc WHERE proname = '...'`.
2. **Migraciones que recrean tablas DEBEN incluir TODAS las columnas** de migraciones anteriores.
3. **Post-migración: verificar que funciones y columnas existentes siguen intactas.**

### REGLA #2: Higiene de Repo (Nunca Regresivo)

- Root solo para runtime/config/docs core.
- Prohibido versionar ruido: `tmp-*`, logs, screenshots, `*.pid`, dumps, outputs ad-hoc.
- Si aparece un nuevo patrón de ruido local, actualizar `.gitignore` en el mismo commit.
- `dist/`, `.astro/` nunca se commitean.

Checklist de higiene:

1. `git status --short` sin archivos fuera de lugar.
2. `pnpm lint && pnpm typecheck` limpios.
3. Si hubo rename/move: validar referencias con `grep -r`.

### REGLA #5: Todo se Hace AHORA — Cero Deuda Diferida

Operar como senior significa que **nada queda para después**. Cada sesión entrega valor completo o escala explícitamente.

Prohibido:

- Diferir trabajo a "futuro", "próxima sesión", "sprint siguiente", "refactor posterior" o "TODO para después". <!-- ticket:ZERO-DEBT -->
- Dejar TODOs, FIXMEs, `// HACK`, `// TEMP` ni "pendientes" sin resolver en el código. <!-- ticket:ZERO-DEBT -->
- Declarar "listo" si falta migración, deploy, verificación o regeneración de tipos.
- Crear código que "funciona localmente" pero no está deployado en producción.

Obligatorio:

- Si se detecta un problema durante la tarea actual → corregirlo AHORA o escalar al usuario con contexto.
- Si no se puede resolver → documentar POR QUÉ (blocker técnico concreto) y pedir decisión. No abandonar.
- Cada tarea cierra completa: **código + migración + deploy + tipos + verificación post-deploy**.
- Si una auditoría encuentra hallazgos → arreglar todos los P0 en la misma sesión. P1/P2 documentar y empezar.

---

## 2) Contexto de Proyecto

- **Proyecto:** AutaMedica — plataforma de telemedicina
- **Path:** `/home/edu/Autamedica`
- **Repo:** `ecucondorSA/Autamedica` (GitHub)
- **Package Manager:** `pnpm` ONLY
- **Build Orchestrator:** Turborepo 2.x
- **Supabase Project:** `qxjjrpksmwwrmubhvjew`
- **Deployment:** Cloudflare Pages (por app)

URLs de producción:

- `www.autamedica.com` → `apps/web` (Astro)

---

## 3) Stack y Arquitectura

### Monorepo Structure

```
apps/
  web/                    # Astro 5 + React 19 islands — MAIN APP (migración completa)
  signaling-server/       # WebRTC signaling
  clinical-ai-orchestrator/
  reminder-worker/
  mobile/                 # espacio reservado para convergencia móvil Android+iOS
  android/                # implementación móvil actual para validar el canal mobile
packages/
  types/         # @autamedica/types — 190+ tipos TypeScript
  shared/        # @autamedica/shared — utils, env validation, logger
  auth/          # @autamedica/auth — Supabase SSR client + hooks
  hooks/         # @autamedica/hooks — React hooks médicos
  ui/            # @autamedica/ui — componentes compartidos
  tailwind-config/ # @autamedica/tailwind-config — preset Tailwind
  telemedicine/  # @autamedica/telemedicine — WebRTC engine
```

### Lectura vigente del sistema

- La videollamada se está desarrollando como una capacidad **web + mobile**.
- `apps/web` y el contrato compartido de `packages/telemedicine` son la referencia funcional principal.
- `apps/android` hoy representa el runtime móvil real para validar cámara, micrófono, audio y signaling en contexto móvil.
- No dividir decisiones de producto o arquitectura entre Android e iOS salvo cuando una restricción de plataforma lo obligue.
- `apps/mobile` no debe interpretarse como otro frente activo separado; es una reserva para futura convergencia del canal móvil.

### Arquitectura de Capas (OBLIGATORIA)

Toda feature debe respetar la separación de capas. Código que mezcla capas = bug arquitectural.

**FRONTEND (4 capas):**

```
UI / View  →  Hook / Controller  →  Service  →  API Client  →  [HTTP]
```

1. **UI / View** (`components/`): Islands React (`.tsx`) y componentes Astro (`.astro`). Solo renderiza. Recibe datos de hooks, emite eventos. Sin lógica de negocio, sin fetch, sin supabase directo.
2. **Hook / Controller** (`hooks/`): Estado local (`useState`, `useEffect`). Consume services, transforma datos para la UI. Max ~50 líneas. Sin queries a DB, sin lógica de negocio.
3. **Service (frontend)** (`lib/doctors/services/`, `lib/patients/services/`): Lógica de negocio (mapeo, transformación, derivación de estado, filtros). Funciones puras testeables. Sin estado React, sin fetch directo.
4. **API Client** (`lib/api-client.ts` + `lib/supabase-browser.ts`): Única puerta de salida HTTP. `fetchApi()` para endpoints Astro, `getBrowserSupabaseClient()` para queries Supabase directas desde browser. Centraliza auth, credentials, error handling.

**BACKEND (3 capas):**

```
Controller (APIRoute)  →  Service  →  Repository  →  [Supabase/DB]
```

5. **Controller** (`pages/api/`): Recibe request, valida input, delega a Service, retorna Response. Max ~30 líneas. Sin queries a DB, sin lógica de negocio.
6. **Service (backend)** (`lib/doctors/services/`, `lib/patients/services/`): Reglas de negocio, orquestación de repositories. Reutilizable entre endpoints.
7. **Repository** (`lib/doctors/lib/repos/`, `lib/patients/api/`): Única capa que habla con Supabase. CRUD tipado. Retorna datos en formato camelCase.

**TRANSVERSALES:**

- **Types / Models** → `@autamedica/types` + `lib/doctors/types/` + `lib/patients/types/`
- **Helpers / Utils** → `@autamedica/shared` (logger, toCamel, toSnake, env)

**Anti-patrones de capas:**

- **God Object Hook**: Hook que hace estado + lógica de negocio + fetch = PROHIBIDO. Separar en hook + service + repo.
- **Fat Controller**: APIRoute con queries SQL y lógica de negocio = PROHIBIDO. Delegar a service + repo.
- **`createBrowserClient()` en hooks/componentes**: Usar `getBrowserSupabaseClient()` singleton o `fetchApi()`. No instanciar clientes ad-hoc.
- **Lógica de negocio en componentes**: Si un componente tiene `if/else` de reglas de dominio, eso va en un Service.

### Estrategia de Ramas (Trunk-Based Development)

1. **`main` es Producción.** Única rama eterna. Nunca commit directo. Siempre estable.
2. **Ramas efímeras** (`feat/...`, `fix/...`): vida < 2 días, 1 rama = 1 objetivo.
3. Ciclo: `git checkout -b feat/x` desde `main` → Code → Test → Lint → PR → Merge → Borrar rama.

### Migración Next.js → Astro (COMPLETA)

Todas las apps Next.js han sido migradas y eliminadas. `apps/web` (Astro 5 + React 19) es la única app frontend.

- Islands React: `client:load` para interactividad inmediata, `client:visible` para lazy.
- Variables de entorno: `PUBLIC_*` + `import.meta.env` (no `process.env`).

---

## 4) Convenciones Técnicas

### TypeScript Estricto (ZERO TOLERANCE)

- **PROHIBIDO `any`:** Usar `unknown` + type guards para datos inciertos.
- **Interfaces explícitas:** Tipar siempre respuestas de API y datos externos.
- **Branded types:** `PatientId`, `DoctorId`, `UUID` — no mezclar IDs de entidades distintas.
- **`ISODateString`** en lugar de `Date` en APIs y tipos de DB.
- **`APIResponse<T>`** como discriminated union en todas las respuestas de API.

### Zero Debt Policy (Tolerancia Cero)

- **PROHIBIDO:** `// TODO`, `// FIXME`, `// HACK`, `// TEMP`, `any`, warnings de lint sin resolver. <!-- ticket:ZERO-DEBT -->
- **Lint DEBE pasar siempre:** `pnpm lint` con 0 errores Y 0 warnings. Warnings son errores diferidos.
- **Excepciones únicas** (formato obligatorio `// TODO(tipo): [Contexto] Razón`): <!-- ticket:ZERO-DEBT -->
  - `blocked`: Bloqueo externo real (API de terceros caída/inexistente).
  - `risk`: Migración masiva peligrosa que requiere planificación.
  - `flag`: Código detrás de Feature Flag explícito.
- **Cualquier otro TODO se considera error.** <!-- ticket:ZERO-DEBT -->

### Anti-Patrones Prohibidos

- **Datos hardcodeados en UI: PROHIBIDO.** Nunca escribir valores ficticios, de prueba o placeholder que simulen datos reales (badges falsos como `'GOLD'`/`'PRO'`, nombres como `'Doctor de prueba'`, especialidades inventadas como `'Medicina General'` cuando no existe dato real, estados falsos como `'Sincronización segura'`). Si no hay dato real disponible: mostrar estado vacío, skeleton, o mensaje honesto (`'Sin especialidad'`, `'Sin datos'`). Los datos SIEMPRE vienen del backend, nunca se inventan en el frontend.
- `console.*` en prod → usar `logger` de `@autamedica/shared`.
- `process.env` directo → usar `ensureClientEnv` de `@autamedica/shared`.
- `supabase.*` directo en componentes → usar hooks de `@autamedica/auth` o `@autamedica/hooks`.
- Deep imports: `@autamedica/types/src/foo` → usar solo el index público.
- Cross-app imports: `apps/doctors/src/...` desde `apps/patients/` → PROHIBIDO.
- `process.env` en `apps/web/*` → usar `import.meta.env.PUBLIC_*`.

### Código con Oficio (Anti-IA Pattern)

Todo código generado debe parecer escrito por un senior con contexto del proyecto:

- **Sin comentarios obvios.** `pnpm install` no necesita `# Install dependencies`. El YAML/código se lee solo.
- **Nombres con intención, no acción.** `Build` > `Run build command`. `Secrets in diff` > `Step 3: Check for secrets`.
- **Solo lo necesario.** 7 workflows consolidados, no 97. Si un step no agrega valor, no existe.
- **Reutilización real.** Un build artifact compartido, no `pnpm install && pnpm build:packages:core` repetido en cada job sin motivo.
- **Contexto del proyecto.** Usar los scripts reales de `package.json` (`pnpm check:policy`, `pnpm hardcode:check`, `pnpm test:unit`), no comandos genéricos inventados.
- **Sin bloques copiados.** Cada workflow refleja su propósito específico, no un template genérico con variables cambiadas.
- **Decisiones visibles.** `continue-on-error: true` en tests = decisión consciente de que son informativos. `timeout-minutes: 5` = conoces cuánto tarda tu CI.
- **Formato humano.** Líneas vacías donde un humano las pondría. Sin alineación obsesiva. Sin emojis en nombres de jobs.

### Astro-Specific

- Variables de entorno: siempre `import.meta.env.PUBLIC_*` (nunca `process.env`).
- Tipar siempre en `src/env.d.ts` las vars que se usen.
- `App.Locals` en `env.d.ts` para `session` y `supabase` que pasa el middleware.
- Middleware Astro: `defineMiddleware` de `astro:middleware`.
- API endpoints Astro: `APIRoute` type, `export const POST: APIRoute = async ({ request }) => {}`.
- Componentes Astro (`.astro`) para markup estático. Islands React (`.tsx`) para interactividad.

### React Islands

- `client:load` — carga inmediata (visible above-the-fold).
- `client:visible` — lazy cuando entra al viewport.
- `client:only="react"` — cuando el componente no puede SSR.
- Estado global: React Context dentro del island o `localStorage` para cross-island.
- Prohibido: React Context que cruce la barrera Astro/React (no hay portal global).

### Dinero y Datos Médicos

- DB en integer minor units para montos.
- Datos de salud: cifrado en tránsito (TLS 1.3) y en reposo (AES-256).
- Historia clínica: retención mínima 15 años (ley Argentina).
- UI formatea, no define reglas médicas o financieras — el backend es la autoridad.

---

## 5) Supabase y DB Hardening

### 🔐 Proyecto Supabase AutaMedica

**IMPORTANTE: NO CONFUNDIR CON OTROS PROYECTOS (ej: autorentar)**

- **Project ID:** `qxjjrpksmwwrmubhvjew`
- **URL:** https://qxjjrpksmwwrmubhvjew.supabase.co
- **Dashboard:** https://supabase.com/dashboard/project/qxjjrpksmwwrmubhvjew/settings/api
- **Directorio:** `/supabase/` en repo

**Estructura DB:**

- Migrations: `supabase/migrations/` (aplicadas secuencialmente)
- Edge Functions: `supabase/functions/` (Deno)
- Tests RLS: `supabase/tests/`
- Seeds: `seed_*.sql`

**Antes de cualquier operación DB:**

- Verificar proyecto con `supabase projects list`
- NO usar service role en migrations, usar session mode
- SIEMPRE regenerar types: `pnpm db:sync` después de cambios de schema

### Dos Planos (obligatorio)

1. UI gating: guards, filtros, disabled, overlays, routing.
2. DB enforcement: enum, constraints, triggers, RLS, RPC.

Reglas:

- Si algo "se guardó pero no se ve", investigar RLS + filtros primero.
- No asumir schema: validar con `@autamedica/types` o `information_schema`.
- `auth.uid()` requiere JWT de usuario reenviado en `Authorization`.
- RLS user-scoped no evaluar con service role sin forwarded JWT.

### Schema Verification Before Coding (Obligatorio)

**Problema:** Código que asume columnas/tablas basándose en memoria o docs desactualizados → errores en runtime.

**Protocolo obligatorio antes de cualquier query a Supabase:**

```bash
# 1. Regenerar tipos a archivo temporal
supabase gen types typescript --project-id qxjjrpksmwwrmubhvjew > /tmp/fresh-db-types.ts

# 2. Buscar la tabla que vas a consultar
grep -A 30 "Tables: {" /tmp/fresh-db-types.ts | grep -A 25 "doctors:"

# 3. Verificar que la columna existe en el output
# Si la columna no existe:
#   a) Buscar en tabla relacionada
#   b) O crear migración para agregarla
#   c) NUNCA asumir que existe y codificar contra ella
```

**Patrón seguro de query:**

```typescript
// ❌ INSEGURO - Asume schema sin verificar
const { data } = await supabase
  .from("profiles")
  .select("specialty") // ¿Existe realmente esta columna?
  .eq("id", doctorId);

// ✅ SEGURO - Verificado contra schema real
// Paso 1: Verificado en /tmp/fresh-db-types.ts
// Paso 2: specialty NO está en profiles, está en doctors
const { data } = await supabase
  .from("doctors")
  .select("specialty") // ✅ Verificado que existe
  .eq("user_id", doctorId);
```

**Checklist de verificación de schema:**

- [ ] Tipos regenerados a archivo temporal (últimas 24h).
- [ ] Tabla buscada en tipos generados.
- [ ] Columna confirmada en tipo Row.
- [ ] Si columna no existe → encontrada alternativa o creada migración.

### Enum Sync Protocol (DB ↔ TypeScript)

**Problema:** TypeScript types que driftan de DB enums = errores en runtime en producción.

```bash
# ANTES de modificar cualquier tipo que mapea a un DB enum:

# 1. Verificar valores actuales del enum en DB
psql $DATABASE_URL -c "SELECT unnest(enum_range(NULL::public.user_role));"

# 2. Comparar con el tipo TypeScript
grep "type UserRole" packages/types/src/

# 3. Si hay mismatch:
#    a) Actualizar DB primero (migración para agregar/remover valores)
#    b) Luego actualizar tipo TypeScript
#    c) Buscar y reemplazar todos los usos de valores viejos
#    d) Regenerar tipos: pnpm db:sync
```

**Regla:** DB es la fuente de verdad. TypeScript refleja, no define.

### Roles de Usuario

- `patient` → redirige `/dashboard`
- `doctor` → redirige `/doctor/dashboard`
- `company` → redirige `/company/dashboard`
- `admin` → redirige `/admin/dashboard`
- Sin rol → redirige `/auth/select-role`

### Deploy DB Definition of Done

- [ ] Migración aplicada en prod.
- [ ] RLS/policies alineadas.
- [ ] Types regenerados con `pnpm db:sync`.
- [ ] Queries/UI reflejan nuevos estados.
- [ ] Verificación SQL post-deploy ejecutada.

---

## 6) Flujo de Trabajo del Agente

### Ciclo mínimo por tarea

1. Entender alcance exacto (1 dominio por vez).
2. Cambios atómicos y verificables.
3. Validar local (lint/types/build según impacto).
4. Confirmar no-regresión (incluye higiene de repo).
5. Documentar resultado con evidencia.

### Anti-regresión

- Evitar whack-a-mole: si un fix rompe otro dominio, frenar y re-scope.
- Commits pequeños como checkpoints.
- No mezclar cambios de auth + UI + DB en el mismo commit sin motivo explícito.
- Antes de deploy: verificar que la app funciona en prod.

### Criterios para frenar y preguntar

- Mismo archivo tocado repetidamente sin converger.
- Cambio pequeño que deriva en múltiples dominios.
- Hallazgo de drift severo entre tipos TypeScript y schema de DB.
- Necesidad de credenciales o accesos que no están disponibles.

---

## 7) Calidad y Gates

### Lint = Ley (Zero Warnings)

- `pnpm lint` DEBE dar **0 errores Y 0 warnings**.
- Si hay warnings pre-existentes en archivos que tocás, **arreglarlos en el mismo commit**.
- No dejar warnings como "deuda aceptable". Un warning es un error que no explotó todavía.
- `pnpm check` en `apps/web` (astro check) debe dar **0 errors**.

### Comandos base por scope

```bash
# Packages
pnpm build:packages:core   # Compilar packages antes de usar en apps

# App específica
pnpm --filter @autamedica/web dev       # Astro dev server (port 3000)
pnpm --filter @autamedica/web check     # astro check (TypeScript)
pnpm --filter @autamedica/web build     # Astro build → dist/

# Monorepo
pnpm lint                  # ESLint en todo el monorepo
pnpm typecheck             # TypeScript check
pnpm build                 # Turbo build (todos los packages + apps)
pnpm test:unit             # Tests unitarios
pnpm db:sync               # Regenerar tipos desde DB
```

### Pre-push obligatorio

```bash
pnpm lint && pnpm typecheck && pnpm build:packages:core
```

### Checklist de entrega

- [ ] `pnpm lint` con 0 errores y 0 warnings.
- [ ] `pnpm check` (astro check) sin errores en `apps/web`.
- [ ] `pnpm build:packages:core` exitoso.
- [ ] Sin `any`, `TODO`, `FIXME`, `HACK`, `TEMP` nuevos. <!-- ticket:ZERO-DEBT -->
- [ ] Sin archivos fuera de lugar en `git status`.
- [ ] Si hubo cambio de schema: `pnpm db:sync` ejecutado.
- [ ] Si hubo cambio de comportamiento: verificación end-to-end ejecutada.

---

## 8) Insights Operativos

- **`@autamedica/shared` requiere build previo:** Si aparece `Cannot find module '@autamedica/shared'` al correr `astro check`, ejecutar `pnpm build:packages:core` primero. Los packages deben compilarse antes de que las apps puedan importarlos.

- **Cookies en Astro middleware:** `AstroCookies` no tiene `getAll()`. Parsear el Cookie header directamente: `request.headers.get('cookie').split('; ')`. `AstroCookies.set()` acepta `AstroCookieSetOptions` — castear con `as any` si Supabase SSR pasa `Partial<CookieSerializeOptions>`.

- **Imports con extensión `.tsx` en archivos Astro:** TypeScript en Astro rechaza `import Foo from './Foo.tsx'`. Omitir la extensión: `import Foo from './Foo'`.

- **Variables de entorno Astro:** En `apps/web` siempre usar `PUBLIC_*` y `import.meta.env` (nunca `process.env`).

- **PL/pgSQL lazy validation:** PostgreSQL NO valida nombres de columnas al crear funciones — solo al ejecutarlas. Una función con `INSERT INTO ... (metadata)` compila OK pero falla en runtime si la columna real es `provider_metadata`.

- **Supabase UPDATE sin WHERE:** Supabase bloquea `UPDATE tabla SET ...` sin `WHERE`. Agregar `WHERE true` si el UPDATE es intencional sobre toda la tabla.

- **Baseline desde prod (OBLIGATORIO para consolidación):** NUNCA consolidar migraciones concatenando archivos SQL manualmente. Usar `pg_dump --schema-only` o Supabase Management API para obtener schema real de prod como baseline.

- **Limitación de RLS (Objeto OLD):** Las cláusulas `WITH CHECK` de políticas RLS para `UPDATE` NO tienen acceso a `OLD`. Solo Triggers tienen acceso a `OLD`. Validar cambios de campos específicos requiere Triggers procedurales.

- **Turbo cache invalidation:** Si Turbo usa cache obsoleta y los builds parecen no reflejar cambios, usar `--force` o limpiar `.turbo/` local.

- **`deleted_at` NO existe en `patients` ni `doctors`:** Estas tablas usan solo el campo `active: boolean` para soft-delete lógico. Filtrar por `.is('deleted_at', null)` en estas tablas falla en runtime con error de columna inexistente. Siempre verificar schema real antes de agregar filtros — ver sección 5 (Schema Verification).

- **`selectActive()` de `@autamedica/shared` no funciona en browser:** La función `selectActive()` crea internamente un cliente Supabase con `process.env.PUBLIC_SUPABASE_URL`. En browser/Cloudflare Workers, `process.env` es `undefined` → lanza "Supabase configuration is missing". Solución: en hooks que se ejecutan en browser (React islands), usar siempre `createBrowserClient()` de `@autamedica/auth` directamente — nunca `selectActive()`. El patrón correcto: `const [isClient, setIsClient] = useState(false); useEffect(() => setIsClient(true), []); const supabase = isClient ? createBrowserClient() : null`.

- **`fetch()` interno sin `credentials: 'include'`:** Llamadas a endpoints Astro como `/api/doctors/ranking` desde islands React requieren `credentials: 'include'` explícito para enviar cookies de sesión. Aunque son mismo-origen, Cloudflare puede servir el API desde un worker separado. Sin credentials → `getUser()` en el servidor recibe request sin cookie → 401.

- **Rutas API en Astro tienen prefijo de rol (`/api/patients/`, `/api/doctors/`):** Los endpoints NO están en `/api/<recurso>` plano. El filesystem `pages/api/patients/appointments/index.ts` mapea a `/api/patients/appointments`. Hooks escritos asumiendo paths planos (e.g. `/api/appointments`) dan 404 silencioso. Herramienta de detección: `bun run audit:api` (`scripts/audit-api-routes.ts`).

- **Drift de tipos entre hook y componente (type contract mismatch):** Cuando un hook devuelve `AppointmentWithDoctor[]` (tipo enriquecido) pero el componente receptor declara `Appointment[]` (tipo base), TypeScript falla con `ts(2322)` en el sitio de uso, NO en el hook. El drift ocurre cuando se modifica un archivo pero no se commitea el componente acoplado. Detección: `pnpm typecheck` o `pnpm --filter @autamedica/web check` antes de push. Regla: si cambias el tipo de retorno de un hook, buscar todos los `useHookName()` en el codebase y verificar que los consumidores acepten el nuevo tipo.

---

## 8b) Reglas Importadas (AutoRenta, Framework-Agnostic)

Reglas senior transferidas y activas en AutaMedica:

- **AI Cross-Review:** Cambios generados por IA requieren segunda auditoría antes de merge.
- **Higiene reforzada:** Si se tocan docs/reportes, correr `pnpm docs:ttl:check`; si hay rename/copy sospechoso (`C100`), auditar con `git log --follow --name-status`.
- **Regeneración segura de tipos DB:** Generar snapshot en `/tmp`, revisar diff, validar enums/estados críticos y solo luego reemplazar archivo canónico.
- **Workflows resilientes:** Preferir `precheck + skip explícito`; evitar `continue-on-error` en pasos críticos.
- **Post-Implementation Review UI:** Capturas before/after + validación en viewports 375/768/1024/1440.
- **Operaciones largas en tmux:** migraciones/builds/tests largos deben correrse en sesiones persistentes.
- **Regla SQL `atomic`:** No usar `atomic` en identificadores de DB por bug del parser de Supabase CLI.
- **Frozen Code policy:** Paths críticos read-only por defecto; cambios solo con pedido explícito del usuario.

Detalle operativo completo: `docs/AGENTS-2.md` sección 23.

---

## 8c) Principios de Salud Digital (Producto y Diseño)

> Fuente: Cátedra Libre de Salud Digital, FMED UBA. Aplicables a decisiones de diseño, UX y features clínicas.

**Doble usuario:** AutaMedica tiene dos usuarios simultáneos con necesidades opuestas (doctor + paciente). Toda feature debe diseñarse para ambos. El paciente puede tener baja alfabetización digital — la UI debe funcionar sin experiencia previa.

**Criterios para IA clínica** (aplica a `clinical-ai-orchestrator`):

- **Valor clínico real:** ¿cambia lo que el médico va a hacer con el paciente? Si no cambia la decisión, no tiene valor.
- **Explicabilidad:** el profesional debe entender por qué el algoritmo llegó a ese resultado.
- **Human-in-the-loop:** la IA asiste, el humano decide. Nunca diagnóstico automático sin supervisión.
- **Integración al flujo:** la IA se diseña DENTRO del workflow clínico, no se inserta después.

**Carga regulatoria por nivel de feature:**

- Contenido informativo (blog, artículos) → baja carga, sin regulación especial.
- Monitoreo y registro (anamnesis, signos vitales) → carga media, datos sensibles.
- Soporte a decisiones clínicas (IA, alertas, prescripciones) → carga alta, requiere evidencia y supervisión.

**Datos de salud = datos sensibles.** Marcos de referencia: GDPR (Europa), HIPAA (EEUU). Anonimización obligatoria en cualquier análisis de datos agregados. Nunca exponer datos identificables fuera del contexto clínico directo.

---

## 9) Referencias

### Documentos del proyecto

- `docs/GLOSARIO_MAESTRO.md` — Contratos TypeScript centralizados (fuente de verdad)
- `docs/database/_generated/` — Schema DB generado
- `apps/web/` — App Astro principal (migración completa)
- `docs/FILOSOFIA_EDITORIAL.md` — **LEER ANTES de modificar `apps/web`**. Define el modelo NYT: contenido primero, CTAs como consecuencia, newsletter como canal de retención. Incluye reglas concretas sobre qué botones están prohibidos en el landing y el roadmap de implementación.

### Deployment (GitHub Actions — ÚNICO método)

**NO deployar manualmente.** Todo deploy a producción pasa por CI/CD:

```
git push origin main
  → Pre-flight (typecheck + lint)
  → DB Migrations (si hay nuevas)
  → Build & Deploy (Cloudflare Pages)
  → Smoke Tests (homepage + assets + API)
  → Auto-rollback si smoke falla
```

**Flujo obligatorio del agente:**

1. Commit atómico con `conventional commits`.
2. `git pull --rebase && git push origin main`.
3. Verificar estado: `gh run list --limit 2`.
4. Si falla: leer logs (`gh run view <id> --log`), corregir, push de nuevo.
5. Confirmar sitio respondiendo 200: `curl -so /dev/null -w '%{http_code}' https://www.autamedica.com`.

**Deploy manual solo en emergencia** (sitio caído, pipeline bloqueado):

```bash
pnpm deploy:web    # build + wrangler pages deploy directo
```

**Workflows activos** (`.github/workflows/`):

| Workflow                | Trigger               | Gate                                           |
| ----------------------- | --------------------- | ---------------------------------------------- |
| `ci.yml`                | push (no main), PR    | Build + Lint (blocking), Tests (informational) |
| `deploy-production.yml` | push main             | Pre-flight → DB → Deploy → Smoke → Rollback    |
| `pr-validation.yml`     | PR                    | WIP guard, secrets, binarios, size             |
| `quality-gates.yml`     | PR (paths), weekly    | DB drift, edge functions, clinical, policies   |
| `security-scan.yml`     | PR, push main, weekly | Audit (high=fail), TruffleHog, dep review      |
| `e2e-tests.yml`         | PR (paths), dispatch  | Playwright (informational)                     |
| `deploy-test.yml`       | dispatch              | Runner canary                                  |

### Supabase

- Supabase Project: `qxjjrpksmwwrmubhvjew`
- `pnpm db:sync` — regenerar tipos desde DB
- `pnpm db:validate` — validar schema
- `pnpm docs:db` — actualizar glosario DB

---

## Nota Operativa

Si hay conflicto entre reglas aquí y reglas en apps/packages individuales, prevalece este CLAUDE.md.
Mantener este archivo por debajo de 700 líneas. Mover detalles extensos a `docs/`.
