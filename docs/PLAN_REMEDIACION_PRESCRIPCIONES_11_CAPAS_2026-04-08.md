# Plan de Remediación — Prescripciones en 11 Capas

> Fecha: `2026-04-08`
> Alcance: circuito de prescripción médica con foco en `metilfenidato` y `lisdexanfetamina / Vyvanse`

---

## Objetivo

Cerrar el circuito de prescripción de punta a punta bajo la arquitectura de `11 capas`, eliminando el camino legacy basado en `medical_records.type='prescription'` como fuente principal de receta electrónica y migrando a un flujo real, auditable y trazable sobre `public.prescriptions` y `@autamedica/prescriptions`.

La meta no es solo “guardar una receta”.

La meta es que el sistema pueda demostrar:

1. quién prescribió
2. a quién
3. qué medicamento
4. bajo qué identidad profesional
5. con qué identificador unívoco
6. con qué artefactos de emisión
7. con qué auditoría
8. con qué restricciones para medicamentos controlados

---

## Problema Actual

Hoy conviven dos mundos:

- `legacy path`: UI + hooks + services + patient read model sobre `medical_records`
- `new core`: `public.prescriptions` + `prescription_audit_events` + `@autamedica/prescriptions`

El primero es el que usa la app real.
El segundo existe, pero no gobierna el flujo visible al doctor ni al paciente.

Resultado:

- la UI promete receta digital
- el backend activo genera un registro clínico genérico
- el paciente ve QR/PDF simulados
- la auditoría regulatoria no está cerrada
- el vertical neuro evalúa continuidad de estimulantes sin confirmar receta activa real

---

## Base Normativa Operativa

Este plan debe ejecutarse alineado con:

- `Ley 27.553`
- `Resolución 2214/2025`
- guía `CUIR` del Ministerio de Salud
- lineamientos ANMAT para sustancias sujetas a fiscalización especial

Regla operativa del plan:

- hasta que el circuito regulatorio esté cerrado, `metilfenidato` y `lisdexanfetamina` se tratan como medicamentos de `alto riesgo regulatorio`
- no se habilita UX de “receta digital lista para farmacia” si faltan `CUIR`, auditoría, artefacto firmado o validación de dispensación

---

## Mapa de Deficiencias por Capa

### 1. UI

Estado:

- muestra `Ver QR`
- muestra `PDF`
- muestra “billetera de recetas digitales”
- usa doctor y artefactos simulados

Deficiencia:

- comunica un nivel de completitud que el sistema no tiene

Remediación:

- ocultar o degradar `QR/PDF` hasta tener artefactos reales
- diferenciar `registro clínico de medicación` de `receta electrónica emitida`
- mostrar estado real: `draft`, `issued`, `dispensed`, `cancelled`, `expired`

Prioridad: `P0`

### 2. Hook

Estado:

- `usePrescriptions` consume `prescriptionService`
- el read path sigue contra `medical_records`

Deficiencia:

- el estado de UI depende del modelo legacy

Remediación:

- cambiar el hook para leer/escribir sobre un cliente/controlador del core nuevo
- conservar compatibilidad transitoria solo detrás de feature flag

Prioridad: `P1`

### 3. Service FE

Estado:

- `prescription.service.ts` serializa receta como `medical_records.type='prescription'`

Deficiencia:

- la lógica de negocio principal no usa el modelo regulatorio nuevo

Remediación:

- reemplazar `prescriptionService` por una fachada basada en `@autamedica/prescriptions`
- separar claramente:
  - `medication note`
  - `electronic prescription`

Prioridad: `P0`

### 4. API Client

Estado:

- no hay cliente dedicado al flujo nuevo de prescripciones

Deficiencia:

- no existe un contrato HTTP estable para emisión, consulta, cancelación y trazabilidad

Remediación:

- crear cliente/API contract explícito:
  - `create draft`
  - `issue`
  - `get by id`
  - `list by patient`
  - `cancel`
  - `status`

Prioridad: `P1`

### 5. Controller

Estado:

- el paciente lee por `/api/patients/medical-history`
- no existe controller visible para el core nuevo

Deficiencia:

- no hay frontera formal entre UI y dominio regulado

Remediación:

- crear controllers / API routes para prescripciones
- validar identidad, matrícula, ownership y contexto clínico antes de emitir

Prioridad: `P0`

### 6. Use Case

Estado:

- `IssuePrescriptionUseCase` existe
- no está integrado al flujo principal
- el use case neuro no verifica prescripción activa real

Deficiencia:

- el dominio correcto existe pero no gobierna producción

Remediación:

- integrar `IssuePrescriptionUseCase` al camino principal
- crear use cases adicionales:
  - `ListPatientPrescriptions`
  - `GetPrescriptionById`
  - `CancelPrescription`
  - `CheckControlledMedicationEligibility`
- gatear neuro scoring por:
  - receta activa real
  - diagnóstico elegible
  - medicamento y dosis

Prioridad: `P0`

### 7. Service BE

Estado:

- `medicalHistoryService` agrega recetas desde `medical_records`

Deficiencia:

- el backend que alimenta al paciente sigue montado sobre el modelo legacy

Remediación:

- mover lectura de recetas del paciente a `public.prescriptions`
- dejar `medical_records` solo para contexto clínico complementario

Prioridad: `P1`

### 8. Repository / Port

Estado:

- repo legacy activo
- repo nuevo incompleto (`findById` no implementado)

Deficiencia:

- source of truth fragmentada

Remediación:

- completar `SupabasePrescriptionRepository`
- definir puerto único para emisión y lectura
- prohibir nuevas features sobre `medical_records.type='prescription'`

Prioridad: `P0`

### 9. Data Platform / Supabase

Estado:

- tabla `prescriptions` existe
- audit table existe
- RLS de auditoría no contempla inserción explícita

