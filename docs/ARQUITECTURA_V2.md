# AutaMedica Architecture v2

> Estado objetivo de arquitectura para pasar de una plataforma funcional a una
> plataforma gobernable, auditable y defendible en producción.
> Fecha: `2026-04-02`

---

## Proposito

La `v1` describía bien el sistema como mapa funcional.

La `v2` agrega lo que faltaba para operar una plataforma clínica real:

- separación explícita entre `feature plane` y `control plane`
- distinción entre dominios por criticidad
- una capa formal de `runtime assurance`
- reglas de diseño para evitar drift entre repo, producción y seguridad real

Esta arquitectura no reemplaza el mapa actual. Lo gobierna.

---

## Principios

1. Ninguna feature clínica se considera lista si no está cerrada en `producto + acceso + operación`.
2. `RLS`, grants, roles y funciones privilegiadas son arquitectura, no detalles de base.
3. Producción es una fuente de verdad propia; el repo no basta.
4. Los dominios clínicos y los módulos accesorios no pueden compartir el mismo nivel de riesgo.
5. La plataforma debe poder demostrar quién puede hacer qué, por qué y bajo qué reglas.

---

## Vista Ejecutiva

La arquitectura v2 se organiza en `3 dominios`, `8 capas base` y `2 ejes transversales`.

### Dominios

- `Clinical Core`
- `Platform Core`
- `Adjacent Products`

### Capas base

1. Experience Layer
2. Application Layer
3. Domain Layer
4. Data Access Layer
5. Data Platform Layer
6. Integration Layer
7. Observability Layer
8. Deployment Layer

### Ejes transversales obligatorios

- `Control Plane`
- `Runtime Assurance`

---

## Dominios

### 1. Clinical Core

Aqui vive lo que impacta directamente la atención, la decisión clínica o la historia del paciente.

Incluye:

- `patients`
- `doctors`
- `appointments`
- `telemedicine_sessions`
- `calls`
- `anamnesis`
- `medical_records`
- `vital_signs`
- `prescriptions`
- `lab_results`
- `screenings`
- `clinical_ai_outputs`

Regla:

- cualquier cambio en este dominio exige validación de acceso, trazabilidad y operación

### 2. Platform Core

Aqui vive la infraestructura funcional que sostiene a todos los portales.

Incluye:

- `profiles`
- `auth`
- `user_roles`
- `organizations`
- `org_members`
- `companies`
- `notifications`
- `audit_logs`
- `auth_audit`
- `shared scheduling infra`
- `feature flags`

Regla:

- no se trata como “infra auxiliar”; es la columna vertebral del sistema

### 3. Adjacent Products

Aqui viven capacidades valiosas pero no críticas para el acto clínico central.

Incluye:

- `community`
- módulos de engagement
- verticales específicas no nucleares
- productos satélite y experimentales

Regla:

- nunca deben forzar complejidad o riesgo sobre el `Clinical Core`

---

## Capas Base

### 1. Experience Layer

Responsabilidad:

- portales web
- Android
- futuros clientes móviles
- layouts, navegación, estados de sesión y UX

No debe contener:

- lógica de acceso clínica
- decisiones de autorización
- reglas de negocio complejas

### 2. Application Layer

Responsabilidad:

- hooks
- controllers
- orchestración de casos de uso
- composición de flujos por portal

No debe contener:

- SQL directo
- reglas de rol dispersas

### 3. Domain Layer

Responsabilidad:

- use cases
- contratos de negocio
- invariantes clínicas
- eventos de dominio

Regla:

- todo flujo clínico importante debe ser expresable como use case, no como cadena implícita de componentes

### 4. Data Access Layer

Responsabilidad:

- repositories
- query models
- adapters a Supabase
- lecturas optimizadas

Regla:

- separar escritura de lectura cuando el dashboard o el portal lo necesiten

### 5. Data Platform Layer

Responsabilidad:

- PostgreSQL
- RLS
- policies
- functions
- triggers
- migrations
- índices
- schema evolution

Regla:

- esta capa ya no se considera solo “base de datos”; es parte del diseño de seguridad y performance

### 6. Integration Layer

Responsabilidad:

- signaling
- AI orchestrator
- workers
- push notifications
- WhatsApp
- storage
- servicios externos

Regla:

- toda integración externa debe entrar con contrato explícito, no por acoplamiento informal

### 7. Observability Layer

Responsabilidad:

- logs
- métricas
- auditoría
- health checks
- monitoreo de flujos críticos

Regla:

- debe medir no solo uptime, también acceso, deriva y fallos silenciosos de workflow

### 8. Deployment Layer

Responsabilidad:

