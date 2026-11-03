# Memed Brasil: verificación de homologación con médico DEMO propio

Fecha: **03/11/2026**, zona horaria Brasilia. Ambiente exclusivamente `https://integrations.api.memed.com.br/v1`, con credenciales de prueba fijas que el proceso descarga en tiempo de ejecución de la documentación oficial de Memed. **Producción no contactada ni modificada**.

## Evidencias observadas (GitHub Actions)

| Control | Evidencia | Resultado |
|---|---|---|
| Credenciales API homologación | run 41739999221 | `GET check-key` HTTP 200, `chave-valida` |
| Intento con médico DEMO genérico | run 41740122044 | `POST usuarios` HTTP 400, `Board` |
| Intento con médico ejemplo documental compartido | run 41740255374 | `POST usuarios` HTTP 400, `Board` |
| Validación CFM doctor ejemplo | run 41740654820 | `POST validate-board` HTTP 200, `approved=true`, `validated=true`; esquema real difiere del ejemplo en docs |
| Consulta del doctor ejemplo por CPF | run 41740829920 | HTTP 200 pero **external_id ajeno a AutaMedica**; no usar token ajeno |
| Médico ficticio propio de AutaMedica, CRM y CPF de prueba únicos | run 41741052102 | CFM test HTTP 200 aprobado, GET previo HTTP 404, POST registro HTTP **201**, token privado recibido |
| Consulta de médico propio posterior | run 41741709381 | GET HTTP 200; registro propio y token presentes, CRM/UF coincidentes desde objeto `board` |

## Hallazgo de compatibilidad

En `GET usuarios/{CPF}`, el proveedor puede devolver `attributes.crm=null`, `attributes.uf=null` y el registro profesional vigente en `attributes.board`: `board_number`, `board_state`, `board_code`. La versión anterior de `MemedService.assertMemedDoctorMatch` exigía `attributes.crm` / `attributes.uf` y rechazaba un médico que Memed sí reconocía. Ahora la comparación de todos los identificadores se hace sobre las representaciones disponibles, sin permitir conflictos entre ellas ni aceptar otro `external_id` retornado.

El script `scripts/memed-homologation-smoke.mjs` está preparado para operar en modo **solo lectura** después del registro: no se repetirán altas automáticamente por cada ejecución del workflow.

## Paciente de prueba, prescripción y PDF

- El ensayo contractual interno `memed-demo-e2e.test.ts` emplea los endpoints de AutaMedica con una base en memoria y un proveedor **interceptado**; no demuestra emisión real.
- El navegador real de Memed debe demostrar que `setPaciente` acepta paciente DEMO y permite abrir el módulo con el token del médico DEMO. Ejecución separada `memed-homologation-browser.yml`.
- **No considerar completada la emisión de recetas ni la firma ICP-Brasil** hasta disponer de un ID de prescripción real en Memed test y verificación del documento obtenido desde el proveedor.
- No comunicar los datos de ningún documento DEMO como firma profesional, atestado o receta válida para dispensar.

## Seguridad

No se guardan tokens, API keys, CPFs reales, fechas privadas o historias clínicas en el repositorio ni los logs. No se cambió `MEMED_RX_ENABLED=false` ni ninguna variable de producción. Todas las identidades de prueba utilizadas en AutaMedica son ficticias; la prueba de médico compartido únicamente consultó su estado y **no reutilizó su token**.
