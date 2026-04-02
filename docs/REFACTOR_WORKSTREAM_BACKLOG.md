# Refactor Workstream Backlog

> Backlog ejecutable para arrancar la refactorización paralela bajo
> `Architecture v2`.
> Fecha de apertura: `2026-04-02`

---

## Objetivo

Traducir el plan de arranque en trabajo operable.

Cada frente tiene:

- alcance
- entregables
- criterio de done
- tareas del primer batch

---

## Workstream A — Clinical Core

Owner sugerido:

- frontend clínico + dominio de agenda/telemedicina

Objetivo del batch:

- separar UI clínica de casos de uso y consultas
- reducir acoplamiento entre agenda, pacientes y shell médico

Tareas:

- extraer selector común de agenda para `DoctorDailySummary`, `AppointmentsPanel` y `PatientsPanel`
- consolidar contratos de citas en `types + service + query + usecase`
- aislar navegación clínica del shell y evitar que componentes clínicos dependan de layout state
- revisar `telemedicine_sessions` y `calls` para que el portal médico no resuelva estado clínico desde componentes visuales

Done:

- componentes clínicos consumen hooks/casos de uso estables
- no hay lógica clínica relevante embebida en layout
- agenda y pacientes comparten contratos tipados consistentes

---

## Workstream B — Platform Core

Owner sugerido:

- portal shell + auth/session + navegación

Objetivo del batch:

- ordenar layout, URL state, identidad y estado de portal

Tareas:

- extraer el estado de workspace médico desde `DoctorsPortalShell` a hook dedicado
- separar `shell state` de `clinical workspace state`
- definir frontera explícita entre `useSidebar` y estado navegable del workspace
- preparar el paso siguiente: mover `selectedPatientId` a ruta canónica del portal

Done:

- `DoctorsPortalShell` deja de ser fuente monolítica de navegación + URL + workspace
- el estado navegable del portal vive en un módulo reutilizable
- se reduce el costo de mover el workspace a ruta real

---

## Workstream C — Control Plane

Owner sugerido:

- seguridad de datos + migraciones + RLS

Objetivo del batch:

- bajar el remanente de `multiple_permissive_policies`

Tareas:

- consolidar policies en `medical_records`
- consolidar policies en `companies` y `company_members`
- cerrar la pasada pendiente en `doctors`, `patients`, `lab_results`, `vital_signs`
- dejar un criterio explícito para cuándo una policy duplicada es válida y cuándo debe eliminarse

Done:

- baja medible de warnings remanentes
- tablas clínicas críticas con matriz de acceso más razonable
- migraciones auditables y reversibles

---

## Workstream D — Runtime Assurance

Owner sugerido:

- operación + verificación + CI/CD

Objetivo del batch:

- volver repetible la validación entre repo y producción

Tareas:

- checklist post-migración ejecutable
- validación de drift mínima para Supabase
- validación de backup lógico con runbook
- criterios de `resolved`, `mitigated`, `accepted` por hallazgo

Done:

- cada cambio de datos puede verificarse en producción con una rutina estable
- queda claro qué está corregido, qué está mitigado y qué depende del plan/proveedor

---

## Batch 1

Ventana:

- inicio: `2026-04-02`
- cierre objetivo: `2026-04-09` a `2026-04-11`

Orden de ejecución:

1. abrir `Workstream B` para limpiar el shell y estabilizar navegación
2. correr `Workstream A` sobre agenda/pacientes usando esa frontera más limpia
3. mantener `Workstream C` y `D` en paralelo sin tocar UI

Checkpoint:

- día 3: validar colisiones de ownership
- día 5: validar integración entre portal y agenda
- día 7+: cerrar primer batch y definir batch 2

---

## Riesgos a evitar

- mover carpetas sin cambiar responsabilidades
- mezclar refactor clínico con migraciones en el mismo cambio
- tocar `Clinical Core` desde `Platform Core` sin contrato explícito
- declarar “terminado” algo que todavía depende de estado implícito o producción no verificada
