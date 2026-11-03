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

## Repetición de pruebas pendientes — 03/11/2026

- **Alta DEMO, segundo intento independiente**: POST autenticado con el mismo fixture de SwaggerHub y un identificador de correlación distinto en `infoBrowser` (`AutaMedica-Test-c7db15b7b4`). Farmalink respondió **HTTP 504 Gateway Timeout en 30,6 s**, a pesar de aumentar el timeout del cliente a 85 s. Sin `nroRecElectronica`; resultado remoto incierto. No repetir para evitar duplicados. [Run](https://github.com/ecucondorSA/Autamedica/actions/runs/41587599039).
- **Tres POST negativos reales**: `altaReceta`, `consultaReceta`, `bajaReceta` con JSON deliberadamente incompleto y SIN datos de paciente, medicamentos ni receta: **HTTP 400 / error interno 5075** en los tres casos. Los rechazos de formato son correctos, pero **NO** homologan operaciones válidas. [Run](https://github.com/ecucondorSA/Autamedica/actions/runs/41587250781).
- **Baja real**: no ejecutada, porque no existe identificador de receta DEMO aprobado y confirmado por consulta. Está prohibido cancelar una receta de tercero o usar referencias inventadas para una baja.
- **Escalación a Farmalink**: enviado nuevo correo de seguimiento al hilo de `homologacionre@farmalink.com.ar` solicitando rastrear el 504 por etiqueta, confirmar si hubo altas DEMO creadas y suministrar parámetros de organización/canal de homologación.
- **Workflow de red**: después de cada prueba quedó en `workflow_dispatch`; sin ejecuciones mutativas en cada push de GitHub. No fusionar con main mientras haya casos P0 sin resolver.

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

**P0 de idempotencia corregido en la rama, sin despliegue:** `issuePrescription` reserva un intento persistente antes de `altaReceta`; timeout/504 no liberan la reserva. La reserva verifica médico, país AR de ambas partes, validación profesional y contenido clínico esperado; un trigger congela la receta reservada e impide afirmar validación Farmalink sin un recibo confirmado. La aprobación final depende del CI del commit exacto. No confundir esta protección con conciliación operativa o aprobación del proveedor.

## Parámetros oficiales recibidos el 03/11/2026 — homologación todavía pendiente

La respuesta de **Homologación Farmalink** al ticket SOL-3144 confirma:

- **idOrganizacion = 182** para el usuario de AutaMedica.
- **Omitir por completo `puntoEmisor`**, no enviarlo como objeto vacío ni con ID de ejemplo.
- **Datos exclusivos para nuevas pruebas en TEST:** `codEntidad=7110`, PAN `20123456786` y DNI `12345678`.
- Se requieren dos altas aprobadas y sus PDFs: una prescripción genérica (`generico=S`, sin marca comercial en PDF) y una prescripción de marca (`generico=N`, con el producto sugerido y marca en PDF). Cada PDF debe seguir el **Modelo Receta digital** del proveedor y las modalidades de prescripción oficiales.
- La respuesta confirma que observaron las pruebas, **pero no suministra ningún `nroRecElectronica` ni acredita la conciliación de las dos altas DEMO de las 02:30 y 03:05 ART**. Se conserva el bloqueo de nuevas altas hasta resolver la incertidumbre con evidencia del proveedor.
- Los códigos de medicamento/producto, identidad profesional de prueba y modelo exacto del PDF siguen sujetos a verificación con el contrato oficial; no presentar PDFs generados únicamente en modo mock como homologados.

La configuración del servidor debe tomar `FARMALINK_ORG_ID=182` del runtime y rechazar el antiguo ID `100`. Los campos heredados `puntoEmisor` se ignoran y no salen en el JSON transmitido. No activar producción, ni ejecutar scripts de alta/baja mientras falte conciliación. Ningún correo o PDF de homologación debe enviarse sin autorización expresa del responsable de AutaMedica.

## Evidencia real TEST — 03/11/2026 (sin homologación final de PDFs)

Dos `altaReceta` con datos DEMO aprobadas por Farmalink TEST, usando `idOrganizacion=182`, sin `puntoEmisor`, `codEntidad=7110` y PAN `20123456786`:

| Escenario | HTTP / código | nroRecElectronica | Evidencia |
| --- | --- | --- | --- |
| `generico=S` (sin marca) | `200 / 0` | `9600000421228` | [run 41703530442](https://github.com/ecucondorSA/Autamedica/actions/runs/41703530442) |
| `generico=N` (producto comercial sugerido) | `200 / 0` (`OK`) | `9600000421242` | [run 41704314290](https://github.com/ecucondorSA/Autamedica/actions/runs/41704314290) |

Se generaron PDFs de prueba con códigos de barras Code 128 que representan los números reales de receta, conservados como artefactos en los runs de GitHub Actions. Un intento previo de marca con código de producto `60763` fue rechazado con código funcional `30` (sin receta emitida). El segundo caso aprobado usa el código de producto `56800`, ya aceptado en la prueba genérica.

**Pendiente antes de enviar a Farmalink:** validar en el catálogo del proveedor cuál es la **marca comercial** real asociada a `codProducto=56800` y reflejarla en el PDF del caso `generico=N`. Validar el modelo visual oficial, datos/matrícula del prescriptor y autenticidad/firma. Los PDFs actuales están rotulados **TEST / no aptos para dispensar** y contienen médico/paciente sintéticos; no son recetas clínicas ni prueba de homologación visual aprobada. Tampoco está conciliado el destino de los dos intentos anteriores con `idOrganizacion=100` (timeout y 504).

No se enviaron correos y no hubo acciones sobre producción.

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
FARMALINK_ORG_ID=182
FARMALINK_ORG_TYPE=NMD
# puntoEmisor se omite para AutaMedica.
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


## Corrección clínica/documental de homologación — 03/11/2026

**Hallazgo P0**: Los dos números Farmalink TEST aceptados por la API no son recetas
de prednisolona. La consulta autenticada de ambos números en
[GitHub Actions 41717111174](https://github.com/ecucondorSA/Autamedica/actions/runs/41717111174)
devolvió:
- `droga.codigo=01033`, `droga.nombre=GLICOLICOAC.ASOC.`.
- `producto.codProducto=56800`, `producto.nombre=ESFUMEL blanqueadora cr. x 20 g`.
- `producto.codBarras=7798095330586`, `codTroquel=9956800`.
- `referenciaRx.cantidad=1`.

**Números emitidos en Farmalink TEST, no reenviar altas**:
- `generico=S`: `9600000421228`. En el PDF debe mostrarse el principio activo
  `GLICOLICOAC.ASOC.` sin marca comercial.
- `generico=N`: `9600000421242`. En el PDF debe mostrarse
  `GLICOLICOAC.ASOC.` con sugerencia de marca `ESFUMEL blanqueadora cr. x 20 g`,
  con el principio activo visualmente predominante.

Los PDFs anteriores con «PREDNISOLONA» son **incorrectos y no se deben remitir**.
Los PDFs regenerados en la conversación siguen siendo **documentos TEST técnicos no
homologables de forma definitiva**, porque no tienen CUIR acreditado y el fixture
usa `DEMO DEMO` como prescriptor sin firma electrónica/digital. No convertir el
número Farmalink en CUIR; son identificadores distintos.

**Bloqueos verificables para la homologación**:
1. Obtener de DNSISA/ReNaPDiS los códigos realmente asignados a plataforma y
   repositorio para componer el CUIR conforme a Res. 2214/2025, Anexo IV;
   el generador de código numérico local por sí solo no acredita registro.
2. Usar un médico de TEST cuya identidad, matrícula y firma electrónica/digital
   puedan acreditarse; el fixture `DEMO DEMO` no es una firma real.
3. Confirmar con Farmalink si acepta medicamento/diagnóstico DEMO o exige
   un caso clínico coherente; el ejemplo antiguo usa diagnóstico `I20.9`
   junto a un producto de crema blanqueadora.
4. Antes de emitir nuevas recetas, confirmar modalidad de prueba y
   reconciliar los intentos previos ambiguos. No repetir automáticamente un alta.

La edición de los PDFs no generó una nueva alta, no realizó una baja, no afectó
producción y no envió correos. Cambios de prevención en el PR #655: fixture
de droga corregido, rechazo de modo N sin nombre comercial y leyenda de firma
neutral hasta que pueda comprobarse su validez.
