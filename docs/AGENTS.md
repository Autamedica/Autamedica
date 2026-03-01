# AGENTS.md - AI Agent Guidelines for AutaMedica

> Guía operativa senior para agentes de IA. Fuente de verdad primaria.

## Quick Reference

| Comando                               | Descripción                                |
| ------------------------------------- | ------------------------------------------ |
| `pnpm build:packages:core`            | Compilar packages antes de usarlos en apps |
| `pnpm --filter @autamedica/web dev`   | Dev server Astro (port 3000)               |
| `pnpm --filter @autamedica/web check` | astro check (TypeScript 0 errors)          |
| `pnpm --filter @autamedica/web build` | Build Astro → dist/                        |
| `pnpm lint`                           | ESLint todo el monorepo                    |
| `pnpm lint:fix`                       | Auto-fix ESLint                            |
| `pnpm typecheck`                      | TypeScript check global                    |
| `pnpm test:unit`                      | Tests unitarios (Vitest)                   |
| `pnpm build`                          | Turbo build completo (solo CI/CD)          |
| `pnpm db:sync`                        | Regenerar tipos desde DB                   |
| `pnpm deploy:web`                     | Build + deploy apps/web a Cloudflare Pages |

**Package Manager**: `pnpm` únicamente (NUNCA npm/yarn)

**Supabase Project activo**: `qxjjrpksmwwrmubhvjew`

---

## 1. Engineering Principles (Senior Default)

- **NO Future Optimization (Zero Laziness):** Código listo para producción inmediatamente. Sin "lo arreglo después". Si ves un bug en el archivo que estás tocando, arreglalo AHORA. Prohibido dejar `TODO` en lógica crítica.
- Preferir cambios pequeños y atómicos, fáciles de verificar.
- Cuando un cambio afecta datos, agregar validación y manejo explícito de errores.
- Tratar migraciones y Edge Functions como sistemas de producción.
- Evitar la "brillantez". Optimizar para claridad y debuggeabilidad.
- Si un cambio toca más de 3 archivos, re-scopear o explicar por qué.

---

## 1.1 Branching Strategy (Trunk-Based Development)

**Objetivo:** Historial limpio, sin merge hell, aislamiento estricto.

### Reglas

1. **`main` es Producción.** Única rama eterna. Siempre desplegable. Sin commits directos (usar PR/Merge).
2. **Feature Branches (`feat/...`, `fix/...`) son Descartables.**
   - Crear para UNA tarea específica.
   - Borrar inmediatamente después del merge.
   - **Aislamiento Estricto:** Si estás en `feat/telemedicina`, NO arregles un bug en `auth`. Notarlo, terminar telemedicina, mergear, luego crear `fix/auth`.
   - **Naming:** `feat/desc-breve`, `fix/desc-bug`, `refactor/scope`.

---

## 1.2 Repository Hygiene (Non-Regressive)

**Reglas hard**

- Root solo para runtime/config/docs core.
- Nunca versionar artefactos temporales (`tmp-*`, logs, screenshots, `*.pid`, dumps).
- Outputs generados (`dist/`, `.astro/`, `.next/`, `.open-next/`) no se commitean nunca.
- Todo reporte técnico debe tener fecha/owner/TTL.
- Si aparece un nuevo patrón de artefacto local, actualizar `.gitignore` en el mismo commit.

**Checklist pre-commit (obligatorio)**

1. `git status --short` sin archivos fuera de lugar.
2. `pnpm lint && pnpm typecheck` limpios.
3. Si hubo rename/move: validar referencias con `grep -r`.
4. `pnpm --filter @autamedica/web check` con 0 errors.

---

## 2. Testing Commands

```bash
# Unit Tests (Vitest)
pnpm test:unit                          # Todos los tests
pnpm test:unit -t "appointment"         # Filtrar por patrón

# Astro TypeScript check
pnpm --filter @autamedica/web check     # 0 errors obligatorio

# TypeScript global
pnpm typecheck

# Lint
pnpm lint                               # Zero tolerance
pnpm lint:fix                           # Auto-fix
```

---

## 3. Code Style

### TypeScript

