# Checklist consolidado — Auditoría arquitectura Autamedica

> Fecha: 2026-04-17
> Origen: auditoría de cumplimiento de la arquitectura hexagonal de 11 capas (docs/ARQUITECTURA.md).
> Estado: 8 PRs abiertos, ~50 items pendientes.

---

## 1. PRs abiertos (merge en este orden)

- [ ] **#305** `fix(test): add getServerEnvOrDefault to call-session mock` — desbloquea pre-push de todos los demás. **Mergear primero.**
- [ ] **#306** `feat(telemedicine): emit call.started and call.ended domain events`
- [ ] **#307** `feat(notifications): add appointment.cancelled handler`
- [ ] **#308** `docs(usecases): annotate pure use cases as non-DI by design`
- [ ] **#310** `chore(pharmacy): remove zombie event handlers, keep Port as canonical`
- [ ] **#311** G3 piloto — `refactor(api): migrate redeem-invite controller to use case + ports`
- [ ] **#312** G2 piloto — `refactor(api): migrate doctor onboarding controller to use case + port`
- [ ] **#313** G1 piloto — `refactor(api): migrate doctor slots controller to CQRS query`

---

## 2. Migración de controllers (27 restantes)

Total original: 30 controllers con Supabase directo. 3 migrados en los pilotos #311, #312, #313.

### Fase B — Ports existentes (sin bloqueadores)

- [ ] **G1 batch** — 2 controllers read-only restantes (1 PR).
- [ ] **G2 batch — accounting** (5 endpoints): `profile`, `income`, `overview`, `dashboard`, `expenses`. `accounting-repo` ya existe.
- [ ] **G2 batch — calls/auth** (3-4 endpoints): `me`, `names`, `transcription`.
- [ ] **G2 batch — reports/pdf** (4 endpoints): `reports/index`, `reports/[id]/pdf`, `anamnesis/pdf`, `psychiatry-intake/pdf`.

### Fase C — Requiere Ports nuevos

- [ ] Crear **`PharmacyClarificationPort`** y migrar:
  - `pharmacy/orders/[id]/clarify`
  - `doctors/prescriptions/clarifications`
  - `doctors/prescriptions/[id]/clarify`
- [ ] Crear **`AnamnesisExtractionPort`** y migrar:
  - `patients/anamnesis/extract`
  - `patients/anamnesis/live-relay`
- [ ] Crear **`PrescriptionDispensationPort`** y migrar:
  - `patients/prescriptions/*`
  - `verify/[cuir]`
  - `doctors/patients/[id]/anamnesis`
- [ ] Crear **`BillingSubscriptionPort`** y migrar `doctors/billing/subscription`.
- [ ] Crear **`ClinicalCaseStatePort`** y migrar:
  - `patients/psychiatry/continuity-request`
  - `patients/appointments/smart-suggest`
- [ ] Crear **`GuestInviteOrchestrationPort`** (compone call + invite) y migrar:
  - `doctors/calls/[callId]/guest-link`
  - `doctors/appointments/[id]/guest-link`
- [ ] Migrar `webhooks/openclaw` a `WebhooksService`.

---

## 3. Domain Events — circuitos abiertos

- [ ] Definir tipo `guest.redeemed` en `packages/shared/src/events/types.ts` y emitirlo desde `redeemGuestInviteUseCase`.
- [ ] Extender payload de `appointment.cancelled` con `doctorId`/`patientId` (hoy fuerza lookup extra en el handler).
- [ ] Cablear `SupabasePharmacyNotifier` en los use cases de pharmacy (hoy instanciado en `prescription-factory.ts` pero nunca invocado).

---

## 4. Infraestructura / DB

- [ ] **Issue #309** — migration SQL: extender `portal_notifications.audience CHECK` con valor `'pharmacist'` + revisar RLS policies.
- [ ] Arreglar 3 errores `ts(2589)` preexistentes: `guest-link.ts`, `callback.ts`, `logout.ts`.

