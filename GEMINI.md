# GEMINI.md: AutaMedica Core Intelligence

> **Fuente de Verdad para el Agente Gemini en AutaMedica.**
> Este documento define el contexto, las reglas inquebrantables y los flujos de trabajo estándar.

## Regla de Higiene de Repo (NUNCA REGRESIVO)

**Invariantes**

- Root solo contiene runtime/config/docs core.
- Prohibido versionar `tmp-*`, logs, screenshots, `*.pid`, dumps y outputs locales de debugging.
- `dist/`, `.astro/`, `.next/`, `.open-next/` nunca se commitean.
- Todo reporte técnico debe tener fecha/owner/TTL; reportes stale se archivan.
- Si aparece un nuevo patrón de artefacto local, actualizar `.gitignore` en el mismo commit.

**Checklist obligatorio**

1. `git status --short` limpio de ruido.
2. `pnpm lint && pnpm typecheck` limpios.
3. `pnpm --filter @autamedica/web check` con 0 errors.
4. Validar rutas tras `git mv` con `grep -r`.

---

## 1. Reglas Operativas Inquebrantables (Core Protocol)

> Estas reglas tienen precedencia sobre cualquier otra instrucción. Son el "sistema operativo" del agente.

### REGLA #0: Cero Código sin Integración

- **Prohibido** generar código que no tenga consumidor real en el mismo PR/commit.
- Si al borrar ese código no se rompe nada, probablemente no debía existir.
- **Checklist:**
  - [ ] Hay al menos un consumidor real (página Astro, island React, API endpoint, package, Edge Function).
  - [ ] Flujo completo trazable: trigger → resultado visible al usuario.
  - [ ] El código nuevo no queda huérfano.

### REGLA #1: Packages Orquestan, Islands Ejecutan

- **Packages (`packages/*`):** tipos compartidos, lógica de negocio, auth, hooks — sin lógica de presentación.
- **Islands React (`.tsx` con `client:*`):** estado local e interactividad — sin lógica de negocio inline.
- **Páginas Astro (`.astro`):** markup estático + composición de islands.
- **Edge Functions:** lógica de backend, queries complejas, integraciones externas.
- **Prohibido** duplicar lógica entre packages y apps.

### REGLA #3: Validación Cross-Layer (UI ↔ DB)

- **Nunca asumir** que el código local coincide con producción.
- **Antes de codificar:** Verificar nombres reales de columnas (`information_schema`) y RPCs (`pg_proc`) en prod.
- **Durante:** Si Edge Function escribe `col_x`, el RPC que lee debe leer `col_x`.
- **Después:** Validar end-to-end (trigger real → DB state → UI update).
- **En apps/web (Astro):** Variables `PUBLIC_*`, `import.meta.env`, middleware con `defineMiddleware`.

### REGLA #4: Prohibido Stubs Destructivos

- **Mandato:**
  1. NUNCA usar `CREATE OR REPLACE` sobre funciones existentes sin leer su código actual.
  2. Migraciones `DROP/CREATE TABLE` deben preservar TODAS las columnas existentes.
  3. Verificar post-deploy que la lógica crítica (ej: RLS médica) sigue activa.

### REGLA #5: Tolerancia Cero a TODOs (Zero Debt Policy)

- **Prohibición Total:** Terminantemente prohibido dejar `// TODO`, `// FIXME`, o comentarios tipo "optimizar luego".
- **Filosofía:** Si una tarea es necesaria, se implementa AHORA. Si no es necesaria, no se menciona.
- **Excepciones Únicas** (formato obligatorio: `// TODO(tipo): [Contexto] Razón detallada`):

| Tipo      | Uso Permitido                                                             | Ejemplo                                                                               |
| --------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `blocked` | Bloqueo externo real (API de terceros caída o inexistente)                | `// TODO(blocked): [Certificación ANMAT] Esperando aprobación regulatoria Q3 2026`    |
| `risk`    | La solución correcta requiere migración masiva de datos médicos peligrosa | `// TODO(risk): [HistoriaClinica] Requiere migración de datos con HIPAA review antes` |
| `flag`    | Código detrás de Feature Flag explícito                                   | `// TODO(flag): [VideoConsulta] Habilitar cuando WebRTC cert HIPAA esté listo`        |

- **Cualquier otro TODO será considerado un error.**

---

## 2. Supabase & DB Hardening (Dos Planos)

### El Principio de los "Dos Planos"

Para cualquier feature o bug de datos, analizar y validar siempre en dos niveles:

1. **Plano UI/Client Gating:**
   - Middleware Astro, guards, filtros, estados disabled, overlays visuales.
   - _Objetivo:_ UX y feedback al usuario.

2. **Plano DB Enforcement:**
   - Enums, Constraints, Triggers, RLS Policies, RPC logic.
   - _Objetivo:_ Integridad de datos y seguridad real (especialmente crítico para datos médicos).

