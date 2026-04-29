# Plan de cierre MVP farmacia-receta-dispensa

Fecha: 2026-04-29

## Objetivo

Cerrar un ciclo vendible para farmacias aliadas: el medico emite una receta verificable, la farmacia la toma, valida, dispensa y el paciente ve el estado sin llamadas ni coordinacion manual.

Este plan no incluye HL7 v2 ni FHIR como implementacion inicial. FHIR queda como compatibilidad futura para mapear `MedicationRequest` y `MedicationDispense` cuando aparezcan integraciones externas reales.

## Estado actual

Estimacion actual: 78%.

La base tecnica ya existe:

- Receta digital con CUIR y endpoint publico de verificacion: `apps/web/src/pages/api/verify/[cuir].ts`.
- UI publica de verificacion: `apps/web/src/components/prescriptions/PrescriptionVerifyPage.tsx`.
- Portal farmacia: `apps/web/src/pages/pharmacy/dashboard.astro` y `apps/web/src/components/pharmacy/PharmacyDashboard.tsx`.
- Cola de ordenes de dispensacion: `dispensation_orders`.
- Farmaceutico toma orden pendiente: `POST /api/pharmacy/orders/[id]/claim`.
- Validacion farmaceutica: `POST /api/pharmacy/orders/[id]/validate`.
- Dispensa parcial o total: `POST /api/pharmacy/orders/[id]/dispense`.
- Auditoria farmaceutica: `pharmacy_audit_events`.
- Estado visible para paciente: `GET /api/patients/prescriptions/[id]/dispensation`.
- Test e2e documentando el flujo completo: `tests/e2e/prescription-flow.spec.ts`.

## Brechas para venderlo

### P0 - Demo cerrada

- Crear o verificar una cuenta real de farmacia demo con `pharmacists.pharmacy_id` activo.
- Ejecutar el flujo completo sin skips:
  - medico crea receta;
  - medico emite CUIR;
  - se crea `dispensation_orders`;
  - farmacia toma orden;
  - farmacia valida controles obligatorios;
  - farmacia dispensa;
  - paciente ve estado.
- El test actual valida login real de farmacia demo, claim, validaciones obligatorias, dispensa, vista paciente y bloqueo anti-reuso.

### P0 - Estados comerciales de farmacia

El dominio actual tiene `pending`, `assigned`, `under_review`, `approved_for_dispensation`, `dispensed` y derivados. Para el piloto comercial falta expresar estados que la farmacia y el paciente entienden:

- `preparing`: farmacia acepto y esta preparando.
- `ready_for_pickup`: listo para retirar.
- `out_of_stock`: farmacia no tiene stock.
- `rejected`: farmacia rechaza con motivo operativo.

No conviene romper el dominio actual. La forma conservadora es agregar una capa operativa o eventos de estado sobre la orden, y mapearlos a las etiquetas del portal/paciente.

### P0 - Pantalla paciente orientada a retiro

El endpoint paciente existe, pero el flujo vendible necesita una vista clara:

- receta emitida;
- farmacia asignada;
- estado de preparacion;
- ventana de retiro;
- medicamento y cantidad;
- historial de dispensa;
- QR/link de verificacion.

### P1 - Onboarding minimo de farmacia

Para piloto no hace falta integracion con software de farmacia. Hace falta:

- tabla/registro de farmacia activa;
- usuario farmaceutico vinculado;
- licencia/matricula visible;
- acceso al portal;
- checklist de permisos y auditoria.

### P1 - Seguridad y auditoria

- Confirmar que todas las acciones de farmacia guardan actor, rol, fecha y detalle.
- Evitar que una farmacia vea o tome ordenes ya asignadas a otra.
- Revisar exposicion del endpoint publico `/verify/[cuir]`: debe mostrar lo minimo necesario para validar receta, no historia clinica amplia.

### P1 - Notificaciones

Hay una decision pendiente en `docs/CHECKLIST_AUDITORIA_2026-04-17.md`: al emitir receta, el paciente hoy puede no enterarse hasta que la farmacia dispensa. Para este MVP:

- `prescription.issued` debe notificar al paciente;
- `order.assigned` o `ready_for_pickup` debe notificar al paciente;
- `clarification_requested` debe notificar al medico.

## Primer sprint

Duracion estimada: 5 a 7 dias.

Entregable: demo real con una farmacia aliada simulada.

Tareas:

1. Crear/normalizar seed de farmacia demo y farmaceutico demo.
2. Mantener `tests/e2e/prescription-flow.spec.ts` como evidencia del ciclo receta-farmacia: claim, validate, dispense y anti-reuso.
3. Agregar estados operativos de preparacion/retiro sin romper `DispensationOrderStatus`.
4. Mostrar estado de retiro en paciente.
5. Ajustar copy del portal farmacia para flujo piloto: tomar, preparar, listo, dispensar.
6. Documentar pasos de demo con usuarios, rutas y evidencia esperada.

## Segundo sprint

Duracion estimada: 7 a 10 dias.

Entregable: piloto con una farmacia real.

Tareas:

1. Formulario interno para alta de farmacia.
2. Alta de usuario farmaceutico desde admin o script controlado.
3. Reporte simple de recetas por farmacia.
4. Motivos estructurados para rechazo o falta de stock.
5. Notificaciones paciente-medico-farmacia.
6. Checklist legal-operativo de receta electronica y dispensa.

## Definicion de terminado

El ciclo se considera cerrado cuando se pueda demostrar en vivo:

1. Un medico emite una receta.
2. El paciente recibe o ve QR/link.
3. Una farmacia autenticada toma la orden.
4. La farmacia marca preparacion/listo o dispensa.
5. El paciente ve el cambio de estado.
6. La receta queda con auditoria completa.
7. El flujo corre con test e2e o guion reproducible sin pasos manuales ocultos.

## Porcentaje esperado

- Estado actual: 78%.
- Despues del primer sprint: 82-85%.
- Despues del segundo sprint: 90%.
- El 10% restante corresponde a integraciones externas, convenios formales, compliance avanzado y eventual mapeo FHIR.
