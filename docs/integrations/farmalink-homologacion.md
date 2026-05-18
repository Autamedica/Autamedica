# Farmalink - Homologacion Receta Electronica

## Estado

- Catalogo revisado: `RecetaElectRest` v3.0.0 y OAuth token v1.0.1.
- Base de prueba: `https://test-servicios.farmalink.com.ar`.
- API receta: `/api/recetaElect/v3`.
- Token: `/api/oauth/token/generate`.
- Operaciones preparadas: `altaReceta`, `consultaReceta`, `bajaReceta`.
- Bloqueo actual: faltan credenciales OAuth/aplicacion de Farmalink Seguridad.

## Contrato OAuth

La generacion del token usa headers:

```http
Authorization: Basic <base64 basicUser:basicPassword>
grant_type: PASSWORD
username: <oauth username>
password: <oauth password>
scope: Switch.RecetaElectRestV3
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
FARMALINK_SCOPE=Switch.RecetaElectRestV3
FARMALINK_OAUTH_USERNAME=
FARMALINK_OAUTH_PASSWORD=
FARMALINK_BASIC_USER=
FARMALINK_BASIC_PASSWORD=
FARMALINK_ORG_ID=
FARMALINK_ORG_TYPE=NMD
FARMALINK_PUNTO_EMISOR_ID=
```

No cargar en el repo las credenciales del catalogo ni las credenciales OAuth.

## Alta de receta

El mapper local arma `altaRecetaElectRq` con:

- `infoCabeceraRq`: `idOrganizacion`, `tipoOrganizacion`, `ipOrigen`, `infoBrowser`.
- `recElectronica.afiliado`: datos personales, documento, CUIL opcional, credencial `codEntidad/pan/plan`.
- `recElectronica.medico`: datos personales, documento, domicilio de atencion, matricula, REFEPS opcional.
- `detalleRecElectronica.item[]`: `cantidad`, `codProducto`, `codDroga`, `textoGenerico`, flags generico/recomendacion.

Farmalink responde aprobado con `respuesta.codigo = "00"` y `recElectronica.nroRecElectronica`. Ese numero debe guardarse como `vendor_id` con `vendor_name = "farmalink"` y mostrarse en el PDF como codigo de barras de farmacia. El CUIR de AutaMedica se conserva para verificacion interna y QR.

## Archivos implementados

- `apps/web/src/lib/prescriptions/farmalink.types.ts`
- `apps/web/src/lib/prescriptions/farmalink.mapper.ts`
- `apps/web/src/lib/prescriptions/farmalink.client.ts`
- `apps/web/src/lib/prescriptions/pdf-prescription.service.ts`

## Checklist cuando Farmalink entregue credenciales

1. Cargar variables OAuth en el entorno de staging, no en el repo.
2. Validar `generateAccessToken()` contra test.
3. Ejecutar `altaReceta` con los datos de homologacion recibidos por correo.
4. Confirmar que `nroRecElectronica` queda guardado como `vendor_id`.
5. Regenerar/emitir PDF y verificar que el codigo de barras muestre `RECETA FARMALINK`.
6. Ejecutar `consultaReceta` con `codEntidad`, `pan` y `nroRecElectronica`.
7. Ejecutar `bajaReceta` solo sobre una receta de prueba acordada.
8. Enviar a Farmalink evidencias: request/response sanitizados, PDF y numero de receta.