**Regla:** Las reglas de negocio críticas (ej: "No mostrar datos de paciente sin autenticación") se **enforcean en DB** y se **reflejan en UI**.

### Auth Context

- `auth.uid()` en Postgres/RLS solo funciona si se reenvía el JWT del usuario.
- En Edge Functions: usar `supabaseClient` con `Authorization` header del request original para operaciones user-scoped.

### Diagnóstico de Auth (No culpes al Token)

- **Anti-Patrón:** Ver un 401/403 y decir "El token expiró, logueate de nuevo".
- **Investigación correcta:**
  1. ¿El header `Authorization` llegó a la Edge Function? (Logs)
  2. ¿El usuario existe en `auth.users`? (DB)
  3. ¿El usuario tiene el rol correcto en `user_metadata`? (DB)
  4. ¿El RLS permite la operación? (Policy Audit)
  5. Solo después de descartar todo esto, sugerir refresh de token.

---

## 3. Insights Operativos (Gotchas)

- **Payload Trust (Seguridad Crítica):** En Edge Functions, **NUNCA** confiar en `req.body.user_id`. La única fuente de verdad para la identidad es `auth.getUser()` (JWT). Datos médicos con identidad incorrecta = violación de privacidad.

- **The "Hollow Backend" Risk:** Una función SQL que retorna `true` hardcodeado (Stub) no es una "tarea pendiente", es un **BUG CRÍTICO**. Crea una falsa sensación de progreso y puede exponer datos médicos a usuarios no autorizados.

- **`@autamedica/shared` requiere build previo:** Si aparece `Cannot find module '@autamedica/shared'` al correr `astro check`, ejecutar `pnpm build:packages:core` primero.

- **Cookies en Astro middleware:** `AstroCookies` no tiene `getAll()`. Parsear el Cookie header directamente: `request.headers.get('cookie').split('; ')`. `AstroCookies.set()` acepta `AstroCookieSetOptions` — castear con `as any` si Supabase SSR pasa `Partial<CookieSerializeOptions>`.

- **`styled-jsx` es Next.js only:** Al migrar componentes a `apps/web` (Astro), reemplazar `<style jsx>` y `<style jsx global>` con `<style>` regular.

- **Imports con extensión `.tsx` en archivos `.astro`:** TypeScript en Astro rechaza `import Foo from './Foo.tsx'`. Omitir la extensión: `import Foo from './Foo'`.

- **`next/dynamic` → imports estáticos en Astro:** Las directivas `client:*` de Astro reemplazan `dynamic()`. Usar imports estáticos + `client:visible` para lazy load.

- **Variables de entorno Astro vs Next.js:** `PUBLIC_SUPABASE_URL` (Astro) ≠ `NEXT_PUBLIC_SUPABASE_URL` (Next.js). En `apps/web` siempre usar `PUBLIC_*` y `import.meta.env`.

- **PL/pgSQL lazy validation:** PostgreSQL NO valida nombres de columnas al crear funciones — solo al ejecutarlas. Una función que compila OK puede fallar en runtime si la columna real tiene otro nombre.

- **Supabase UPDATE sin WHERE:** Supabase bloquea `UPDATE tabla SET ...` sin `WHERE`. Agregar `WHERE true` si el UPDATE es intencional sobre toda la tabla.

- **Baseline desde prod (OBLIGATORIO):** NUNCA consolidar migraciones concatenando archivos SQL manualmente. Usar `pg_dump --schema-only` o Supabase Management API para obtener schema real de prod como baseline.

- **Limitación de RLS (Objeto OLD):** Las cláusulas `WITH CHECK` de políticas RLS para `UPDATE` NO tienen acceso a `OLD`. Solo Triggers tienen acceso a `OLD`. Para validar cambios de campos específicos (ej: evitar que un paciente cambie su `doctor_id`), usar Triggers procedurales.

- **Turbo cache invalidation:** Si Turbo usa cache obsoleta, usar `--force` o limpiar `.turbo/` local.

### Hexagonal Layered Architecture — Patrones Transversales

Sobre las 7 capas base (UI → Hook → Service → API Client → Controller → Service → Repository), se aplican 4 patrones adicionales:

- **Ports** (`packages/types/src/ports/`): Interfaces abstractas de repos (`IPatientRepository`, `IAnamnesisRepository`, `IAppointmentQueryRepository`). Cada repo tiene un `createXxxAdapter(supabase)` factory. Permite mock testing sin DB.
- **Domain Events** (`packages/shared/src/events/`): `domainEvents.emit('appointment.completed', payload)` / `domainEvents.on(...)`. Tipado con `DomainEvents` map. Complementa (no reemplaza) Supabase Realtime.
- **Use Cases** (`apps/web/src/lib/*/usecases/*.usecase.ts`): Flujos de negocio completos con inyección de dependencias. Ej: `completeAnamnesis(deps, input)`, `startTeleconsultation(deps, input)`.
- **CQRS Lite** (`apps/web/src/lib/*/queries/*.query.ts`): Read models de dashboard separados de services. Ej: `queryDashboardStats()`, `queryNotificationFeed()`.

