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


## Continuación de cierre documental (bloqueo API; 04/11/2026 UTC)

- La documentación oficial indica explícitamente que una prescripción **no puede emitirse vía REST**; solo el módulo web emite, y el evento `prescricaoImpressa` identifica una emisión.
- Flujo adicional en PR #664: `newPrescription` + `addItem` con HTML, escucha de evento, distinción entre comando resuelto y receta real, preflight de disponibilidad, historia y verificador read-only de documento en `scripts/memed-homologation-artifact-check.mjs`.
- El verificador **no genera** recetas, firma ni PDFs. Únicamente comprueba que el historial contenga un ID de la prescripción del paciente DEMO, consulta el enlace digital y valida que el documento obtenido del proveedor tenga contenido PDF y huella SHA-256. Una huella de PDF **no verifica** la firma criptográfica.
- [GitHub Actions 41758206144](https://github.com/ecucondorSA/Autamedica/actions/runs/41758206144): `check-key` devolvió HTTP **503** a las 02:03 UTC del 04/11/2026; el navegador fue omitido. **No** hay ID, PDF ni firma verificados.
- Como Memed está indisponible, el test HTML con `addItem` y el verificador PDF **no han podido completarse**, y el PR permanece en borrador. No se cambió producción.
- Las claves de test vienen de la documentación pública oficial. No copiar nunca los secretos de producción ni tokens de médico/paciente a logs o archivos.

**Criterios de cierre:** (a) `check-key` HTTP 200; (b) médico DEMO autenticado; (c) paciente DEMO + item realmente presente en editor; (d) evento `prescricaoImpressa` + nueva receta en historial Memed; (e) PDF genuino recuperado; (f) estado de firma informado como **no verificado** hasta prueba criptográfica independiente. No declarar homologación completa antes de los criterios verificables.