- Cloudflare Pages / Workers
- GitHub Actions
- entornos
- deploy policies
- preflight y smoke tests

Regla:

- deploy exitoso no equivale a sistema sano

---

## Eje Transversal 1: Control Plane

El `Control Plane` gobierna quién puede hacer qué, bajo qué contexto y con qué límites.

Incluye:

- roles
- memberships
- grants
- RLS
- `service_role`
- functions `SECURITY DEFINER`
- ownership rules
- tenant/org boundaries
- clinical access rules

### Regla de arquitectura

Ningún flujo del `Clinical Core` se aprueba si el `Control Plane` no está explícitamente definido.

### Anti-patterns

- `TO public` para políticas pensadas solo para backend
- `USING (true)` o `WITH CHECK (true)`
- duplicar policies por parche incremental
- usar el frontend como fuente de verdad de autorización

---

## Eje Transversal 2: Runtime Assurance

`Runtime Assurance` es la capa que responde:

- qué está realmente aplicado en producción
- qué depende del plan del proveedor
- qué está mitigado pero no resuelto
- qué drift existe entre repo, migraciones y runtime

Incluye:

- Supabase Advisor
- migration history
- backup strategy
- restore path
- rollback posture
- production drift checks
- plan limits
- evidence of verification

### Regla de arquitectura

No se declara “resuelto” algo que no pueda verificarse en runtime.

### Anti-patterns

- asumir que porque existe una migración el cambio está activo
- asumir que `RLS enabled` implica acceso correcto
- llamar “resuelto” a algo bloqueado por el plan

---

## Modelo de Gobierno

### Definition of Done para Clinical Core

Un cambio en `Clinical Core` está listo solo si cumple:

1. feature implementada
2. dominio consistente
3. RLS/policies validadas
4. migración versionada
5. observabilidad suficiente
6. deploy verificable
7. rollback o mitigación conocida

### Definition of Done para Platform Core

Debe cumplir:

1. contrato claro
2. ownership claro
3. impacto sobre roles y acceso explicitado
4. compatibilidad con entornos validada

### Definition of Done para Adjacent Products

Debe cumplir:

1. no introducir riesgo al `Clinical Core`
2. no degradar `Control Plane`
3. no aumentar deuda operativa sin owner

---

## Reglas de Diseño

### Regla 1

Toda tabla nueva debe nacer con:

- clasificación de dominio
- owner funcional
- política RLS explícita
- estrategia de índice mínima

### Regla 2

Toda función en `public` debe tener:

- `search_path` explícito
- justificación si usa `SECURITY DEFINER`

### Regla 3

Toda migración debe verificarse contra:

- schema actual
- runtime real
- Advisor posterior

### Regla 4

Toda capability nueva debe ubicarse en uno de los tres dominios.

Si no puede clasificarse, no está suficientemente diseñada.

### Regla 5

No se mezcla `producto accesorio` con `ruta clínica crítica` en la misma prioridad arquitectónica.

---

## Mapa Inicial de Aplicación

### Clinical Core

- `apps/web/src/components/doctors`
- `apps/web/src/components/patients`
- `apps/web/src/lib/doctors`
- `apps/web/src/lib/patients`
- `packages/telemedicine`
- tablas clínicas y de agenda

### Platform Core

- `packages/auth`
- `packages/shared`
- `packages/types`
- auth routing
- role routing
- profiles / orgs / companies / audit

### Adjacent Products

- community
- verticales no nucleares
- features experimentales

---

## Primeras Aplicaciones de la v2

Esta versión ya se empezó a aplicar en:

- hardening de `Control Plane` en Supabase
- formalización de `Runtime Assurance` con verificación por API
- runbook de backups lógicos
- lecciones aprendidas de hardening

Referencias:

- [ARQUITECTURA.md](/home/edu/Autamedica/docs/ARQUITECTURA.md)
- [SUPABASE_HARDENING_LESSONS.md](/home/edu/Autamedica/docs/database/SUPABASE_HARDENING_LESSONS.md)
- [BACKUP_RUNBOOK.md](/home/edu/Autamedica/docs/database/BACKUP_RUNBOOK.md)

---

## Siguiente Paso

La siguiente ola de aplicación de la v2 debe caer sobre:

1. consolidación de policies en `medical_records`
2. mapa de ownership por dominio
3. checklist obligatorio de `Control Plane` para nuevas migraciones
4. checklist obligatorio de `Runtime Assurance` para cambios productivos

---

## Conclusión

La arquitectura v1 explicaba cómo funciona el sistema.

La arquitectura v2 define cómo evitar que el sistema vuelva a degradarse mientras sigue creciendo.

Ese es el cambio central:

- de una arquitectura funcional
- a una arquitectura gobernable