- **Strict mode** — Sin `any`. Usar `unknown` + validación.
- **Return types explícitos** en funciones públicas.
- **Null vs Undefined**: `undefined` para no cargado, `null` para vacío explícito/reset.
- **Branded types**: `PatientId`, `DoctorId`, `UUID` — no mezclar IDs de entidades distintas.
- **`ISODateString`** en lugar de `Date` en APIs y tipos de DB.
- **`APIResponse<T>`** como discriminated union en todas las respuestas de API.

```typescript
// Correcto
export type PatientId = string & { readonly _brand: "PatientId" };
export type DoctorId = string & { readonly _brand: "DoctorId" };
// Error en compile-time si se mezclan
```

### Naming Conventions

| Tipo                | Patrón                            | Ejemplo               |
| ------------------- | --------------------------------- | --------------------- |
| Páginas Astro       | `{name}.astro`                    | `appointments.astro`  |
| Islands React       | `{Name}.tsx` (PascalCase)         | `AppointmentCard.tsx` |
| Hooks               | `use{Name}.ts`                    | `useAppointments.ts`  |
| Tipos               | `{Entity}` en `@autamedica/types` | `Doctor`, `Patient`   |
| API endpoints Astro | `{action}.ts` en `pages/api/`     | `vitals.ts`           |

### Formatting

- Single quotes, 100 char width, trailing commas ES5.
- `pnpm lint:fix` para auto-formato.

---

## 4. Architecture & Ownership

### Monorepo Structure

```
apps/
  web/           # Astro 5 + React 19 islands (MIGRACIÓN ACTIVA)
  web-app/       # Next.js 15 (legacy — mantener hasta migración)
  auth/          # Next.js — portal auth central
  doctors/       # Next.js — portal médicos
  patients/      # Next.js — portal pacientes
  companies/     # Next.js — portal empresas
  admin/         # Next.js — panel admin
packages/
  types/         # @autamedica/types — 190+ tipos TypeScript
  shared/        # @autamedica/shared — utils, logger, env validation
  auth/          # @autamedica/auth — Supabase SSR client + hooks
  hooks/         # @autamedica/hooks — React hooks médicos
  ui/            # @autamedica/ui — componentes compartidos
  tailwind-config/ # @autamedica/tailwind-config — preset Tailwind
  telemedicine/  # @autamedica/telemedicine — WebRTC engine
supabase/
  functions/     # Edge Functions (Deno)
  migrations/    # SQL (YYYYMMDDHHMMSS_name.sql)
```

### Reglas de Ownership

- **`packages/*`**: lógica compartida, tipos, auth, hooks — sin lógica de presentación.
- **`apps/*/src/components`**: islands React o componentes Astro — sin lógica de negocio inline.
- **Prohibido** que apps importen directamente de otras apps. Solo via `packages/*`.
- Lógica médica y financiera en backend (Supabase RPC/Edge Functions), no en components.

---

## 5. Astro-Specific Patterns

### Islands Directives

- `client:load` — interactividad inmediata (above-the-fold, crítico para UX).
- `client:visible` — lazy cuando entra al viewport (below-the-fold).
- `client:only="react"` — cuando el componente no puede hacer SSR.
- Estado entre islands: `localStorage` o React Context DENTRO del island.

### Middleware y API Endpoints

```typescript
// Middleware: defineMiddleware de astro:middleware
import { defineMiddleware } from "astro:middleware";
export const onRequest = defineMiddleware(async (context, next) => {
  // context.locals.session, context.locals.supabase
  return next();
});

// API Endpoint
import type { APIRoute } from "astro";
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
```

### Variables de Entorno (Astro)

- **Siempre** `PUBLIC_*` (NUNCA `NEXT_PUBLIC_*` en apps/web).
- **Siempre** `import.meta.env` (NUNCA `process.env` en apps/web).
- Tipar en `src/env.d.ts`: `ImportMetaEnv` + `App.Locals`.

### Cookies en Middleware (Gotcha crítico)