Detalle: `docs/ARQUITECTURA.md` sección "Patrones Avanzados".

---

## 4. Contexto & Memorias Activas

### Perfil del Proyecto

- **Proyecto:** AutaMedica — plataforma de telemedicina (Argentina)
- **Ubicación:** `/home/edu/Autamedica`
- **Stack Tecnológico:**
  - **Frontend Web (landing):** Astro 5 + React 19 islands (MIGRACIÓN ACTIVA desde Next.js)
  - **Frontend Apps:** Next.js 15 — portales auth, doctors, patients, companies, admin
  - **Build:** Turborepo 2.x + pnpm workspaces
  - **Estilos:** Tailwind CSS (preset `@autamedica/tailwind-config`)
  - **Backend:** Supabase (PostgreSQL, Edge Functions, Auth, Storage)
  - **Deploy:** Cloudflare Pages (por app)
  - **Video:** WebRTC (signaling server propio)
- **Filosofía Actual:** "Excelencia Operacional + Migración Progresiva" (Next.js → Astro, app por app).
- **Regulatorio:** HIPAA, Ley 26.529 (Argentina — derecho del paciente), Ley 25.326 (datos personales).

### Estado Actual (Fase 1: Migración Landing)

- `apps/web` (Astro 5): landing migrada. Status: 0 TypeScript errors. Pendiente deploy a producción.
- `apps/web-app` (Next.js): legacy. Mantener estable, no invertir esfuerzo.
- `apps/auth`, `apps/doctors`, `apps/patients`, `apps/companies`, `apps/admin`: Next.js, en producción.
- **Regla de migración:** No migrar el siguiente app a Astro sin que el anterior esté deployado y verificado.

### Dominio Médico (AutaMedica)

- **Consultas:** Médico + Paciente se conectan por video/chat. El médico prescribe; el paciente recibe.
- **Flujo principal:** Registro → Selección de especialidad → Selección de médico → Consulta → Receta digital.
- **Portales:**
  - Pacientes (`/dashboard`): agendar consulta, ver historial, descargar recetas.
  - Médicos (`/doctor/dashboard`): ver agenda, consultas pendientes, prescribir.
  - Empresas (`/company/dashboard`): gestionar colaboradores, ver métricas de salud.
  - Admin (`/admin/dashboard`): gestión global, aprobación de médicos, reportes.

### Supabase Project

- **Project ID:** `qxjjrpksmwwrmubhvjew`
- **URL:** `https://qxjjrpksmwwrmubhvjew.supabase.co`

### Firebase Project (Android Push Notifications)

- **Cuenta Gmail:** `autamedica@gmail.com` ← DUEÑA del proyecto Firebase
- **Project ID:** `autamedica-e54fa`
- **Project Number (Sender ID):** `653971537811`
- **Android App ID:** `1:653971537811:android:08a5441d27cef1d7f37266`
- **Package Name:** `com.autamedica.android`
- **API Key (Android):** `AIzaSyAS-c0uUDU0hyUVJFIb5A8Xndq3FXHKRZs`
- **Plan:** Spark (gratuito)
- **Console:** `https://console.firebase.google.com/u/1/project/autamedica-e54fa`

### Cuentas y Servicios (Referencia Rápida)

| Servicio                 | Cuenta/Email             | Notas                           |
| ------------------------ | ------------------------ | ------------------------------- |
| **Firebase (FCM, Auth)** | `autamedica@gmail.com`   | Proyecto `autamedica-e54fa`     |
| **Supabase**             | (verificar en dashboard) | Proyecto `qxjjrpksmwwrmubhvjew` |
| **Google Cloud (GCP)**   | `autamedica@gmail.com`   | Mismo proyecto que Firebase     |
| **Cloudflare Pages**     | (verificar en dashboard) | Deploy de apps web              |
| **GitHub**               | (verificar en settings)  | Repo monorepo AutaMedica        |

> **REGLA:** Nunca asumir en qué cuenta está un servicio. Consultar esta tabla primero.

---

## 4b. Estrategia de Ramas (Senior Trunk-Based Development)

> **Contexto:** Solo Founder + Agentes. GitFlow (`develop`, `staging`) es burocracia innecesaria.
> **Estrategia:** GitHub Flow Senior (1 Rama Eterna + Ramas Efímeras + Trazabilidad).

### Las Reglas del Árbol

1. **`main` es Sagrada (Producción)**
   - Única rama de larga duración. Representa código desplegable.
   - **PROHIBIDO** commit directo. Todo cambio entra vía Pull Request o Merge.

2. **Ramas Efímeras (`<type>/<desc-breve>`)**
   - Vida corta (< 48h). Un solo objetivo.
   - Tipos: `feat/`, `fix/`, `refactor/`, `docs/`, `perf/`.
   - **Aislamiento Total:** Terminar una tarea, mergear, borrar rama.

