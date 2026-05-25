# SISA REFEPS - Validacion de prescriptores

## Estado

- La emision de recetas en AutaMedica queda cerrada si el perfil del medico no tiene
  `profiles.sss_validation_status` en `valid` o `exempt`.
- El flujo actual de perfil valida automaticamente contra el dataset SSS disponible y
  deja revision manual cuando no puede confirmar la matricula.
- La integracion nominal con REFEPS queda pendiente de las credenciales y permisos
  SISA solicitados para WS020.

## Contrato SISA a integrar

El servicio oficial REFEPS para consulta nominal de profesionales es WS020.

- REST: `https://sisa.msal.gov.ar/sisa/services/rest/profesional/obtener`
- SOAP: `https://sisa.msal.gov.ar/sisa/services/profesionalService`
- Criterios de consulta: codigo profesional, apellido, nombre o numero de documento.
- Resultado: profesional, codigo REFEPS y lista de matriculas con profesion,
  jurisdiccion, estado y especialidades.

WS020 no se debe modelar como una consulta directa por matricula sola: la consulta
nominal devuelve las matriculas que luego se comparan con el perfil profesional.

## Flujo objetivo

1. Consultar WS020 por DNI o codigo profesional con credenciales SISA.
2. Normalizar las matriculas devueltas.
3. Confirmar que exista una matricula del medico con estado habilitante y
   jurisdiccion/tipo esperados.
4. Guardar en AutaMedica el estado de validacion y evidencia auditable de la
   consulta, sin exponer credenciales ni payloads con PII fuera del backend.
5. Permitir emision solo con estado `valid` o excepcion administrativa `exempt`.

## Pendiente cuando llegue acceso

1. Definir secretos runtime para usuario/clave y base URL QA/produccion.
2. Crear adapter REFEPS que consulte WS020 por DNI/codigo y parse XML.
3. Registrar evidencia de validacion: fuente, fecha, criterio de consulta,
   matricula evaluada, resultado normalizado y error/quota si aplica.
4. Reemplazar el fallback de revision manual del perfil por la consulta WS020.
