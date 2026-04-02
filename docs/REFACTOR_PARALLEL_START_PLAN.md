# Refactor Parallel Start Plan

> Plan operativo para iniciar la refactorización paralela de AutaMedica bajo la
> `Architecture v2`.
> Fecha de inicio propuesta: `2026-04-02`

---

## Objetivo

Este documento cubre los tres pasos previos al refactor:

1. `Domain map`
2. `Workstreams`
3. `Primer batch de ejecución`

La idea no es reorganizar el repo por estética.

La idea es arrancar una refactorización paralela sin colisiones, con límites de
ownership claros y con criterio de cierre por frente.

Backlog ejecutable asociado:

- [REFACTOR_WORKSTREAM_BACKLOG.md](/home/edu/Autamedica/docs/REFACTOR_WORKSTREAM_BACKLOG.md)

---

## 1. Domain Map

### A. Clinical Core

Responsabilidad:

- atención clínica
- anamnesis
- agenda médica
- videoconsulta
- historia clínica
- signos vitales
- screening
- contexto clínico del doctor

Módulos principales:

- `apps/web/src/components/doctors/appointments`
- `apps/web/src/components/doctors/calls`
- `apps/web/src/components/doctors/diagnosis`
- `apps/web/src/components/doctors/history`
- `apps/web/src/components/doctors/medical`
- `apps/web/src/components/doctors/patient`
- `apps/web/src/components/doctors/patients`
- `apps/web/src/components/doctors/records`
- `apps/web/src/components/doctors/telemedicine`
- `apps/web/src/components/doctors/vitals`
- `apps/web/src/components/patients/anamnesis`
- `apps/web/src/components/patients/appointments`
- `apps/web/src/components/patients/calls`
- `apps/web/src/components/patients/chat`
- `apps/web/src/components/patients/medical`
- `apps/web/src/components/patients/medical-history`
- `apps/web/src/components/patients/preventive`
- `apps/web/src/components/patients/telemedicine`
- `apps/web/src/lib/calls`
- `apps/web/src/lib/doctors`
- `apps/web/src/lib/patients`
- `packages/telemedicine`
- `packages/scheduling`
- `packages/types/src/doctor`
- `packages/types/src/medical`
- `packages/types/src/patient`
- `packages/types/src/preventive-care`
- `packages/types/src/scheduling`

Tablas sensibles asociadas:

- `patients`
- `doctors`
- `appointments`
- `appointment_history`
- `appointment_reminders`
- `appointment_waitlist`
- `telemedicine_sessions`
- `calls`
- `anamnesis`
- `anamnesis_sections`
- `anamnesis_extractions`
- `medical_records`
- `vital_signs`
- `lab_results`
- `patient_alerts`
- `patient_care_team`

### B. Platform Core

Responsabilidad:

- identidad
- roles
- portales
- organizaciones
- tenancy
- auditoría
- utilidades compartidas
- configuración

Módulos principales:

- `apps/web/src/components/admin`
- `apps/web/src/components/auth`
- `apps/web/src/components/companies/layout`
- `apps/web/src/components/doctors/layout`
- `apps/web/src/components/doctors/settings`
- `apps/web/src/components/patients/layout`
- `apps/web/src/components/portal`
- `apps/web/src/components/shared`
- `apps/web/src/components/ui`
- `apps/web/src/lib/admin`
- `apps/web/src/lib/auth`
- `packages/auth`
- `packages/shared`
- `packages/session`
- `packages/supabase-client`
- `packages/types/src/auth`
- `packages/types/src/core`
- `packages/types/src/ports`
- `packages/types/src/supabase`
- `packages/ui`

Tablas sensibles asociadas:

- `profiles`
- `user_roles`
- `organizations`
- `org_members`
- `companies`
- `company_members`
- `audit_logs`
- `auth_audit`

### C. Adjacent Products

Responsabilidad:

- experiencia periférica
- marketplace
- community
- módulos de valor no clínico central

Módulos principales:

- `apps/web/src/components/companies/marketplace`
- `apps/web/src/components/companies/providers`
- `apps/web/src/components/doctors/marketplace`
- `apps/web/src/components/doctors/payment`
- `apps/web/src/components/doctors/ranking`
- `apps/web/src/components/doctors/subscription`
- `apps/web/src/components/patients/ai`
- `apps/web/src/components/patients/quick-actions`
- `apps/web/src/components/patients/tours`

Tablas asociadas:

- `community_posts`
- `community_post_comments`
- `community_comment_reactions`
- `post_reactions`
- `doctor_reviews`
- `doctor_rankings`
- verticales y módulos satélite

### D. Cross-Cutting Surfaces

Estos módulos cruzan varios dominios y por eso deben tratarse como fronteras de arquitectura:

- `docs/database/*`
- `supabase/migrations/*`
- `apps/signaling-server`
- `apps/clinical-ai-orchestrator`
- `apps/reminder-worker`
- `.github/workflows/*`

---

## 2. Workstreams Paralelos

### Workstream A — Clinical Core Refactor

Objetivo:

- limpiar bordes clínicos
- separar casos de uso de UI
- reducir mezcla entre portal, sesión y lógica clínica

Write scope inicial:

- `apps/web/src/components/doctors/*`
- `apps/web/src/components/patients/*`
- `apps/web/src/lib/calls/*`
- `apps/web/src/lib/doctors/*`
- `apps/web/src/lib/patients/*`
- `packages/telemedicine/*`
- `packages/scheduling/*`