### Protocolo de Commits y Trazabilidad (Senior Standards)

1. **Commits Atómicos:**
   - Unidad mínima de cambio estable.
   - **Conventional Commits:** `<type>(<scope>): <imperative description>`.
   - Ejemplo: `feat(blog): add humanized audio reader to cards`.
   - Si corriges un bug y refactorizas, son **dos commits diferentes**.

2. **Pull Requests (Bitácora Legal):**
   - Toda PR debe usar el `pull_request_template.md`.
   - **Contenido Obligatorio:** Contexto (Why), Solución (How), Validación en Dos Planos (UI vs DB) y Evidencia Técnica (Screenshots/Logs).
   - Sirve como registro histórico de decisiones técnicas.

3. **Protocolo de Push (0% Regresión):**
   - Sincronizar con `main` vía `rebase` antes de subir.
   - **Pre-flight:** `pnpm lint`, `pnpm build` y `pnpm test:unit` deben pasar localmente.
   - **CI Monitoring:** Si GitHub Actions falla, la rama es "radioactiva"; prohibido mergear.

4. **Higiene del Working Tree:**
   - **NUNCA** ejecutar `merge`, `pull`, `rebase` ni despliegues manuales si el working tree no está 100% limpio. Usar `git status` para comprobar, y limpiar/guardar en stash cambios no planeados.

5. **Estrategia de Merge en Main (Rebase vs Squash):**
   - **Ramas Limpias (Sin merges internos):** Aplicar **Rebase merge** (o fast-forward).
   - **Ramas con Merges Internos (e.g., `merge branch 'main' into...`):** Aplicar estrictamente **Squash merge** para evitar introducir merge nodes intermedios y mantener la historia de `main` limpia y legible.

6. **Configuración Estándar de Git:**
   - Todo agente o desarrollador debe mantener activa esta configuración local/global:
     ```bash
     git config --global pull.rebase true
     git config --global rebase.autoStash true
     git config --global merge.ff only
     ```

### Protocolo de Contexto del Agente (Anti-Mezcla)

**Reglas de Foco:**

1. **Una Rama = Un Objetivo.** Al inicio, definir: _"Estoy en `feat/x` y mi único objetivo es X"_.
2. **Definition of Done (DoD) por Rama:**
   - Código completo, probado y validado en dos planos.
   - `pnpm lint` 0 errores, `pnpm --filter @autamedica/web check` 0 errors.
   - PR abierta con documentación de trazabilidad.
   - Merge a `main` y **RAMA BORRADA LOCAL Y REMOTAMENTE.**
3. **No reciclar ramas.** Una vez mergeada, la rama muere.

---

## 5. Convenciones Técnicas

- **Gestión de Paquetes:** Uso exclusivo de `pnpm`.
- **TypeScript Estricto (ZERO TOLERANCE):**
  - **PROHIBIDO `any`:** Nunca usar `any` para silenciar errores.
  - **Usar `unknown`:** Para datos inciertos (errores, API responses), usar `unknown` + type guards.
  - **Interfaces Explícitas:** Tipar siempre respuestas de APIs y objetos externos.
  - **`null` vs `undefined`:**
    - `undefined` para valores opcionales o aún no cargados.
    - `null` para valores explícitamente vacíos (ej: `session = null` al logout).
- **Tailwind CSS:** Única fuente de estilos. No crear clases CSS personalizadas salvo UI Kit reutilizable.
- **Sintaxis:** ESM y APIs modernas (Astro islands, React hooks, Edge Functions Deno).

---

## 6. Arquitectura Frontend

### Apps (por portal)

```
apps/web/src/
├── pages/          # .astro pages + API endpoints
├── layouts/        # Layout.astro (SEO, estructura HTML)
├── components/
│   ├── experience/ # Islands React (HeroVertical, GSAP, etc.)
│   ├── landing/    # Islands React (Testimonials, Footer, etc.)
│   ├── seo/        # Componentes Astro estáticos (StructuredData)
│   └── ui/         # Components Astro simples (ScrollProgress, GlobalLoader)
├── lib/            # supabase.ts, env.ts
├── middleware.ts   # defineMiddleware — auth + routing
└── styles/         # globals.css
```

### Patrones Recomendados

| Patrón                          | Descripción                                           |
| ------------------------------- | ----------------------------------------------------- |
| **Static Astro / React Island** | Páginas en Astro, interactividad en islands React     |
| **Server-Side Auth**            | Middleware Astro verifica sesión con Supabase SSR     |
| **Package Facade**              | Hooks y lógica en `packages/*`, islands solo consumen |
| **Typed RPC Calls**             | Siempre tipar respuestas de `supabase.rpc<T>()`       |
| **Optimistic UI**               | Actualizar UI antes de confirmar con backend          |

### Anti-Patrones Prohibidos

