# SISA / REFEPS — validación de profesionales

**Estado del código revisado: 31-10-2026.** El flujo administrativo resuelve el identificador REFEPS a partir de la matrícula y los datos existentes de la ficha, y luego consulta el Bus/FHIR autenticado. La habilitación exige una respuesta oficial explícita.

## Implementación disponible

- `apps/web/src/pages/api/admin/doctors/license-verify-live.ts` efectúa la consulta administrativa por backend, con controles de acceso, auditoría y persistencia opcional.
- `packages/prescriptions/src/infrastructure/adapters/RefepsApiValidator.ts` implementa acceso al **Bus de Interoperabilidad del Ministerio de Salud**, autenticación OAuth por client assertion y consulta FHIR `Practitioner` para validación del profesional.
- `packages/prescriptions/src/infrastructure/adapters/LocalRefepsValidator.ts` permite contraste con datos internos cuando el servicio externo no está disponible. **Esta verificación local NO acredita por sí sola una consulta oficial SISA/REFEPS.**
- La ruta registra el estado en `profiles.sss_validation_status`, la fecha de control `profiles.sss_last_checked_at` y, cuando el servicio retorna un identificador, `doctors.refeps_id`.
- La emisión de recetas requiere estado profesional `valid` o excepción autorizada `exempt`.

## Verificación administrativa por matrícula

El operador ingresa la matrícula y pulsa «Solo Verificar» o «Verificar y Autoguardar». No debe obtener ni cargar previamente el código federal REFEPS.

1. El formulario envía el número y jurisdicción que están escritos, incluidos cambios aún sin guardar.
2. El backend autorizado lee el nombre y apellido existentes de la ficha.
3. `RefepsPublicDirectory.ts` solicita el formulario público oficial y envía su consulta por matrícula con los campos anónimos `form_build_id` y `form_id`.
4. Extrae mediante `JSON.parse` los datos de `Drupal.settings.refepsProfesionales.allItems`; nunca ejecuta JavaScript recibido. Contrasta profesión médica, número, jurisdicción y nombre, y exige un identificador federal único.
5. El adaptador consulta ese identificador en el Bus/FHIR autenticado y exige coincidencia de identidad, matrícula, emisor, código médico y habilitación explícita.
6. «Solo Verificar» carga el resultado en la ficha sin escribir en la base. «Verificar y Autoguardar» guarda el identificador descubierto y la matrícula normalizada junto con el resultado oficial. El rol de acceso no se modifica.

Se admiten prefijos MN/MP y matrículas provinciales compuestas, por ejemplo `31796/6`; el sufijo no se convierte en otro número. Si los datos son ambiguos o el nombre no coincide, se solicita revisar esos campos de la ficha, sin seleccionar automáticamente al primer profesional.

Durante la consulta se bloquean selección, edición, cierre, guardado y baja para impedir que una respuesta tardía sobrescriba otra ficha. El descubrimiento público tiene un plazo total de 15 segundos; el proxy dispone de 50 segundos para descubrimiento y consulta autenticada.

Las peticiones del directorio usan `redirect: 'manual'`: Workers rechaza el modo `error` antes de enviar la petición, aunque Node lo acepta. Se rechazan todas las respuestas no exitosas, incluidas las redirecciones, sin seguir `Location` ni reenviar credenciales. Una prueba local de Node no sustituye la comprobación del mismo módulo en el runtime de Cloudflare.

La estructura del formulario público es una dependencia externa. Una indisponibilidad o cambio de formato produce un error sin aprobar desde datos locales. La evidencia de habilitación procede del Bus/FHIR, no del descubrimiento.

Fuente pública y contrato observado:
- https://www.argentina.gob.ar/salud/buscador-nacional-de-profesionales-de-la-salud
- https://www.argentina.gob.ar/profiles/argentinagobar/modules/argentinagobar/argentinagobar_formularios/js/REFEPS/loadDetail.js

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
- `RefepsApiValidator.ts` rechaza credenciales ausentes y no aprueba mediante `offline_mock` ni fallback local. La matrícula sin identificador dispara descubrimiento oficial, no una aprobación sin consulta.
- Los códigos se interpretan dentro de su namespace: los catálogos históricos usan código médico `1`; el sistema actual `http://fhir.msal.gob.ar/CodeSystem/profesionesREFEPSCS` observado usa `35`. No transferir códigos numéricos entre catálogos.
- Registrar fuentes y errores sanitizados para poder demostrar a una institución cómo se comprobó la habilitación profesional.

## Criterio de entrega hospitalaria

Para el Hospital Regional Río Gallegos, documentar y probar que cada médico firmante posee matrícula habilitante en la jurisdicción aplicable y que su verificación es atribuible a SISA/REFEPS. La operación general de SISA no sustituye esa comprobación individual ni la firma digital oficialmente válida.

## Referencias

- Código de la API administrativa: `apps/web/src/pages/api/admin/doctors/license-verify-live.ts`
- Adaptador SISA/FHIR: `packages/prescriptions/src/infrastructure/adapters/RefepsApiValidator.ts`
- Validador local: `packages/prescriptions/src/infrastructure/adapters/LocalRefepsValidator.ts`

