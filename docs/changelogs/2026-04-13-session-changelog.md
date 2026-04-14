# Changelog — Session 2026-04-13/14

Resumen detallado de todos los cambios implementados y mergeados durante la sesion de trabajo del 13-14 de abril de 2026.

---

## PR #270 — `feat(calls): guest video call links for external patients`

**Merge:** 2026-04-14 00:35 UTC | **Commit:** `75d9312a5` | **15 archivos** | +663 -4

### Problema

Los doctores no podian invitar a pacientes que no estan registrados en AutaMedica a una videollamada. El sistema de calls requeria sesion de Supabase Auth para ambos participantes (3 capas: middleware, API bootstrap, RLS en DB).

### Solucion

Guest token firmado con HMAC-SHA256 via Web Crypto API (edge-compatible, zero deps). El token es self-contained (no requiere tabla nueva en DB) y expira en 2 horas.

### Flujo

1. Doctor en waiting room → clickea "Invitar paciente externo"
2. Ingresa nombre del paciente → genera link firmado
3. Copia link → lo envia por WhatsApp/email
4. Guest abre link en browser (sin cuenta) → GreenRoom (setup camara/mic) → entra a la videollamada

### Archivos nuevos (7)

| Archivo                                                       | Proposito                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/web/src/lib/calls/lib/guest-token.ts`                   | Modulo JWT: `signGuestToken()` / `verifyGuestToken()` con Web Crypto HMAC-SHA256  |
| `apps/web/src/pages/api/doctors/calls/[callId]/guest-link.ts` | POST API: doctor genera link. Valida ownership del call, firma token, retorna URL |
| `apps/web/src/pages/api/calls/guest/cloudflare-calls.ts`      | POST proxy: verifica guest token via query param, proxea a Cloudflare Calls SFU   |
| `apps/web/src/pages/call/join/[roomId].astro`                 | Pagina publica Astro (bypass de auth en middleware)                               |
| `apps/web/src/components/calls/GuestCallPage.tsx`             | Componente React: extrae token de URL, bootstrap, GreenRoom, UnifiedVideoCall     |
| `apps/web/src/hooks/calls/useGuestCallSession.ts`             | Hook: fetch bootstrap con `Authorization: Bearer` en vez de cookies               |
| `apps/web/src/components/doctors/calls/GuestLinkButton.tsx`   | UI: boton + modal nombre + generacion + copy to clipboard                         |

### Archivos modificados (5+3)

| Archivo                                                    | Cambio                                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web/src/middleware.ts`                               | `/call/join` agregado a `PUBLIC_ROUTES` (linea 52)                                                 |
| `apps/web/src/pages/api/calls/[roomId]/bootstrap.ts`       | Branch: si hay `Authorization: Bearer`, verifica guest token en vez de `withAuth()`                |
| `apps/web/src/lib/calls/services/call-session.backend.ts`  | Nuevo metodo `getGuestBootstrap()`: valida token vs call, retorna bootstrap con permisos limitados |
| `packages/telemedicine/src/call-session/types.ts`          | `CallSessionRole` extendido con `'guest'`                                                          |
| `packages/telemedicine/src/unified-video-call.tsx`         | `userType` prop extendido con `'guest'`                                                            |
| `packages/telemedicine/src/components/GreenRoom.tsx`       | `userType` prop extendido con `'guest'`                                                            |
| `apps/web/src/components/doctors/calls/DoctorCallPage.tsx` | Import + integracion de `GuestLinkButton` en waiting room                                          |
| `apps/web/.env.example`                                    | Documentacion de `GUEST_TOKEN_SECRET`                                                              |

### Decisiones de arquitectura

- **Guest siempre usa Cloudflare Calls (SFU)**: WebRTC P2P requiere Supabase Realtime para signaling, que necesita sesion. Guest no tiene sesion.
- **Token en query param para CF proxy**: `cloudflareCallsApiUrl: '/api/calls/guest/cloudflare-calls?token=...'` — evita modificar el HTTP client del paquete telemedicine.
- **Permisos guest**: audio + video si. Chat, recording, clinical context: no.
- **1 guest por link**: el modelo de calls es 1:1 (doctor_id + patient_id). Multi-guest queda para futuro.
- **Sin tabla nueva**: JWT self-contained. Call lifecycle (ended/canceled) invalida el token implicitamente.