| Anti-Patrón                           | Razón                                                    |
| ------------------------------------- | -------------------------------------------------------- |
| `styled-jsx` en islands de `apps/web` | Next.js only, no funciona en Astro                       |
| `next/dynamic` en `apps/web`          | Reemplazado por directivas `client:*`                    |
| `process.env` en `apps/web`           | Usar `import.meta.env.PUBLIC_*`                          |
| `console.log` en prod                 | Usar `logger` de `@autamedica/shared`                    |
| Cross-app imports                     | `apps/doctors/src` desde `apps/patients/src` = PROHIBIDO |
| Lógica médica en frontend             | El backend es la autoridad                               |
| Términos técnicos en UI               | No mostrar "UUID", "RPC", "JWT", "API" al usuario        |

---

## 7. Supabase Guidelines

### RPC & Queries

```typescript
// Correcto: schema explícito via Accept-Profile
const { data } = await supabase.schema("public").rpc("get_patient_consultations", { patient_id });

// OK: default schema = public
const { data } = await supabase.rpc("get_patient_consultations", { patient_id });

// INCORRECTO: se convierte en public.public.fn en PostgREST
const { data } = await supabase.rpc("public.get_patient_consultations", { patient_id });
```

### Edge Functions

1. **Seguridad:** Auth verificada ANTES de cualquier lógica (ver AGENTS-2.md §18).
2. **Error Handling:** Retornar códigos semánticos (400, 401, 403, 404, 409), no 500 genérico.
3. **Logging:** `console.error('[fn-name] context', error)` — NUNCA loguear datos médicos.
4. **Secrets:** `Deno.env.get('SECRET_NAME')`, nunca hardcodeados.

### Migraciones

- **Naming:** `YYYYMMDDHHMMSS_descriptive_name.sql`
- **Idempotencia:** `IF NOT EXISTS`, existence checks antes de `DROP`.
- **RLS:** Toda tabla nueva debe tener políticas RLS (ver AGENTS-2.md §19).

### Regla de Oro: Dos Planos (UI vs DB)

- **Plano UI/Client gating:** lo que el frontend permite, filtra, deshabilita u oculta.
- **Plano DB enforcement:** lo que la DB realmente permite (enum values, triggers, constraints, RLS policies).
- Si un bug parece "guardó pero no se ve" o "desapareció", asumir **RLS y filtros** primero.
- Las reglas críticas de negocio médico deben ser **enforced en DB** y reflejadas en UI.

### Regla Crítica: Auth Context (service_role vs user JWT)

- `auth.uid()` solo existe si la request trae un **JWT de usuario** (header `Authorization`).
- Si un RPC valida permisos con `auth.uid()`, llamarlo con **service role** usualmente falla.
- Patrón en Edge Functions: 2 clientes Supabase (ver AGENTS-2.md §18.1).

---

## 8. Manejo de Errores

### Jerarquía de Errores

```
AppError (base)
├── NetworkError      → Problemas de conexión
├── AuthError         → Sesión expirada, no autorizado
├── ValidationError   → Datos inválidos del usuario
├── MedicalError      → Reglas médicas o regulatorias violadas
└── SystemError       → Errores internos inesperados
```

### Patrón de Manejo (en hooks/services)

```typescript
try {
  await bookConsultation(data);
} catch (error) {
  if (error instanceof AuthError) {
    window.location.href = "/auth/login";
  } else if (error instanceof MedicalError) {
    showToast(error.userMessage); // Mensaje amigable para el paciente
  } else {
    logger.error("Consultation booking failed", error);
    showToast("Ocurrió un error. Por favor intentá nuevamente.");
  }
}
```

---

## 9. Testing & Calidad

- **Ejecución:**
  - TypeScript check (Astro): `pnpm --filter @autamedica/web check` (0 errors = obligatorio)
  - Unitarios: `pnpm test:unit` (Vitest)
  - Lint: `pnpm lint` (zero tolerance)
