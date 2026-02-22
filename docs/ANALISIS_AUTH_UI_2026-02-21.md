# Auditoría Completa: Autenticación y UI — AutaMedica

**Fecha:** 2026-02-21
**Autor:** Auditoría Senior Engineering
**Alcance:** `apps/auth`, `apps/doctors`, `apps/patients`, `packages/shared`, `packages/auth`
**Severidad General:** CRÍTICA — El login está fundamentalmente roto por 4 bugs encadenados

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Diagnóstico del Flujo de Autenticación](#2-diagnóstico-del-flujo-de-autenticación)
3. [Bugs Críticos Identificados (Root Causes)](#3-bugs-críticos-identificados)
4. [Análisis UI — Portal Médicos](#4-análisis-ui--portal-médicos)
5. [Análisis UI — Portal Pacientes](#5-análisis-ui--portal-pacientes)
6. [Propuesta de Cambios UI — Médicos](#6-propuesta-de-cambios-ui--médicos)
7. [Propuesta de Cambios UI — Pacientes](#7-propuesta-de-cambios-ui--pacientes)
8. [Plan de PRs](#8-plan-de-prs)
9. [Inventario Completo de Bugs](#9-inventario-completo-de-bugs)
10. [Archivos Afectados](#10-archivos-afectados)

---

## 1. Resumen Ejecutivo

La plataforma AutaMedica tiene un sistema de autenticación centralizado (`apps/auth`) que redirige a portales específicos por rol (`apps/doctors`, `apps/patients`, etc.). **El login está completamente roto** debido a 4 bugs encadenados en el flujo de redirección y verificación de sesión.

Los 4 bugs forman una cadena causal:

```
Bug #1: getSession() busca cookies con nombre incorrecto → no encuentra sesión
    ↓
Bug #2: buildSafeLoginUrl() redirige al web-app, NO al auth hub → 404
    ↓
Bug #3: isCorrectPortal() compara URL origin con role string → siempre falla
    ↓
Bug #4: getPortalForRole() retorna nombre, no URL → redirect crashea
```

**Resultado:** Ningún médico ni paciente puede completar el login. Se genera un loop infinito de redirecciones o un crash en el middleware.

---

## 2. Diagnóstico del Flujo de Autenticación

### Flujo Esperado (diseño)

```
Usuario → auth.autamedica.com/auth/select-role
    → Selecciona rol (doctor/patient)
    → /auth/login?role=doctor
    → Login (email/password o Google OAuth)
    → Supabase devuelve code
    → /auth/callback?code=xxx
    → Intercambia code por session
    → Redirige a doctors.autamedica.com/auth/callback?access_token=xxx&refresh_token=xxx
    → Doctors callback establece sesión con cookies
    → Middleware verifica JWT → acceso concedido
```

### Flujo Real (lo que ocurre)

```
Usuario → doctors.autamedica.com
    → Middleware ejecuta getSession(request)
    → Busca cookie "sb-access-token" → NO EXISTE (Supabase usa otro nombre)
    → Busca cookie "sb-knywotiidsydsaveqkjs-auth-token" → NO EXISTE (está chunked como .0, .1)
    → getSession() retorna null
    → buildSafeLoginUrl('doctors', request.url, 'session_expired')
    → Redirige a ${NEXT_PUBLIC_BASE_URL_WEB_APP}/auth/login → DESTINO INCORRECTO
    → Debería ir a auth.autamedica.com/auth/login pero va a web-app
    → 404 o página sin formulario de login
    → USUARIO ATRAPADO
```

### Escenario alternativo (si el usuario llega al auth hub manualmente)

```
Usuario → auth.autamedica.com/auth/login?role=doctor
    → Login exitoso → /auth/callback?code=xxx
    → Callback intercambia code, determina role
    → Redirige a doctors.autamedica.com/auth/callback?access_token=xxx&refresh_token=xxx
    → Doctors callback: supabase.auth.setSession({access_token, refresh_token})
    → Cookies establecidas (chunked por Supabase SSR)
    → Redirige a / (dashboard)
    → Middleware ejecuta getSession(request) de nuevo
    → Busca "sb-access-token" → NO (Supabase SSR pone "sb-knywotiidsydsaveqkjs-auth-token.0")
    → getSession() retorna null OTRA VEZ
    → LOOP INFINITO de redirecciones
```

---

## 3. Bugs Críticos Identificados

### BUG #1 (CRÍTICO): Cookie Name Mismatch en `getSession()`

**Archivo:** `packages/shared/src/auth/session.ts:31-34`

```typescript
const token =
  req.cookies.get('sb-access-token')?.value ||                           // ← NUNCA existe
  (legacyCookieName ? req.cookies.get(legacyCookieName)?.value : null) || // ← NO maneja chunks
  req.cookies.get('sb-auth-token')?.value;                               // ← NUNCA existe
```

**Problema:** Supabase SSR (`@supabase/ssr`) almacena tokens en cookies chunked:
- `sb-knywotiidsydsaveqkjs-auth-token.0` (primer chunk)
- `sb-knywotiidsydsaveqkjs-auth-token.1` (segundo chunk, si el token es grande)

El middleware busca `sb-access-token` (no es estándar de Supabase) y `sb-knywotiidsydsaveqkjs-auth-token` (sin el sufijo `.0`). **Nunca encuentra el token.**

**Fix requerido:** Usar `@supabase/ssr` `createServerClient` en el middleware, o implementar reassembly de cookies chunked:

```typescript
// Reassemblar chunks
const chunks: string[] = [];
let i = 0;
while (req.cookies.get(`${legacyCookieName}.${i}`)?.value) {
  chunks.push(req.cookies.get(`${legacyCookieName}.${i}`)!.value);
  i++;
}
const token = chunks.length > 0 ? chunks.join('') : req.cookies.get(legacyCookieName)?.value;
```

---

### BUG #2 (CRÍTICO): `buildSafeLoginUrl()` Apunta al Destino Incorrecto

**Archivo:** `packages/shared/src/security/redirects.ts:87`

```typescript
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL_WEB_APP || 'http://localhost:3000';
```

**Problema:** Cuando el middleware necesita redirigir al login, usa `NEXT_PUBLIC_BASE_URL_WEB_APP` que apunta a la **web-app legacy** (Next.js), NO al **auth hub** (`auth.autamedica.com`).

- **Producción:** Redirige a `autamedica-web-app.pages.dev/auth/login` → NO tiene formulario de login
- **Development:** Redirige a `localhost:3000/auth/login` → El auth hub corre en `localhost:3005`

**Fix requerido:**

```typescript
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL_AUTH || 'http://localhost:3005';
```

---

### BUG #3 (CRÍTICO): `isCorrectPortal()` Siempre Retorna `false`

**Archivo:** `packages/shared/src/env/portals.ts:37-39`

```typescript
export function isCorrectPortal(currentPortal: string, requiredPortal: string): boolean {
  return currentPortal === requiredPortal;
}
```

**Llamado desde:** `apps/doctors/middleware.ts:50`

```typescript
if (!isCorrectPortal(origin, session.user.role)) {
```

**Problema:** Compara `origin` (ej: `"https://doctors.autamedica.com"`) con `session.user.role` (ej: `"doctor"`). **Nunca son iguales.**

```
isCorrectPortal("https://doctors.autamedica.com", "doctor") → false SIEMPRE
```

Esto significa que **TODO usuario autenticado con rol válido** es redirigido. El `if` siempre se ejecuta.

**Fix requerido:** Comparar portal names, no URL vs role:

```typescript
const currentPortal = getPortalNameFromOrigin(origin); // "doctors"
const expectedPortal = getPortalForRole(session.user.role); // "doctors"
if (currentPortal !== expectedPortal) { ... }
```

---

### BUG #4 (CRÍTICO): Redirect Construido con Portal Name, No URL

**Archivo:** `apps/doctors/middleware.ts:51-52`

```typescript
const correctPortal = getPortalForRole(session.user.role);
return NextResponse.redirect(new URL(pathname, correctPortal));
```

**Problema:** `getPortalForRole('doctor')` retorna `"doctors"` (un nombre de portal). Pero `new URL(pathname, "doctors")` requiere una URL base válida. `"doctors"` no es una URL → **crash o URL malformada**.

**Fix requerido:**

```typescript
const correctPortalUrl = getPortalUrlWithPath(getPortalForRole(session.user.role), pathname);
return NextResponse.redirect(correctPortalUrl);
```

---

### BUG #5 (MODERADO): Inconsistencia en `PORTAL_TO_ROLE` Mapping

Existen **3 mappings diferentes** en el codebase:

| Portal | `role-routing.ts` | `env/portals.ts` | `roles.ts` |
|--------|-------------------|-------------------|------------|
| admin | `organization_admin` | `platform_admin` | — |
| companies | `company_admin` | `company_admin` | — |

**Impacto:** Si un `organization_admin` hace login, dependiendo de qué función se use, puede terminar en el portal equivocado.

---

### BUG #6 (SEGURIDAD): Dev Bypass Basado en NODE_ENV

**Archivos:**
- `apps/doctors/src/contexts/AuthContext.tsx:34,47,104`
- `packages/auth/src/hooks/useAuth.tsx:99`

```typescript
if (process.env.NODE_ENV !== 'development') {
  window.location.href = getLoginUrl();
}
```

**Problema:** En development, los redirects de autenticación se desactivan completamente. Si `NODE_ENV=development` se filtra a producción (Cloudflare build mal configurado), **cualquier usuario accede sin login**.

---

## 4. Análisis UI — Portal Médicos

### Estructura Actual

```
apps/doctors/src/
├── app/
│   ├── page.tsx                    ← Dashboard principal (869 líneas, MONOLITO)
│   ├── layout.tsx                  ← Root layout con AuthProvider
│   ├── appointments/page.tsx       ← Vista de citas
│   ├── consultation/[id]/page.tsx  ← Pre-call setup
│   ├── call/[roomId]/page.tsx      ← Video call activa
│   ├── error.tsx                   ← Error boundary
│   └── not-found.tsx               ← 404
├── components/
│   ├── layout/
│   │   └── DoctorsPortalShell.tsx  ← Shell principal (614 líneas, MONOLITO)
│   ├── appointments/
│   │   ├── AppointmentsPanel.tsx   ← Panel de citas (224 líneas)
│   │   └── AppointmentsView.tsx
│   ├── patients/
│   │   └── PatientsPanel.tsx       ← Panel de pacientes (139 líneas)
│   ├── settings/
│   │   └── SettingsPanel.tsx       ← Panel settings (369 líneas, MOCK DATA)
│   └── medical/
│       ├── QuickNotesModal.tsx     ← Notas SOAP (209 líneas)
│       └── PrescriptionModal.tsx   ← Prescripciones
└── contexts/
    └── AuthContext.tsx             ← Contexto de autenticación
```

### Problemas UI Identificados

| # | Problema | Severidad | Archivo | Líneas |
|---|---------|-----------|---------|--------|
| D1 | `page.tsx` es un monolito de 869 líneas con video, AI, focus mode, quick actions mezclados | Alta | `app/page.tsx` | 1-869 |
| D2 | `DoctorsPortalShell.tsx` es otro monolito de 614 líneas — sidebar, tabs, footer, routing todo junto | Alta | `components/layout/DoctorsPortalShell.tsx` | 1-614 |
| D3 | Settings usa datos mock hardcoded — no persiste a Supabase | Alta | `components/settings/SettingsPanel.tsx` | Todo |
| D4 | Appointments y Patients usan datos mock — no hay integración real con DB | Alta | `components/appointments/`, `components/patients/` | Todo |
| D5 | No hay feedback visual claro cuando la sesión expira — redirect silencioso | Media | `middleware.ts` | 37-39 |
| D6 | Tab navigation hardcoded en shell — no extensible para nuevos tabs | Media | `DoctorsPortalShell.tsx` | ~100-150 |
| D7 | Video controls (mic, cam, screen share) no verifican permisos del browser | Media | `app/page.tsx` | ~200-400 |
| D8 | El diseño VSCode-style (traffic lights, tabs) puede confundir a médicos no-tech | Baja | `DoctorsPortalShell.tsx` | ~50-80 |
| D9 | Footer muestra "API Status" que es info técnica innecesaria para médicos | Baja | `DoctorsPortalShell.tsx` | ~580-614 |
| D10 | Consultation page (`/consultation/[id]`) tiene checklist mock de "HIPAA compliance" | Baja | `app/consultation/[id]/page.tsx` | ~120-140 |

---

## 5. Análisis UI — Portal Pacientes

### Estructura Actual

```
apps/patients/src/
├── app/
│   ├── layout.tsx                           ← Root layout con SessionSync
│   ├── (dashboard)/
│   │   ├── layout.tsx                       ← Dashboard layout con sidebar
│   │   ├── page.tsx                         ← Home con VideoCall (inusual)
│   │   ├── anamnesis/page.tsx               ← Formulario médico (complejo)
│   │   ├── appointments/page.tsx            ← Citas
│   │   ├── medical-history/page.tsx         ← Historial
│   │   ├── preventive-health/page.tsx       ← Salud preventiva
│   │   ├── pregnancy-prevention/page.tsx    ← Salud reproductiva
│   │   └── profile/page.tsx                 ← Perfil
│   ├── onboarding/page.tsx                  ← Registro inicial
│   ├── community/page.tsx                   ← Comunidad
│   └── auth/callback/route.ts               ← OAuth callback
├── components/
│   ├── layout/
│   │   ├── DashboardLayout.tsx              ← Sidebar + navigation
│   │   ├── CompactSidebar.tsx               ← Sidebar compacta
│   │   ├── CollapsibleSidebar.tsx           ← Sidebar expandible
│   │   └── DynamicRightPanel.tsx            ← Panel contextual
│   ├── onboarding/
│   │   └── PatientOnboarding.tsx
│   ├── floating/
│   │   └── AutaFloatingButton.tsx           ← Asistente IA
│   ├── dashboard/
│   │   └── RealVideoCall.tsx                ← Componente de video
│   └── community/
│       ├── PostCard.tsx
│       └── GroupCard.tsx
└── hooks/
    ├── usePatientSession.ts
    ├── useAppointments.ts
    └── useAnamnesis.ts
```

### Problemas UI Identificados

| # | Problema | Severidad | Archivo | Descripción |
|---|---------|-----------|---------|-------------|
| P1 | Dashboard muestra VideoCall como vista principal — confuso para pacientes | Alta | `(dashboard)/page.tsx` | Pacientes esperan ver resumen de salud, no video |
| P2 | Dos implementaciones de sidebar (Compact + Collapsible) — inconsistencia | Alta | `components/layout/` | Diferentes componentes usan diferente sidebar |
| P3 | Community page usa datos hardcoded — posts y groups son mock | Alta | `community/page.tsx` | Sin integración Supabase |
| P4 | DynamicRightPanel tiene datos mock extensivos (medicamentos, signos vitales) | Alta | `DynamicRightPanel.tsx` | Datos ficticios que confunden al paciente |
| P5 | Onboarding no valida datos médicos (tipo sangre, altura, peso) | Media | `onboarding/page.tsx` | Puede guardar datos inválidos |
| P6 | Anamnesis: si el usuario cierra el browser, pierde progreso parcial (solo localStorage) | Media | `anamnesis/page.tsx` | Auto-save cada 30s, pero perder cambios entre saves |
| P7 | Medical History muestra empty state genérico — no guía al usuario | Media | `medical-history/page.tsx` | Debería decir "Complete su anamnesis" |
| P8 | Preventive Health depende de perfil completo pero el warning es sutil (amber box) | Media | `preventive-health/page.tsx` | Debería bloquear el acceso hasta completar perfil |
| P9 | Navigation tiene badges "NUEVO", "BETA", "HOT" que nunca se actualizan | Baja | Sidebars | Badges estáticos hardcoded |
| P10 | Floating AI button (Auta) siempre visible pero el chat es placeholder | Baja | `AutaFloatingButton.tsx` | Modal abre pero no hay chatbot real |

---

## 6. Propuesta de Cambios UI — Médicos

### PR-D1: Descomponer Dashboard Monolito

**Prioridad:** Alta | **Estimación:** ~15 archivos nuevos/modificados

**Estado actual:** `app/page.tsx` (869 líneas) contiene video, AI analysis, focus mode, controls, quick actions.

**Propuesta:** Extraer en componentes atómicos:

```
app/page.tsx (reduce a ~80 líneas, orquestador)
├── components/video/
│   ├── VideoCallArea.tsx          ← Contenedor de video + overlay
│   ├── VideoControls.tsx          ← Mic, cam, screen share, end call
│   ├── VideoQualityBadge.tsx      ← Indicador HD/Connecting
│   └── PatientInfoBadge.tsx       ← Badge con nombre + edad + duración
├── components/quick-actions/
│   ├── QuickActionsPanel.tsx      ← Panel colapsable derecho
│   └── QuickActionButton.tsx      ← Botón individual con icono
├── components/ai/
│   └── AIAnalysisModal.tsx        ← Modal de análisis IA con Gemini
└── components/focus/
    └── FocusModeOverlay.tsx       ← Lógica de auto-hide y overlay
```

**Beneficio:** Cada componente es testeable independientemente. El page.tsx se convierte en un orquestador limpio.

---

### PR-D2: Descomponer Portal Shell

**Prioridad:** Alta | **Estimación:** ~10 archivos

**Estado actual:** `DoctorsPortalShell.tsx` (614 líneas) — sidebar, tabs, footer, routing.

**Propuesta:**

```
components/layout/
├── DoctorsPortalShell.tsx    ← Reduce a ~100 líneas, grid container
├── HeaderBar.tsx             ← Traffic lights + nombre + status + reloj
├── TabNavigation.tsx         ← Tabs configurables vía array
├── SidebarNavigation.tsx     ← Sidebar con items dinámicos
├── SidebarItem.tsx           ← Item individual con badge support
├── DoctorProfileCard.tsx     ← Card de perfil del doctor en sidebar
└── StatusFooter.tsx          ← Footer con connection/API status
```

**Cambio adicional:** Reemplazar traffic lights (VSCode-style) por un header más médico-profesional:

```
Antes: [🔴 🟡 🟢] AutaMedica Doctor Portal  |  Dr. García  |  ● Conectado  |  14:32
Después: [Logo] AutaMedica  |  Dr. García - Cardiología  |  🟢 En línea  |  3 pacientes hoy
```

---

### PR-D3: Integrar Settings con Supabase

**Prioridad:** Alta | **Estimación:** ~5 archivos

**Estado actual:** Todo mock — nada se guarda.

**Propuesta:**
- Guardar configuración en `user_metadata` de Supabase Auth
- Crear tabla `doctor_settings` para preferencias específicas
- Hook `useDoctorSettings()` para CRUD
- Loading states y error handling

---

### PR-D4: Mejorar Experiencia de Sesión Expirada

**Prioridad:** Media | **Estimación:** ~3 archivos

**Propuesta:**
- Crear página `/session-expired` con mensaje claro
- Toast notification 5 minutos antes de expiración
- Auto-refresh de token (ya existe la lógica, pero no funciona por Bug #1)

---

### PR-D5: Footer Profesional

**Prioridad:** Baja | **Estimación:** ~2 archivos

**Propuesta:** Remover "API Status" del footer. Reemplazar con:

```
Antes: AutaMedica | 🟢 Conectado | 0 consultas activas | API: ✓ Online | 14:32
Después: AutaMedica v2.0 | 🟢 Sistema operativo | Última sincronización: hace 2 min
```

---

## 7. Propuesta de Cambios UI — Pacientes

### PR-P1: Dashboard Centrado en Salud, No en Video

**Prioridad:** Alta | **Estimación:** ~8 archivos

**Estado actual:** El dashboard muestra `RealVideoCall` como componente principal. Un paciente que acaba de registrarse ve una interfaz de videollamada sin contexto.

**Propuesta:** Rediseñar el dashboard:

```
Dashboard Home (nueva estructura)
├── WelcomeHeader.tsx           ← "Hola {nombre}, tu salud está al día"
├── HealthSummaryCards.tsx      ← Grid 3 cols: próxima cita, medicamentos, alertas
├── NextAppointmentCard.tsx     ← Card destacada si tiene cita próxima
│   └── "Iniciar videollamada" button (SOLO cuando hay cita activa)
├── QuickActionsGrid.tsx        ← "Agendar cita", "Ver historial", "Completar anamnesis"
├── RecentActivityFeed.tsx      ← Últimas actividades médicas
└── HealthTipsCard.tsx          ← Tip de salud personalizado
```

**La videollamada se accede desde:**
1. Card de "Próxima Cita" → botón "Iniciar videollamada"
2. Página de citas → botón por cita
3. Link directo `/call/[roomId]`

---

### PR-P2: Unificar Sidebars

**Prioridad:** Alta | **Estimación:** ~5 archivos

**Estado actual:** `CompactSidebar.tsx` y `CollapsibleSidebar.tsx` coexisten con items diferentes.

**Propuesta:**
- Eliminar `CompactSidebar.tsx`
- Usar `CollapsibleSidebar.tsx` como único sidebar
- Unificar items de navegación en un array configuración
- Remover badges hardcoded ("NUEVO", "BETA") — usar feature flags o fechas

---

### PR-P3: Mejorar Empty States

**Prioridad:** Media | **Estimación:** ~6 archivos

**Propuesta por página:**

| Página | Empty State Actual | Propuesta |
|--------|-------------------|-----------|
| Medical History | Icono + "No tienes registros" | "Tu historial se llenará con tus consultas. Agenda tu primera cita." + CTA |
| Appointments | Icono + "No tienes citas" | "Agenda tu primera consulta con un profesional de salud." + CTA |
| Preventive Health | Warning amber | Bloqueo con stepper: "1. Completa tu perfil → 2. Accede a tu plan preventivo" |
| Community | Hardcoded data | Loading skeleton → Empty: "Sé el primero en compartir tu experiencia" |

---

### PR-P4: Validación Robusta en Onboarding y Perfil

**Prioridad:** Media | **Estimación:** ~4 archivos

**Propuesta:**
- Zod schema para validar datos médicos:
  - Tipo de sangre: solo valores válidos (A+, A-, B+, B-, AB+, AB-, O+, O-)
  - Altura: 50-250 cm
  - Peso: 2-300 kg
  - Fecha de nacimiento: no futura, no > 120 años
  - Teléfono: formato internacional
- Feedback inline por campo (no solo toast al submit)

---

### PR-P5: Anamnesis — Save & Resume Mejorado

**Prioridad:** Media | **Estimación:** ~3 archivos

**Propuesta:**
- Indicador visual de pasos completados vs pendientes (stepper con checkmarks)
- Botón "Guardar y continuar después" prominente en cada paso
- Al volver, mostrar modal: "Tienes progreso guardado. ¿Continuar desde el paso 7/12?"
- Sync a Supabase inmediato en cada cambio de paso (no solo cada 30s)

---

### PR-P6: Remover Floating AI Button Placeholder

**Prioridad:** Baja | **Estimación:** ~2 archivos

**Propuesta:** El botón `AutaFloatingButton` abre un modal vacío. Opciones:
1. Remover hasta que el chatbot esté implementado
2. Reemplazar con botón de "Ayuda" que abre FAQ/docs

---

## 8. Plan de PRs

### Orden de Ejecución (bloqueantes primero)

```
PR #1: fix(shared): Corregir 4 bugs críticos de autenticación [BLOQUEANTE]
  ├── Fix cookie name mismatch en getSession()
  ├── Fix buildSafeLoginUrl() → apuntar a auth hub
  ├── Fix isCorrectPortal() → comparar portal names
  ├── Fix redirect URL construction en doctors middleware
  └── Tests unitarios para cada fix

PR #2: fix(shared): Unificar PORTAL_TO_ROLE mappings
  ├── Single source of truth para role↔portal
  ├── Eliminar duplicaciones en role-routing.ts, env/portals.ts, roles.ts
  └── Tests de consistencia

PR #3: fix(auth): Remover dev bypass basado en NODE_ENV
  ├── Reemplazar con NEXT_PUBLIC_AUTH_DEV_BYPASS explícito
  ├── Validar que no se use en producción
  └── Audit de todos los process.env.NODE_ENV checks

--- (Auth funcional a partir de aquí) ---

PR #4: refactor(doctors): Descomponer page.tsx monolito [PR-D1]
PR #5: refactor(doctors): Descomponer DoctorsPortalShell [PR-D2]
PR #6: feat(doctors): Integrar Settings con Supabase [PR-D3]
PR #7: feat(doctors): UX de sesión expirada [PR-D4]

PR #8: refactor(patients): Dashboard centrado en salud [PR-P1]
PR #9: refactor(patients): Unificar sidebars [PR-P2]
PR #10: feat(patients): Mejorar empty states [PR-P3]
PR #11: feat(patients): Validación médica robusta [PR-P4]
PR #12: feat(patients): Anamnesis save & resume [PR-P5]
```

### Dependencias

```
PR #1 ──→ Todos los demás (auth debe funcionar primero)
PR #2 ──→ PR #3
PR #4 ──→ PR #5 (descomponer page antes que shell)
PR #8 ──→ PR #9, PR #10
```

---

## 9. Inventario Completo de Bugs

### Severidad Crítica (Bloquean login)

| ID | Archivo | Línea | Descripción |
|----|---------|-------|-------------|
| C1 | `packages/shared/src/auth/session.ts` | 31-34 | Cookie name mismatch: busca `sb-access-token`, Supabase usa `sb-{ref}-auth-token.0` |
| C2 | `packages/shared/src/security/redirects.ts` | 87 | `buildSafeLoginUrl` usa `NEXT_PUBLIC_BASE_URL_WEB_APP` en vez de auth hub |
| C3 | `packages/shared/src/env/portals.ts` | 37-39 | `isCorrectPortal` compara URL origin con role string — siempre false |
| C4 | `apps/doctors/middleware.ts` | 51-52 | `new URL(pathname, getPortalForRole(...))` — portal name no es URL válida |

### Severidad Alta (Funcionalidad rota)

| ID | Archivo | Línea | Descripción |
|----|---------|-------|-------------|
| H1 | `packages/shared/src/role-routing.ts` | 140-144 | `PORTAL_TO_ROLE` inconsistente con `env/portals.ts` (admin→organization_admin vs platform_admin) |
| H2 | `apps/auth/src/app/auth/select-role/actions.ts` | 44 | RPC `set_user_role` vs `set_portal_and_role` en profile-manager.ts — mismatch |
| H3 | `apps/patients/middleware.ts` | 35 | `request as any` type cast — React version mismatch en monorepo |
| H4 | `apps/doctors/src/components/settings/SettingsPanel.tsx` | Todo | 100% mock data — nada se persiste |
| H5 | `apps/patients/src/app/(dashboard)/page.tsx` | Todo | Dashboard muestra VideoCall como vista principal |

### Severidad Media (UX degradada)

| ID | Archivo | Línea | Descripción |
|----|---------|-------|-------------|
| M1 | `apps/doctors/src/contexts/AuthContext.tsx` | 34,47,104 | Dev bypass desactiva redirects en development |
| M2 | `packages/auth/src/hooks/useAuth.tsx` | 252-254 | `setTimeout(redirect, 100)` — race condition |
| M3 | `apps/patients/src/app/(dashboard)/anamnesis/page.tsx` | — | Auto-save solo cada 30s a Supabase |
| M4 | `packages/shared/src/security/redirects.ts` | 52-54 | Wildcard regex `.*` demasiado permisivo |
| M5 | `apps/doctors/src/app/page.tsx` | 869 | Monolito de 869 líneas — imposible de mantener |
| M6 | `apps/patients/src/components/layout/` | — | Dos sidebars con items diferentes |

### Severidad Baja (Code quality)

| ID | Archivo | Línea | Descripción |
|----|---------|-------|-------------|
| L1 | `apps/auth/src/lib/profile-manager.ts` | 149 | `(this.client.rpc as any)` — type safety perdida |
| L2 | `apps/auth/src/lib/auth-service.ts` | 69 | Error message hardcoded en español — sin i18n |
| L3 | `packages/shared/src/role-routing.ts` | 91-103 | `getCookieDomain()` silencia errores con fallback |
| L4 | `apps/doctors/src/components/layout/DoctorsPortalShell.tsx` | ~580 | Footer muestra "API Status" — innecesario para médicos |

---

## 10. Archivos Afectados

### Archivos que Requieren Fix Inmediato (PR #1)

```
packages/shared/src/auth/session.ts           ← Fix cookie names + chunk reassembly
packages/shared/src/security/redirects.ts      ← Fix buildSafeLoginUrl base URL
packages/shared/src/env/portals.ts             ← Fix isCorrectPortal logic
apps/doctors/middleware.ts                      ← Fix redirect URL construction
```

### Archivos de UI Doctors (PRs #4-#7)

```
apps/doctors/src/app/page.tsx                                    ← Descomponer
apps/doctors/src/components/layout/DoctorsPortalShell.tsx         ← Descomponer
apps/doctors/src/components/settings/SettingsPanel.tsx            ← Integrar Supabase
apps/doctors/src/components/appointments/AppointmentsPanel.tsx   ← Datos reales
apps/doctors/src/components/patients/PatientsPanel.tsx           ← Datos reales
```

### Archivos de UI Patients (PRs #8-#12)

```
apps/patients/src/app/(dashboard)/page.tsx                       ← Rediseñar dashboard
apps/patients/src/components/layout/CompactSidebar.tsx           ← Eliminar
apps/patients/src/components/layout/CollapsibleSidebar.tsx       ← Unificar
apps/patients/src/components/layout/DynamicRightPanel.tsx        ← Datos reales
apps/patients/src/app/(dashboard)/medical-history/page.tsx       ← Empty states
apps/patients/src/app/(dashboard)/appointments/page.tsx          ← Empty states
apps/patients/src/app/onboarding/page.tsx                        ← Validación Zod
apps/patients/src/app/(dashboard)/profile/page.tsx               ← Validación Zod
apps/patients/src/app/(dashboard)/anamnesis/page.tsx             ← Save & resume
```

### Archivos de Packages Compartidos (PRs #1-#3)

```
packages/shared/src/auth/session.ts
packages/shared/src/security/redirects.ts
packages/shared/src/env/portals.ts
packages/shared/src/role-routing.ts
packages/shared/src/roles.ts
packages/shared/src/index.ts
packages/auth/src/hooks/useAuth.tsx
```

---

## Conclusión

El sistema de autenticación de AutaMedica tiene una arquitectura sólida en diseño (auth hub centralizado, JWT verification, role-based portals), pero está **fundamentalmente roto en implementación** por 4 bugs encadenados en el flujo de cookies y redirección.

**Acción inmediata requerida:** PR #1 (fix de los 4 bugs críticos) es bloqueante para toda la plataforma. Sin este fix, ningún usuario puede completar el flujo de login exitosamente.

Una vez que el auth funcione, las mejoras de UI propuestas (PRs #4-#12) mejorarán significativamente la experiencia tanto de médicos como de pacientes, con foco en:
- Descomposición de monolitos para mantenibilidad
- Dashboard centrado en salud para pacientes (no en video)
- Datos reales en lugar de mocks hardcoded
- Validación robusta de datos médicos
- Empty states que guían al usuario