- `AstroCookies` NO tiene `getAll()`.
- Parsear el Cookie header directamente:
  ```typescript
  const cookieHeader = context.request.headers.get("cookie") ?? "";
  return cookieHeader.split("; ").map((c) => {
    const eq = c.indexOf("=");
    return { name: eq >= 0 ? c.slice(0, eq) : c, value: eq >= 0 ? c.slice(eq + 1) : "" };
  });
  ```
- `AstroCookies.set()` requiere castear `options as any` si Supabase SSR pasa `Partial<CookieSerializeOptions>`.

### Migración Next.js → Astro (Checklist)

- [ ] `next/dynamic` → imports estáticos + directivas `client:*`.
- [ ] `useRouter` de `next/navigation` → `window.location` o `<a href>`.
- [ ] `styled-jsx` (`<style jsx>`) → `<style>` regular o Tailwind.
- [ ] Import paths con extensión `.tsx` en `.astro`: omitir extensión.
- [ ] `NEXT_PUBLIC_*` → `PUBLIC_*`.
- [ ] `process.env` → `import.meta.env`.
- [ ] `@autamedica/shared` requiere `pnpm build:packages:core` antes de `astro check`.

---

## 6. Product & UX Constraints (Non-Negotiable)

- Evitar wizards paso a paso; usar flujos de página única cuando sea posible.
- Evitar modales para formularios médicos — usar páginas dedicadas o bottom sheets.
- No mostrar términos técnicos en UI (UUID, RPC, API, JWT).
- Preferir UI optimista con rollback en error.
- Datos de salud: privacidad primero. Nunca exponer información médica sin autorización explícita.

---

## 7. Supabase (DB + Edge Functions)

### Storage Paths

```typescript
// CORRECTO — sin prefijo de bucket
await supabase.storage.from("medical-docs").upload(`${userId}/doc.pdf`, file);

// INCORRECTO — rompe RLS
await supabase.storage.from("medical-docs").upload(`medical-docs/${userId}/doc.pdf`, file);
```

### Error Handling

```typescript
const { data, error } = await supabase.from("appointments").select();
if (error) {
  logger.error("Query failed", error); // logger de @autamedica/shared, nunca console.*
  throw error;
}
```

### RPC & Queries

```typescript
// Correcto (schema explícito via Accept-Profile)
const { data } = await supabase.schema("public").rpc("get_patient_appointments", { patient_id });

// OK (default schema = public)
const { data } = await supabase.rpc("get_patient_appointments", { patient_id });

// INCORRECTO — se convierte en public.public.fn en PostgREST
const { data } = await supabase.rpc("public.get_patient_appointments", { patient_id });
```

### Migraciones

- Naming: `YYYYMMDDHHMMSS_name.sql`.
- Idempotentes: `IF NOT EXISTS` y checks antes de `DROP`.
- Tablas nuevas requieren políticas RLS.
- Datos médicos: retención mínima 15 años (ley Argentina).

### Edge Functions

- Siempre retornar errores HTTP semánticos (400/404/409), no 500 genérico.
- Nunca hardcodear secrets; usar `Deno.env.get(...)`.
- Logging estructurado con prefijo `[function-name]`.
- Ver logs en Supabase Dashboard.

### Two-Plane Debugging (UI vs DB) — Crítico

Siempre hay dos planos:

- **UI/Client gating**: lo que la UI permite, filtra, deshabilita u oculta (guards, middleware Astro, queries).
- **DB enforcement**: lo que la DB realmente permite (enums, triggers, constraints, RLS).

Si un bug parece "se guardó pero no se ve" o "desapareció", asumir **RLS y filtros** primero.

**Auth context (Edge Functions):**

- `auth.uid()` solo existe si el request incluye un **JWT de usuario** (header `Authorization`).
- Llamar un RPC con **service role** usualmente hace que `auth.uid()` quede NULL → RLS falla.
- Patrón en Edge Functions: 2 clientes Supabase:
  - service role para lecturas/escrituras privilegiadas.
  - anon key + `Authorization` forwardeado para RPCs user-scoped.

### Roles de Usuario (AutaMedica)