- **E2E interactivo (UI/UX + verificación visual):** usar Patchright Streaming (headed por defecto).
- **Proactividad:** Actualizar tests al cambiar comportamiento de lógica crítica.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`).

---

## 10. Performance Checklist

- [ ] **Islands lazy:** `client:visible` para componentes below-the-fold.
- [ ] **Islands inmediatos:** `client:load` solo para above-the-fold crítico.
- [ ] **Imágenes:** `loading="lazy"`, formatos WebP/AVIF.
- [ ] **Debounce:** Inputs de búsqueda con debounce >= 300ms.
- [ ] **Paginación:** Datos médicos paginados, no cargar todo.

---

## 11. Security Checklist

- [ ] **RLS Policies:** Toda tabla tiene Row Level Security.
- [ ] **Input Sanitization:** Nunca confiar en input del usuario sin validar.
- [ ] **CORS:** Configurado correctamente en Edge Functions.
- [ ] **Secrets:** Nunca en código fuente. Variables de entorno siempre.
- [ ] **Auth Middleware:** Rutas protegidas con middleware Astro.
- [ ] **Rate Limiting:** Endpoints sensibles (consultas médicas) con límites en Edge Functions.
- [ ] **Datos médicos:** TLS 1.3 en tránsito, AES-256 en reposo.
- [ ] **Privacidad:** Logs nunca contienen datos médicos del paciente.

---

## 12. Comandos Frecuentes

| Comando                               | Descripción                       |
| ------------------------------------- | --------------------------------- |
| `pnpm build:packages:core`            | Compilar packages (ANTES de apps) |
| `pnpm --filter @autamedica/web dev`   | Dev server Astro (port 3000)      |
| `pnpm --filter @autamedica/web check` | TypeScript check Astro            |
| `pnpm --filter @autamedica/web build` | Build Astro → dist/               |
| `pnpm lint`                           | ESLint (zero tolerance)           |
| `pnpm lint:fix`                       | Auto-fix ESLint                   |
| `pnpm test:unit`                      | Tests unitarios (Vitest)          |
| `pnpm db:sync`                        | Regenerar tipos desde DB          |
| `pnpm deploy:web`                     | Build + deploy apps/web           |
| `supabase db push`                    | Aplicar migraciones en prod       |
| `supabase functions deploy`           | Deploy Edge Functions             |

### CUIDADO: Comandos de Build en Monorepo

| Comando                               | Scope            | Cuándo Usar                 |
| ------------------------------------- | ---------------- | --------------------------- |
| `pnpm build:packages:core`            | Solo packages    | Siempre, antes de apps      |
| `pnpm --filter @autamedica/web build` | Solo apps/web    | Para verificar landing      |
| `pnpm build`                          | TODO el monorepo | Solo CI/CD o build completo |

---

## 13. Comportamiento del Agente (SENIOR PROFESSIONAL MODE)

### Mentalidad: "Deep Context & Zero Debt"

Tu objetivo no es "escribir código rápido", es **construir sistemas robustos para telemedicina**. Errores en datos médicos tienen consecuencias reales.

#### 0. RAZONAMIENTO PROFUNDO (Obligatorio en Tareas Críticas)

Cuando el usuario solicite implementaciones que toquen datos médicos (HIPAA/Argentina), migraciones destructivas de DB médica, integraciones financieras o interpretaciones regulatorias, el agente DEBE:

1. Activar su "Cadena de Pensamiento" interna (Self-Reflection).
2. Dudar de su primera respuesta inmediatamente.
3. Ejecutar sub-búsquedas en la web o en el código interno (`search_web`, `grep_search`) para validar regulaciones (Ley 26.529, HIPAA) e impactos técnicos.
4. Redactar una respuesta, criticarla internamente (foco en privacidad/seguridad) y solo imprimir al usuario la versión final validada y contrastada.

#### 0.5 PROGRAMACIÓN ESTRUCTURAL DE ALTO RAZONAMIENTO

Antes de escribir o modificar código (Astro, Next.js, Edge Functions, React Islands o DB), el agente DEBE:

1. **Analizar el "Efecto Dominó"**: Prohibido escribir o modificar líneas aisladas sin entender el todo.
2. **Contexto Paralelo Obligatorio**: Usar masivamente `view_file` y `grep_search` para rastrear dependencias cruzadas, RLS policies entre pacientes/doctores, y la propagación de tipos compartidos (`@autamedica/types`).
3. **Auditoría Mental Médica**: Simular cómo el código reaccionaría: a) si el API falla, b) si un rol no autorizado intenta verlo, c) si hay datos nulos de historias clínicas.
4. Garantizar 0 deuda técnica y compatibilidad nativa con la arquitectura Turborepo antes de modificar cualquier archivo.

#### 1. PROHIBIDO SER PEREZOSO (Zero Laziness)

- **Lectura Profunda:** No leas solo el archivo que vas a editar. Lee sus importaciones, tipos, y los archivos que lo invocan.
- **Investigación Recursiva:** Si ves una llamada a una Edge Function, DEBES leer su código. No asumir qué hace.
- **Sin Excusas:** Nunca digas "asumo que la DB está bien". Verifica.

#### 2. INTEGRACIÓN OBLIGATORIA (End-to-End)

- Código huérfano = Basura.
- Cada cambio debe estar conectado de punta a punta:
  - ¿La isla React llama al hook correcto?
  - ¿El hook llama al endpoint Astro o Supabase correcto?
  - ¿La Edge Function tiene permisos RLS en la DB?
  - ¿La DB tiene la columna creada con tipos correctos?

#### 3. ANTI-PROCRASTINACIÓN (Do It Now)

- **Cero TODOs:** Prohibido dejar `// TODO: Implementar después`.
- Si falta una tabla, crear la migración AHORA.
- Si falta un tipo, generarlo AHORA.

#### 4. DEFINITION OF DONE (DoD)

Una tarea solo se considera terminada cuando:

1. El código está escrito y sigue los patrones.
2. La DB está migrada (si aplica) y sincronizada.
3. Los tipos TypeScript coinciden con la DB.
4. `pnpm --filter @autamedica/web check` pasa con 0 errors.
5. `pnpm lint` pasa con 0 errors/warnings.
6. Se verificó que no rompe dependencias.

#### 5. ARSENAL DE HERRAMIENTAS (ÚSALAS)

- **GitHub CLI (`gh`):** No adivines si el CI pasó. Ejecuta `gh run list`.
- **Patchright Streaming (Navegador Real):** Valida flujos críticos (login, selección de rol, consulta médica).
- **Bash + psql:** Verifica que las migraciones impactaron la DB real.

---

## 14. Protocolo Anti-Regresiones

### Reglas Inquebrantables

1. **UN DOMINIO A LA VEZ:** No tocar `auth/` mientras se arregla `telemedicina/`.
2. **COMMITS COMO CHECKPOINTS:**
   ```bash
   git add <archivos-específicos>
   git commit -m "fix: descripción concisa"
   ```
3. **LOOP DE VERIFICACIÓN:**
   ```
   Leer código → Escribir cambio mínimo → astro check → lint → Verificar visual → Commit → Repetir
   ```
4. **Invertir 60% del tiempo en VERIFICAR, no en generar código.**

### Señales de Alerta (PARAR y Preguntar)

- Mismo archivo modificado 3+ veces en una sesión
- `pnpm --filter @autamedica/web check` sigue fallando después de 2 intentos
- Cambio "simple" que toca más de 3 archivos
- Necesidad de "arreglar el arreglo"

### Protocolo de Escape

1. **STOP** — No seguir iterando
2. **STASH** — `git stash` para guardar cambios
3. **RESET** — Volver al último commit estable
4. **REPLANTEAR** — Bajar el nivel de abstracción del pedido

---

## 15. Estructura de Base de Datos

### Schemas

- **public**: Tablas principales de negocio médico
- **auth**: Gestión de usuarios (Supabase Auth)
- **storage**: Documentos médicos y evidencia

### Tablas Principales (AutaMedica)

| Tabla              | Propósito                                              |
| ------------------ | ------------------------------------------------------ |
| `profiles`         | Perfiles de usuario extendidos                         |
| `doctor_profiles`  | Datos específicos de médicos (matrícula, especialidad) |
| `company_profiles` | Datos de empresas clientes                             |
| `appointments`     | Consultas médicas y estados                            |
| `medical_records`  | Historia clínica (acceso restringido)                  |
| `prescriptions`    | Recetas digitales                                      |
| `reviews`          | Calificaciones de consultas                            |

### Convenciones de Migraciones

```sql
-- Naming: {timestamp}_{description}.sql
-- Ejemplo: 20260218050700_add_appointment_notes.sql

-- Siempre usar IF NOT EXISTS
CREATE TABLE IF NOT EXISTS public.appointments (...);

-- Siempre definir RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Políticas descriptivas
CREATE POLICY "Patients can view own appointments"
  ON public.appointments FOR SELECT
  USING (auth.uid() = patient_id);
```

---

## 16. Dominios de Servicio

Los packages `@autamedica/*` organizan la lógica por dominio:

| Dominio          | Package                    | Responsabilidad                            |
| ---------------- | -------------------------- | ------------------------------------------ |
| **auth**         | `@autamedica/auth`         | Autenticación, sesión, Supabase SSR        |
| **types**        | `@autamedica/types`        | 190+ tipos TypeScript de dominio médico    |
| **hooks**        | `@autamedica/hooks`        | React hooks para consultas y datos médicos |
| **shared**       | `@autamedica/shared`       | Utils, logger, env validation              |
| **ui**           | `@autamedica/ui`           | Componentes de UI compartidos              |
| **telemedicine** | `@autamedica/telemedicine` | WebRTC engine para video consultas         |

---

## 17. Deploy & CI/CD

### Orden Obligatorio de Deploy

```
1. pnpm build:packages:core
   ↓
2. supabase db push (si hay migraciones)
   ↓
3. supabase functions deploy (si hay Edge Functions)
   ↓
4. pnpm --filter @autamedica/web build
   ↓
5. wrangler pages deploy dist --project-name autamedica-web
```

**Razón:** El frontend puede depender de nuevas tablas/RPCs. Si se hace build primero, habrá errores hasta que el backend esté listo.

### Cloudflare Pages (por app)

| App            | Project Name           | Dominio                                 |
| -------------- | ---------------------- | --------------------------------------- |
| apps/web       | `autamedica-web`       | `autamedica.com` (objetivo)             |
| apps/web-app   | `autamedica-web-app`   | `autamedica-web-app.pages.dev` (legacy) |
| apps/doctors   | `autamedica-doctors`   | `autamedica-doctors.pages.dev`          |
| apps/patients  | `autamedica-patients`  | `autamedica-patients.pages.dev`         |
| apps/companies | `autamedica-companies` | `autamedica-companies.pages.dev`        |
| apps/admin     | `autamedica-admin`     | `autamedica-admin.pages.dev`            |

