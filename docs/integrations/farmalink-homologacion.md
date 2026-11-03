# Farmalink - Homologacion Receta Electronica

## Estado

- Catalogo revisado: `RecetaElectRest` v3.0.0 y OAuth token v1.0.1.
- Base de prueba: `https://test-servicios.farmalink.com.ar`.
- API receta: `/api/recetaElect/v3`.
- Token: `/api/oauth/token/generate`.
- Operaciones preparadas: `altaReceta`, `consultaReceta`, `bajaReceta`.
- Precondicion de emision: el prescriptor debe tener validacion profesional
  aceptada en AutaMedica (`profiles.sss_validation_status` `valid` o `exempt`).
- Emision AutaMedica: cuando `FARMALINK_ENABLED=true`, el servicio de emision intenta `altaReceta` antes de generar el PDF. Si Farmalink aprueba, guarda `vendor_name = "farmalink"` y `vendor_id = nroRecElectronica`, y el PDF imprime `RECETA FARMALINK` en el codigo de barras.
- Estado de homologacion externa: **NO ACREDITADA**. No existe confirmacion externa aportada por Farmalink para habilitar produccion. La frase anterior "completada" era una declaracion local no respaldada por acuse del proveedor.
- OAuth TEST: verificado en GitHub Actions el 03/11/2026, HTTP 200 y token recibido (sin registrar el token).
- altaReceta TEST: una sola solicitud con el ejemplo DEMO de SwaggerHub, usando entidad 7100, credencial 12345678 y fechas vigentes, termino en timeout sin numero de receta. No repetir la misma alta hasta conciliar con el proveedor.
- Conectividad TEST: GET /altaReceta -> 405 en 1,7 s; POST deliberadamente invalido sin paciente/medicamentos -> HTTP 400 en 11,3 s. Estas respuestas NO equivalen a homologacion.
- El 03/11/2026 se solicito a homologacionre@farmalink.com.ar conciliacion de la posible receta DEMO y confirmacion de idOrganizacion, puntoEmisor, canal tecnologico y aprobacion productiva.
- Produccion: mantener FARMALINK_ENABLED=false hasta alta aceptada, confirmacion formal de Farmalink, secretos productivos e integracion clinica validada.
- Las credenciales OAuth y de aplicacion se mantienen exclusivamente en secretos de runtime y no deben documentarse ni versionarse.

## Evidencia adicional de pruebas (03/11/2026)

| Componente | Prueba | Resultado |
| --- | --- | --- |
| Token OAuth TEST | POST /api/oauth/token/generate desde GitHub Actions | HTTP 200, token recibido |
| Alta demo (UNICA solicitud) | POST /api/recetaElect/v3/altaReceta con ejemplo oficial de SwaggerHub | Timeout tras ~22 segundos; estado remoto NO DETERMINADO |
| Rutas sin alteraciones | GET /api/recetaElect/v3/altaReceta con token | HTTP 405; ruta alcanzable |
| Alta con estructura deliberadamente invalida | POST con JSON sin paciente ni medicacion | HTTP 400; sin receta posible |
| Consulta de numero deliberadamente inexistente | POST /api/recetaElect/v3/consultaReceta | HTTP 200, codigo funcional 33: NUMERO DE RECETA INVALIDO (13,8 s) |
| Baja de receta | Solo tests unitarios con fetch simulado | No se cancelo ninguna receta externa |
| PDF/barcode y cliente Farmalink | Vitest con respuestas simuladas | 26 tests aprobados inicialmente; guardar ejecucion posterior para nuevas validaciones |