- `patient` → redirige `/dashboard`
- `doctor` → redirige `/doctor/dashboard`
- `company` → redirige `/company/dashboard`
- `admin` → redirige `/admin/dashboard`
- Sin rol → redirige `/auth/select-role`

### DB Access CLI (Producción)

```bash
PGPASSWORD="$DB_PASSWORD" psql "postgresql://postgres.qxjjrpksmwwrmubhvjew@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&connect_timeout=5"
```

Nunca pegar credenciales en chat o commitearlas a git.

---

## 8. Frozen Code (NO MODIFICAR)

- **`apps/web-app/`**: Legacy en proceso de reemplazo. No invertir esfuerzo significativo. Solo mantener si lo pide el usuario.
- **Signaling Server WebRTC**: Solo modificar si el usuario lo pide explícitamente con justificación.

---

## 9. Anti-Patterns

| Evitar                                    | Usar en cambio                    |
| ----------------------------------------- | --------------------------------- |
| `console.*` en prod                       | `logger` de `@autamedica/shared`  |
| `process.env` en apps/web                 | `import.meta.env.PUBLIC_*`        |
| `next/dynamic` en apps/web                | Imports estáticos + `client:*`    |
| `styled-jsx` (`<style jsx>`)              | `<style>` regular o Tailwind      |
| Import `.tsx` con extensión en `.astro`   | Omitir extensión                  |
| `supabase.*` directo en components        | Hooks de `@autamedica/hooks`      |
| Cross-app imports                         | Solo via `packages/*`             |
| `any` type                                | `unknown` + type guards           |
| Lógica médica/financiera en frontend      | Backend es la autoridad           |
| Hardcoded strings de dominio              | Constantes en `@autamedica/types` |
| `useRouter` de `next/navigation` en Astro | `window.location` o `<a href>`    |
| `req.body.user_id` en Edge Functions      | `auth.getUser()` (JWT)            |

---

## 10. Performance Checklist (Ship-Ready)

- Islands con `client:visible` para lazy loading (below-the-fold).
- Imágenes con `loading="lazy"` y formatos modernos (WebP/AVIF).
- Búsquedas con debounce >= 300ms.
- Datos médicos paginados (no cargar todo).
- Islands React solo contienen estado local necesario.

---

## 11. Security Checklist (Ship-Ready)

- RLS en todas las tablas nuevas.
- Ninguna clave service-role en frontend.
- Validar input en la frontera (API endpoints Astro, Edge Functions).
- CORS configurado correctamente en Edge Functions.
- Datos de salud: TLS 1.3 en tránsito, AES-256 en reposo.
- Historia clínica: retención mínima 15 años (Ley 26.529, Argentina).
- `auth.uid()` como fuente de verdad de identidad, nunca `req.body.user_id`.

---

## 12. Anti-Regression Protocol (Senior Standard)

1. Un dominio a la vez. No mezclar auth/telemedicina/payments en un solo cambio.
2. Commits pequeños como checkpoints. Si rompe: `git diff HEAD~1` muestra por qué.
3. `pnpm --filter @autamedica/web check` debe seguir pasando al tocar lógica core.
4. Si un cambio toca 3+ archivos, re-scopear o explicar por qué.

---

## 13. Browser Automation Policy

- Para testing E2E: usar Patchright Streaming con perfil persistente en `/home/edu/.patchright-profile`.
- Default: headed (NO headless). Headless solo si el usuario lo pide explícitamente.
- Mantener sesión del browser persistente: no resetear/cerrar salvo pedido explícito.
- Validar flujos críticos (login, selección de rol, consulta médica) como usuario real.

---

## 14. Pre-Commit Checklist

- [ ] `pnpm lint` pasa (0 errores, 0 warnings)
- [ ] `pnpm --filter @autamedica/web check` con 0 errors (si se tocó apps/web)
- [ ] `pnpm build:packages:core` exitoso
- [ ] Conventional commit (`feat:`, `fix:`, `docs:`, `refactor:`)
- [ ] Sin archivos fuera de lugar en `git status`
- [ ] Sin `any`, `TODO`, `FIXME`, `HACK`, `TEMP` nuevos

---

## 15. Deploy Order (Obligatorio)