---

## 5. Decisiones de producto (bloqueantes)

- [ ] `prescription.issued`: ¿debe notificar al paciente? Hoy el paciente no se entera hasta que la farmacia dispensa. Requiere decisión del equipo médico/producto.
- [ ] Modelo de notificaciones para pharmacists: ¿leen de `portal_notifications` o tabla dedicada? Bloquea la migration del issue #309.

---

## 6. Seguridad — CRÍTICO

- [ ] **Rotar `PUBLIC_GOOGLE_MAPS_API_KEY`** expuesta en `.env` versionado.
- [ ] Auditar otros secretos expuestos en `.env` e historial de git.
- [ ] Verificar `.gitignore` incluye `.env` y que no quedan copias históricas indexadas.

---

## 7. Deuda técnica (prioridad media)

- [ ] Eliminar `as any` en módulos médicos:
  - `packages/telemedicine/src/cloudflare-calls/client.ts:62`
  - `packages/shared/src/db.ts:213, 408`
  - `packages/scheduling/src/referrals.ts:39`
  - `apps/web/src/lib/patients/lib/repos/quick-actions.repo.ts:104`
- [ ] Reemplazar 12 `console.log` en `apps/reminder-worker/src/inbound-watcher.ts` por `logger` de `@autamedica/shared`.
- [ ] Extraer sub-componentes y custom hooks de:
  - `apps/web/src/components/patients/AnamnesisPage.tsx` (995 líneas)
  - `apps/web/src/components/doctors/DoctorsAccountingPage.tsx` (769 líneas)
- [ ] Migrar hooks que pegan a Supabase directo a través de Service:
  - `apps/web/src/hooks/patients/useCommunity.ts:187`
  - `apps/web/src/hooks/patients/usePatientSession.ts:79`
- [ ] Reemplazar deep imports de `packages/ui/src/...` por imports desde el index (14+ archivos). Activar `eslint-plugin-boundaries` en CI.
- [ ] Consolidar `packages/supabase-client` (redundante, re-exporta `@autamedica/auth`, mezcla `require()` en ESM).

---

## 8. Tests faltantes

- [ ] Suite en `packages/prescriptions` (use cases de issue/dispense).
- [ ] Suite en `packages/session` (validación de sesión).
- [ ] Suite en `packages/telemedicine/src/cloudflare-calls` (signaling, stats).

---

## 9. Documentación

- [ ] Actualizar **CLAUDE.md** líneas 86, 296-310 — afirman que los 8 handlers de notification-triggers están activos en producción; 4 se borraron en #310.
- [ ] Documentar en `docs/ARQUITECTURA.md` el criterio "event bus vs Port hexagonal" (decisión tomada sobre pharmacy el 2026-04-17).
- [ ] Documentar los 3 templates de migración (G1 / G2 / G3) una vez aprobados los pilotos #311, #312, #313.

---

## 10. Build / CI

- [ ] Homogeneizar `tsconfig` por package: `composite: true` y `declaration: true` uniformes.
- [ ] Pipeline `depcruise` en CI para bloquear ciclos y deep imports (la herramienta ya está instalada).

---

## Resumen

| Categoría | Items | Bloqueadores |
| --- | --- | --- |
| PRs abiertos | 8 | #305 |
| Migración controllers | 27 | Templates aprobados |
| Domain Events | 3 | — |
| Infra / DB | 2 | Decisión producto |
| Decisiones producto | 2 | — |
| Seguridad CRÍTICO | 3 | — |
| Deuda técnica | 6 | — |
| Tests faltantes | 3 | — |
| Docs | 3 | — |
| Build / CI | 2 | — |
| **Total** | **59** | |

Próximo paso recomendado: mergear #305, luego revisar los 3 templates de piloto (#311/#312/#313) para aprobar la convención antes de lanzar Fase B.