Deficiencia:

- el modelo regulatorio no está operativamente cerrado

Remediación:

- corregir policies de `prescription_audit_events`
- asegurar inmutabilidad + inserción autorizada
- definir constraints de lifecycle
- agregar índices para read paths operativos
- modelar metadata regulatoria faltante si aplica:
  - repositorio
  - plataforma emisora
  - tipo/subtipo
  - estado de dispensación

Prioridad: `P0`

### 10. Domain Events / Handlers

Estado:

- `anamnesis.completed` dispara scoring neuro siempre

Deficiencia:

- el evento no distingue si aplica o no al dominio de estimulantes

Remediación:

- introducir guards de elegibilidad
- desacoplar “anamnesis completada” de “continuidad terapéutica neuro”
- emitir evento específico cuando exista receta activa de estimulantes y datos suficientes

Prioridad: `P1`

### 11. Queries / Read Models

Estado:

- el paciente recompone recetas desde historial médico

Deficiencia:

- el read model final no representa la receta electrónica real

Remediación:

- crear read model específico para prescripciones emitidas
- devolver al paciente solo DTOs aptos para farmacia y UX real
- separar lectura clínica interna de lectura de receta emitida

Prioridad: `P0`

---

## Orden de Ejecución

### Fase 0 — Contención

Objetivo:

- dejar de prometer más de lo que el backend entrega

Acciones:

- ocultar `QR` y `PDF` simulados
- ajustar copy de paciente
- marcar el flujo legacy como transitorio

Salida esperada:

- no hay engaño funcional ni riesgo de uso incorrecto en farmacia

### Fase 1 — Source of Truth

Objetivo:

- definir una sola verdad para receta electrónica

Acciones:

- declarar `public.prescriptions` como único source of truth para receta emitida
- relegar `medical_records.type='prescription'` a contexto clínico o migrarlo
- completar repositorio y puertos del paquete nuevo

Salida esperada:

- fin del doble modelo

### Fase 2 — Write Path del Doctor

Objetivo:

- que el doctor emita desde el flujo correcto

Acciones:

- conectar modal/hook/service/controller/use case al core nuevo
- validar identidad profesional y paciente
- crear draft + issue + audit event

Salida esperada:

- toda nueva receta nace en `public.prescriptions`

### Fase 3 — Read Path del Paciente

Objetivo:

- que el paciente vea la receta real y no una reconstrucción informal

Acciones:

- nuevo endpoint/read model para paciente
- mostrar `CUIR`, estado, artefactos reales y datos de emisión
- eliminar simulaciones

Salida esperada:

- la UI del paciente refleja el estado regulatorio real

### Fase 4 — Controlados / Estimulantes

Objetivo:

- meter guardrails explícitos para metilfenidato y lisdexanfetamina

Acciones:

- catálogo o regla de clasificación de medicamentos controlados
- pathway reforzado para emisión
- bloqueo de emisión “liviana” si faltan requisitos
- trazabilidad reforzada

Salida esperada:

- los estimulantes no pasan por el circuito genérico

### Fase 5 — Vertical Neuro

Objetivo:

- que la lógica de estabilidad deje de inferir tratamiento donde no existe evidencia suficiente

Acciones:

- exigir receta activa elegible
- leer medicamento, dosis, duración, vigencia y adherencia
- limitar scoring a pacientes dentro del dominio neuro real

Salida esperada:

- menos falsos reportes
- mejor señal clínica

### Fase 6 — Observabilidad y Rollout

Objetivo:

- poder desplegar y auditar sin ambigüedad

Acciones:

- métricas de emisión
- métricas de fallos de vendor
- métricas de auditoría
- alerts por inconsistencia entre receta emitida y artefactos faltantes
- feature flag de rollout gradual

Salida esperada:

- despliegue seguro y verificable

---

## Backlog Ejecutable

### Batch A — Contención inmediata

- remover botones `QR/PDF` no funcionales
- corregir copy de “receta digital”
- agregar badge `simulada` o `no emitida` donde corresponda

### Batch B — Núcleo backend

- implementar `findById` en `SupabasePrescriptionRepository`
- agregar `listByPatient`
- agregar `cancel`
- cerrar `audit log insert policy`
- revisar transición de estados

### Batch C — Integración app web

- controller doctor
- controller paciente
- hook nuevo
- service FE nuevo
- DTOs reales

### Batch D — Dominio controlados

- clasificación de alto riesgo regulatorio
- regla explícita para estimulantes
- checklist de emisión reforzada

### Batch E — Neuro vertical

- guard de elegibilidad
- enriquecimiento de datos
- tests de scoring con casos reales y negativos

---

## Criterio de Cierre

El plan se considera cerrado cuando:

1. ninguna receta nueva sale por `medical_records.type='prescription'`
2. toda receta emitida tiene `CUIR`
3. toda receta emitida tiene evento de auditoría inmutable
4. la UI del paciente solo muestra artefactos reales
5. los medicamentos controlados tienen pathway reforzado
6. el vertical neuro usa receta activa real como precondición
7. el contenido público del producto no contradice el flujo técnico ni la política regulatoria

---

## Riesgos si No Se Corrige

- drift permanente entre arquitectura y producto
- UX engañosa para paciente y médico
- falsa sensación de cumplimiento regulatorio
- imposibilidad de defender auditoría
- scoring neuro clínicamente débil para estimulantes
- deuda técnica que se vuelve más cara cuando el flujo ya tenga volumen real

---

## Decisión de Diseño

No seguir extendiendo el camino legacy.

Toda inversión nueva en prescripciones debe ir al core `public.prescriptions` + `@autamedica/prescriptions`.

El flujo viejo solo puede mantenerse como compatibilidad transitoria y con fecha de retiro.