No toca:

- migraciones
- policies
- auth global
- companies/orgs

### Workstream B — Platform Core Refactor

Objetivo:

- ordenar identidad, roles, tenancy y shell de portales
- reducir mezcla entre layout, routing y estado de sesión

Write scope inicial:

- `apps/web/src/components/auth/*`
- `apps/web/src/components/*/layout/*`
- `apps/web/src/lib/auth/*`
- `packages/auth/*`
- `packages/shared/*`
- `packages/session/*`
- `packages/supabase-client/*`
- `packages/types/src/auth/*`
- `packages/types/src/core/*`

No toca:

- tablas clínicas
- telemedicina funcional
- AI clínica

### Workstream C — Control Plane

Objetivo:

- consolidar acceso
- reducir policies duplicadas
- fijar contratos de seguridad en datos

Write scope inicial:

- `supabase/migrations/*`
- `docs/database/*`
- scripts de DB relevantes

No toca:

- componentes de UI
- flujo visual de videollamada
- marketplace/community

### Workstream D — Runtime Assurance

Objetivo:

- asegurar que repo, producción y operación no diverjan
- convertir validación manual en disciplina operativa

Write scope inicial:

- `docs/database/*`
- `docs/*` arquitectónicos/operativos
- `.github/workflows/*`
- scripts de validación y backup

No toca:

- use cases clínicos
- UI clínica
- policies de negocio salvo validación

### Regla de paralelización

Cada workstream debe tener ownership de escritura exclusivo sobre su scope.

Si un cambio necesita tocar dos scopes, se parte en:

- un cambio principal
- y un cambio de integración posterior

---

## 3. Primer Batch de Refactor Paralelo

### Batch 1A — Clinical Core

Inicio:

- `2026-04-02`

Fin objetivo:

- `2026-04-09`

Objetivos:

- aislar mejor `appointments`, `calls` y `telemedicine_sessions`
- reducir lógica clínica en shells/layouts
- consolidar contratos entre doctor portal y patient portal

Primeros objetivos concretos:

1. definir frontera entre `DoctorCallPage`, `useCallSession` y `CallService`
2. separar agenda clínica de shell del portal doctor
3. normalizar `patients` y `appointments` en query/usecase/service

Done:

- menos dependencias cruzadas entre layout y flujo clínico
- contratos clínicos explícitos
- sin mezcla innecesaria con platform/auth

### Batch 1B — Platform Core

Inicio:

- `2026-04-02`

Fin objetivo:

- `2026-04-09`

Objetivos:

- ordenar shell, layout y estado de portal
- fijar mejor frontera entre auth, role-routing y portal state

Primeros objetivos concretos:

1. inventariar estado compartido de portal doctor/patient
2. separar navegación, sesión y shell visual
3. revisar duplicaciones entre `packages/auth`, `packages/shared` y lib auth de `apps/web`

Done:

- layouts más delgados
- menos lógica de sesión en componentes de UI
- ownership claro de auth/routing

### Batch 1C — Control Plane

Inicio:

- `2026-04-02`

Fin objetivo:

- `2026-04-11`

Objetivos:

- bajar el resto de `multiple_permissive_policies`
- consolidar policies de recursos de alto impacto

Primeros objetivos concretos:

1. `medical_records`
2. `companies` + `company_members`
3. `doctors`
4. `patients`

Done:

- policies menos fragmentadas
- sin widening de acceso
- verificación por Advisor/API

### Batch 1D — Runtime Assurance

Inicio:

- `2026-04-02`

Fin objetivo:

- `2026-04-10`

Objetivos:

- convertir el hardening en disciplina repetible

Primeros objetivos concretos:

1. formalizar verificación post-migración
2. dejar estrategia mínima de backup/restore documentada
3. definir criterio de “resuelto vs mitigado”

Done:

- checklist operativo vigente
- evidencias de verificación
- no depender de memoria del equipo

---

## Secuencia de Inicio

### Día 0

- congelar este plan como referencia
- no abrir refactors masivos fuera de scope

### Día 1

- arrancan en paralelo:
  - Clinical Core
  - Platform Core
  - Control Plane
  - Runtime Assurance

### Día 3

- primer checkpoint de colisiones
- revisar si algún módulo quedó en frontera dudosa

### Día 5

- checkpoint de integración
- validar que ningún workstream haya invadido ownership ajeno

### Día 7 a 9

- cierre del primer batch
- decidir segunda ola

---

## Riesgos a evitar

1. Reorganizar carpetas sin aclarar ownership.
2. Mezclar refactor clínico con cambios de seguridad en el mismo patch.
3. Resolver `multiple_permissive_policies` a ciegas solo para bajar números.
4. Tocar `Clinical Core` sin validar impacto en `Control Plane`.
5. Abrir un refactor transversal sin write scope definido.

---

## Criterio de Finalización del Primer Batch

El primer batch termina cuando:

1. cada workstream entrega sus objetivos mínimos
2. no hay colisiones de ownership
3. el `Control Plane` de los recursos atacados queda más simple que antes
4. el repo refleja la `Architecture v2`, no solo la documenta

---

## Próxima Decisión

Cuando cierre este batch, la siguiente ola debe decidir si prioriza:

- `medical_records` como núcleo clínico
- `companies/company_members` como núcleo de platform core
- o una normalización transversal de tipos y ports

La recomendación inicial es:

1. `medical_records`
2. `companies/company_members`
3. luego normalización transversal
