# SISA / REFEPS — validación de profesionales

**Estado revisado: 27-10-2026.** La implementación de SISA/REFEPS **ya funciona según confirmación del responsable de AutaMedica**. La versión anterior de este documento describía el servicio completo como pendiente y había quedado desactualizada.

## Implementación disponible

- `apps/web/src/pages/api/admin/doctors/license-verify-live.ts` efectúa la consulta administrativa por backend, con controles de acceso, auditoría y persistencia opcional.
- `packages/prescriptions/src/infrastructure/adapters/RefepsApiValidator.ts` implementa acceso al **Bus de Interoperabilidad del Ministerio de Salud**, autenticación OAuth por client assertion y consulta FHIR `Practitioner` para validación del profesional.
- `packages/prescriptions/src/infrastructure/adapters/LocalRefepsValidator.ts` permite contraste con datos internos cuando el servicio externo no está disponible. **Esta verificación local NO acredita por sí sola una consulta oficial SISA/REFEPS.**
- La ruta registra el estado en `profiles.sss_validation_status`, la fecha de control `profiles.sss_last_checked_at` y, cuando el servicio retorna un identificador, `doctors.refeps_id`.
- La emisión de recetas requiere estado profesional `valid` o excepción autorizada `exempt`.

## Evidencia no nominativa de producción (consulta read-only de 27-10-2026)

- 14 perfiles profesionales con `doctors.refeps_id` informado.
- 26 perfiles con estado `sss_validation_status = valid`; 9 de ellos poseen fecha registrada de comprobación.
- Última comprobación histórica registrada en esos perfiles: 08-10-2026 (UTC).

Estas cifras muestran registros operativos e históricos. **No constituyen una prueba directa de conectividad en vivo con SISA el 27-10-2026** ni confirman que los 26 perfiles se validaron por fuente nacional; también existen vías internas de validación. Para acreditar una emisión concreta, registrar fuente `national_refeps_api`, fecha, matrícula y estado activo en el flujo clínico.

## Diferencia entre Bus/FHIR y WS020

La implementación actual utiliza el Bus/FHIR de SISA. El servicio **WS020** (consulta nominal REST/SOAP) descrito en la documentación anterior representa **otra interfaz posible**, y la documentación existente no acredita que esa modalidad específica esté integrada. Esto **no implica** que la integración SISA que ya opera por Bus/FHIR esté pendiente.

Antes de declarar equivalencia normativa entre canales, confirmar los requisitos que efectivamente exige la autoridad y conservar la evidencia de consulta para la habilitación de cada médico.

## Seguridad operativa

- Las credenciales del Bus se leen exclusivamente del runtime de servidor. No publicarlas en el repositorio, archivos de cliente, logs, propuestas ni PDF.
- La ruta administrativa debe distinguir validación `national_refeps_api`, validación `local_database_fallback` y datos de prueba.
- En `RefepsApiValidator.ts` existe un resultado de prueba `offline_mock` con `isValid: true` si se instancia **sin credenciales y sin fallback**. **No utilizar esa ruta como comprobante de habilitación profesional**; verificar que los flujos productivos rechacen siempre esa fuente.
- Registrar fuentes y errores sanitizados para poder demostrar a una institución cómo se comprobó la habilitación profesional.

## Criterio de entrega hospitalaria

Para el Hospital Regional Río Gallegos, documentar y probar que cada médico firmante posee matrícula habilitante en la jurisdicción aplicable y que su verificación es atribuible a SISA/REFEPS. La operación general de SISA no sustituye esa comprobación individual ni la firma digital oficialmente válida.

## Referencias

- Código de la API administrativa: `apps/web/src/pages/api/admin/doctors/license-verify-live.ts`
- Adaptador SISA/FHIR: `packages/prescriptions/src/infrastructure/adapters/RefepsApiValidator.ts`
- Validador local: `packages/prescriptions/src/infrastructure/adapters/LocalRefepsValidator.ts`