```
1. PACKAGES (pnpm build:packages:core)
   ↓
2. DATABASE (supabase db push — si hay migraciones)
   ↓
3. EDGE FUNCTIONS (supabase functions deploy — si aplica)
   ↓
4. APP BUILD (pnpm --filter @autamedica/web build)
   ↓
5. DEPLOY (wrangler pages deploy dist --project-name autamedica-web)
```

**Razón:** El frontend puede depender de nuevas tablas/funciones. Si se hace build primero, habrá errores hasta que el backend esté listo.

---

## 16. Advanced Hardening Rules

Para protocolos detallados de hardening (enum sync, schema verification, migration idempotency, Edge Function auth patterns, RLS audit scripts, typed status updates, pre-deploy verification), ver **`AGENTS-2.md`** en el root del proyecto.

Temas clave en AGENTS-2.md:

- Enum Sync Protocol (DB ↔ TypeScript)
- Schema Verification antes de codificar
- Migration Idempotency Standards
- Edge Function Auth-First Pattern (patrón 2-clientes)
- RLS Coverage Requirements & Audit Script
- Typed Status Updates (state machine enforcement)
- Pre-Deploy Verification Protocol
- Quality Gates para CI

---

## 17. Senior Prompt Template (Debug + Hardening)

```text
Contexto: AutaMedica. Analizar [BUG/FEATURE] a nivel senior. Objetivo: arreglar causa raíz sin whack-a-mole.

Regla: dividir análisis en 2 planos y validar ambos:
1) UI/Client gating: guards, filtros, disabled/overlay, middleware Astro, queries.
2) DB enforcement: enum values, triggers/constraints, RLS policies, RPCs, PostgREST schema cache.

Pre-checks (obligatorio):
- Confirmar schema real en producción (tipos DB o information_schema). NO asumir columnas.
- Listar invariantes (reglas médicas/legales) e identificar datos legacy que las violan (SQL).
- Confirmar contexto auth de cada RPC (user JWT vs service role, si la función usa auth.uid()).
- En apps/web (Astro): verificar PUBLIC_* e import.meta.env; @autamedica/shared buildado.

Entregables:
- Hipótesis por plano + pasos de validación concretos (SQL, rutas a testear).
- Causa raíz confirmada.
- Fix mínimo (DB primero si es regla de negocio crítica) + mirror en UI.
- Checklist de verificación (SQL prod, astro check/build, evidencia visual).
```

---

## 18. Imported Senior Rules (AutoRenta -> AutaMedica)

Reglas framework-agnostic transferidas desde AutoRenta para subir el estándar de operación:

1. **AI Cross-Review obligatorio:** Ningún cambio generado por IA se considera listo sin una segunda auditoría (humano u otro agente). Fallos comunes: reformat destructivo, imports duplicados, eliminación accidental de optimizaciones existentes, archivos creados en paths no canónicos.
2. **Higiene de repo reforzada:** Si se tocan docs/reportes, ejecutar `pnpm docs:ttl:check`. Si hay rename/copy sospechoso (`C100`), validar con `git log --follow --name-status <file>`.
3. **Regeneración de tipos de DB con protocolo seguro:** Generar a `/tmp`, comparar diff, validar enums/estados críticos, correr checks/build y recién después reemplazar archivo canónico.
4. **Workflows resilientes:** Preferir "prerequisite check + skip explícito" antes que `continue-on-error`. No ocultar fallas reales.
5. **Post-Implementation Review obligatorio (UI):** Validar con evidencia visual (capturas before/after), probar viewports 375/768/1024/1440 y listar defectos encontrados sin complacencia.
6. **Operaciones largas en tmux:** Migraciones pesadas, builds largos o tests extensos se ejecutan en sesión `tmux` para persistencia y observabilidad.
7. **Regla de nombres SQL:** Evitar `atomic` en nombres de tablas/columnas/funciones por bug conocido del parser de Supabase CLI.
8. **Frozen Code policy:** Definir paths críticos read-only por defecto. Solo se modifican con pedido explícito del usuario.

Detalles operativos y checklists en `AGENTS-2.md` (sección 23).