---

## 18. Referencias

- **Guía principal de agente:** `AGENTS.md`
- **Hardening avanzado:** `AGENTS-2.md`
- **Manual operativo:** `CLAUDE.md`
- **Tipos de proyecto:** `packages/types/src/`
- **Schema DB:** `packages/types/src/database.types.ts` (generado — no editar a mano)
- **Regenerar tipos:** `pnpm db:sync`
- **Migración Astro activa:** `apps/web/`

---

## 19. Reglas Importadas Desde AutoRenta (Framework-Agnostic)

Estas reglas se adoptan en AutaMedica independientemente del framework:

1. **AI Cross-Review:** todo cambio generado por IA requiere segunda auditoría antes de merge.
2. **Higiene reforzada:** si se tocan docs/reportes, correr `pnpm docs:ttl:check`; si hay rename/copy sospechoso (`C100`), validar historial con `git log --follow --name-status`.
3. **DB types con protocolo seguro:** generar a `/tmp`, revisar diff, validar enums críticos y luego reemplazar archivo canónico.
4. **Workflows resilientes:** usar `precheck + skip explícito` y evitar `continue-on-error` en pasos críticos.
5. **Post-Implementation Review (UI):** capturas before/after + validación en 375/768/1024/1440.
6. **Operaciones largas en `tmux`:** migraciones/builds/tests largos deben ejecutarse con sesiones persistentes.
7. **Regla SQL `atomic`:** no usar `atomic` en identificadores para evitar fallas del parser de Supabase CLI.
8. **Frozen Code policy:** paths críticos read-only por defecto; solo modificar con pedido explícito.

Ver detalle operativo en `AGENTS-2.md` sección 23.

---

## Nota Operativa

Si hay conflicto entre este documento y otros, prevalece:

1. `AGENTS.md` (reglas inmediatas de operación)
2. `AGENTS-2.md` (hardening técnico detallado)
3. `CLAUDE.md` (filosofía y contexto compacto)
4. Este `GEMINI.md` (contexto extendido y flujos)

---

## 20. Android Studio Playbook (Productivity & Performance 2025)

> **Mandato para agentes y desarrolladores operando en entornos nativos/Android Studio.**

### 1. Hardening de Rendimiento (Linux/Ubuntu)

- **Memoria RAM (VM Options):** Android Studio debe ejecutar con un mínimo de 4GB (`-Xmx4096m`) en `studio64.vmoptions`. NUNCA usar la configuración por defecto de 1.2GB.
- **Gradle Optimizado:** El archivo `~/.gradle/gradle.properties` DEBE incluir:
  ```properties
  org.gradle.daemon=true
  org.gradle.parallel=true
  org.gradle.caching=true
  org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8
  ```

### 2. Ecosistema de Plugins Requerido

No se permite programar "a ciegas". La suite mínima de productividad es:

- **Key Promoter X:** Entrenamiento obligatorio de atajos (Prohibido usar el mouse para acciones que tienen shortcut).
- **JSON To Kotlin Class:** Para parsear respuestas de APIs sin errores tipográficos.
- **CodeGlance Pro:** Minimapa lateral (estilo VS Code) para navegar archivos extensos de Compose o XML.
- **ADB Idea:** Para limpiar caché y desinstalar apps rápidamente.

### 3. Ajustes de Flujo de Trabajo (Settings)

- **Auto-Import:** Activar "Add unambiguous imports on the fly" y "Optimize imports on the fly" para no lidiar con `Alt + Enter` en cada clase.
- **Inlay Hints (Kotlin):** Obligatorio activar visualización de tipos de variables y retornos de lambdas para legibilidad.
- **Wireless Debugging:** En 2025 es mandatorio usar la conexión WiFi nativa del IDE ("Pair Devices Using Wi-Fi") sobre la conexión por cable para testeo en dispositivos físicos.

### 4. Integración Nativa con Gemini (Superpoderes)

Para aprovechar al máximo el ecosistema de Google dentro del IDE:

- **Asistente de Crash (Logcat):** Cuando la app explota, usar el botón "Ask Gemini" en el Logcat. Analiza el stacktrace y el código local para dar la solución exacta sin salir del IDE.
- **Generación de UI (Compose):** Usar el chat lateral para pedir componentes específicos de Material 3 ("Crea una Card con imagen circular a la izquierda...").
- **Explain This Code:** Seleccionar bloques complejos heredados, clic derecho -> "Gemini -> Explain this code" para ingeniería inversa rápida.
- **Generación de Tests:** Seleccionar lógica de negocio, clic derecho -> "Gemini -> Generate Unit Tests" para crear cobertura automática (JUnit/MockK).
- **Documentación KDoc:** Generar comentarios de funciones instantáneamente (clic derecho -> "Gemini -> Add documentation").
- _Nota:_ Asegurar que el "Context Sharing" esté activado en la ventana de chat del IDE para que Gemini lea el código local.