Evidencia: workflow [alta demo](https://github.com/ecucondorSA/Autamedica/actions/runs/41584218813), [consulta real no mutativa](https://github.com/ecucondorSA/Autamedica/actions/runs/41585851984), [test unitario](https://github.com/ecucondorSA/Autamedica/actions/runs/41586118934).

**Restricciones operativas:** No automatizar repeticion de altaReceta tras timeout, ni bajaReceta sin numero de receta confirmado y autorizacion de cancelacion; no activar Farmalink en produccion. El workflow de acceso TEST quedo en modo manual para evitar pruebas de red inesperadas.

**Pendientes con Farmalink:** confirmar existencia de receta de la transaccion DEMO sin respuesta; idOrganizacion y puntoEmisor efectivos; constancia de homologacion y credenciales productivas; dataset de medico real/test autorizado; y correccion de ambiguedades de OpenAPI. En particular, `bajaReceta.recElectronica.receta.nroRecElectronica` se define como numero en el esquema, pero el ejemplo publicado es una cadena. No cambiar formato de anulacion en produccion sin confirmacion del proveedor.

**P0 de idempotencia:** el flujo `issuePrescription` invoca `altaReceta` antes de persistir `vendor_id`. Si Farmalink acepta la solicitud y el cliente pierde respuesta, volver a emitir podria duplicar la receta. La solucion requiere reservar un intento persistente y bloquear reintentos por identificador de receta hasta conciliarlo; no se debe habilitar el servicio sin ese control y sus pruebas transaccionales.

## Contrato OAuth

La generacion del token usa headers:

```http
Authorization: Basic <base64 basicUser:basicPassword>
grant_type: PASSWORD
username: <oauth username>
password: <oauth password>
scope: Switch.RecetaElectRest
```

La API de receta usa:

```http
Authorization: Bearer <access_token>
content-type: application/json
```

## Variables

```bash
FARMALINK_ENABLED=false
FARMALINK_BASE_URL=https://test-servicios.farmalink.com.ar
FARMALINK_TOKEN_PATH=/api/oauth/token/generate
FARMALINK_RECETA_BASE_PATH=/api/recetaElect/v3
FARMALINK_GRANT_TYPE=PASSWORD
FARMALINK_SCOPE=Switch.RecetaElectRest
FARMALINK_OAUTH_USERNAME=
FARMALINK_OAUTH_PASSWORD=
FARMALINK_BASIC_USER=
FARMALINK_BASIC_PASSWORD=
FARMALINK_ORG_ID=
FARMALINK_ORG_TYPE=NMD
FARMALINK_PUNTO_EMISOR_ID=
FARMALINK_IP_ORIGIN=
FARMALINK_BROWSER_INFO=AutaMedica
FARMALINK_PRESCRIPTION_TYPE=
FARMALINK_HOMOLOGATION_COD_ENTIDAD=
FARMALINK_HOMOLOGATION_CREDENCIAL=
FARMALINK_HOMOLOGATION_PLAN=NO POSEE
FARMALINK_DEFAULT_PRODUCT_CODE=
FARMALINK_DEFAULT_DRUG_CODE=
FARMALINK_PRESCRIBER_DOCUMENT_NUMBER=
FARMALINK_PRESCRIBER_BIRTH_DATE=
FARMALINK_PRESCRIBER_CUIL=
FARMALINK_PRESCRIBER_SEX=
FARMALINK_PRESCRIBER_LICENSE_TYPE=MN
FARMALINK_PRESCRIBER_LICENSE_PROVINCE=C
```

No cargar en el repo las credenciales del catalogo ni las credenciales OAuth.

## Alta de receta

El mapper local arma `altaRecetaElectRq` con:

- `infoCabeceraRq`: `idOrganizacion`, `tipoOrganizacion`, `ipOrigen`, `infoBrowser`.
- `recElectronica.afiliado`: datos personales, documento, CUIL opcional, credencial `codEntidad/pan/plan`.
- `recElectronica.medico`: datos personales, documento, domicilio de atencion, matricula, REFEPS opcional.
- `detalleRecElectronica.item[]`: `cantidad`, `codProducto`, `codDroga`, `textoGenerico`, flags generico/recomendacion.

Farmalink responde aprobado con `respuesta.codigo = "00"` y `recElectronica.nroRecElectronica`. Ese numero debe guardarse como `vendor_id` con `vendor_name = "farmalink"` y mostrarse en el PDF como codigo de barras de farmacia. El CUIR de AutaMedica se conserva para verificacion interna y QR.

## Datos de homologacion en AutaMedica

El alta usa estos origenes de datos, en orden:

- `clinical_data.farmalink` de la receta, si existe.
- `patients.insurance_info.farmalink` o campos equivalentes de seguro, si existen.
- Variables `FARMALINK_HOMOLOGATION_*` para pruebas controladas.

Campos minimos para que `FARMALINK_ENABLED=true` no bloquee la emision:

- Organizacion: `FARMALINK_ORG_ID`, `FARMALINK_ORG_TYPE`, `FARMALINK_IP_ORIGIN`.
- Afiliado: `FARMALINK_HOMOLOGATION_COD_ENTIDAD`, `FARMALINK_HOMOLOGATION_CREDENCIAL`, `FARMALINK_HOMOLOGATION_PLAN`.
- Medicamento: `FARMALINK_DEFAULT_PRODUCT_CODE`, `FARMALINK_DEFAULT_DRUG_CODE`.
- Prescriptor: `FARMALINK_PRESCRIBER_DOCUMENT_NUMBER`, `FARMALINK_PRESCRIBER_BIRTH_DATE`.

## Archivos implementados

- `apps/web/src/lib/prescriptions/farmalink.types.ts`
- `apps/web/src/lib/prescriptions/farmalink.mapper.ts`
- `apps/web/src/lib/prescriptions/farmalink.client.ts`
- `apps/web/src/lib/prescriptions/pdf-prescription.service.ts`
- `apps/web/src/lib/prescriptions/issue-prescription.service.ts`

## Checklist operativo posterior a la homologacion

1. Mantener las variables OAuth en secretos del entorno, nunca en el repo.
2. Monitorear la generacion de tokens sin registrar credenciales ni datos sensibles.
3. Confirmar que cada `altaReceta` aprobada guarda `nroRecElectronica` como `vendor_id`.
4. Verificar que el PDF muestre el identificador Farmalink correspondiente.
5. Usar `consultaReceta` para conciliacion y soporte operativo cuando corresponda.
6. Ejecutar `bajaReceta` solo mediante el flujo autorizado y con auditoria.
7. Conservar request/response sanitizados como evidencia tecnica, sin exponer PII.