### Config requerida

```bash
# Generar secret
openssl rand -hex 32

# Agregar a .env (local) y Cloudflare Pages dashboard (produccion)
GUEST_TOKEN_SECRET=<generated_value>
```

---

## PR #272 — `fix(doctors): show draft prescriptions in portal mandatos`

**Merge:** 2026-04-14 12:13 UTC | **Commit:** `3962e919a` | **2 archivos** | +16 -1

### Problema

El portal del doctor mostraba "Sin mandatos activos / La cola prioritaria esta despejada" incluso cuando habia pacientes esperando que el doctor emita sus recetas. Esto se reporto como bloqueante en produccion.

**Causa raiz:** La seccion "Mandatos" solo consultaba `dispensation_orders` con `status = 'clarification_requested'` — aclaraciones que pide la farmacia DESPUES de que una receta ya fue emitida. Las recetas en estado `draft` (creadas por el sistema tras la evaluacion psiquiatrica pero pendientes de firma/emision por el doctor) eran completamente invisibles.

### Solucion

Nuevo query paralelo en `getDoctorStats()` que cuenta `prescriptions.status = 'draft'` para el doctor actual.

### Archivos modificados (2)

| Archivo                                                     | Cambio                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/doctors/services/doctor-stats.service.ts` | Nuevo campo `draftPrescriptions` en `DoctorStats`. Nuevo query en `Promise.all`: `prescriptions.status='draft'` filtrado por `doctor_id`                      |
| `apps/web/src/components/doctors/DoctorsPortalFrame.tsx`    | `totalActive = clarifications + drafts`. Muestra "X recetas pendientes de emitir" cuando `drafts > 0`. "Sin mandatos activos" solo aparece cuando ambos son 0 |

### Antes vs despues

**Antes:**

- "Sin mandatos activos" — aun con recetas draft esperando emision
- Solo se activaba con aclaraciones de farmacia (`clarification_requested`)

**Despues:**

- "3 mandatos activos" → "2 recetas pendientes de emitir" + "1 aclaracion de farmacia"
- "Sin mandatos activos" solo cuando no hay nada pendiente de ninguna fuente

---

## PRs relacionados (contexto de la sesion)

| PR   | Titulo                                                            | Estado | Notas                            |
| ---- | ----------------------------------------------------------------- | ------ | -------------------------------- |
| #265 | feat(billing): pricing page and subscription panel UI             | Merged | UI de planes y suscripciones     |
| #266 | fix(doctors): remove non-existent pendingTriageMandates reference | Merged | Limpieza de referencia rota      |
| #267 | fix(doctors): remove remaining triageMandates references          | Merged | Limpieza complementaria          |
| #268 | fix(billing): E2E flow — dynamic plans, API envelope, runtime env | Merged | Fix de flujo de facturacion      |
| #269 | fix(billing): complete E2E billing flow with MercadoPago          | Merged | Integracion MercadoPago completa |
| #270 | feat(calls): guest video call links for external patients         | Merged | Documentado arriba               |
| #272 | fix(doctors): show draft prescriptions in portal mandatos         | Merged | Documentado arriba               |

---

## Mapa de impacto

### Paquetes tocados

- `apps/web` — API routes, components, hooks, services, middleware, pages
- `packages/telemedicine` — types, UnifiedVideoCall, GreenRoom

### Tablas consultadas (no modificadas)

- `prescriptions` — nuevo query `status='draft'` en doctor-stats
- `dispensation_orders` — query existente `status='clarification_requested'`
- `calls` — lookup por callId para guest-link, roomId para bootstrap

### Variables de entorno nuevas

- `GUEST_TOKEN_SECRET` — HMAC-SHA256 secret para firmar guest call tokens (min 32 chars)

### Rutas publicas nuevas

- `/call/join/[roomId]` — pagina guest (bypass de auth middleware)
- `/api/calls/guest/cloudflare-calls` — proxy CF Calls para guests (auth via token en query param)
