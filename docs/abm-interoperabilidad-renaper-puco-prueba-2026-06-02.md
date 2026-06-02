# Prueba ABM Interoperabilidad - RENAPER y PUCO

Fecha de prueba: 2026-06-02  
Sistema: AutaMedica  
Ambiente: Produccion  
Bus: `https://bus.msal.gob.ar`  
Servicios probados: Personas RENAPER y Coberturas PUCO

## Resultado ejecutivo

Las credenciales NO FHIR de AutaMedica funcionan correctamente en produccion.

- Login de aplicacion NO FHIR: exitoso (`200`)
- Consulta Personas RENAPER: exitosa (`200`)
- Consulta Coberturas PUCO: sin contenido (`204`)

No se imprimieron ni se guardaron tokens, passwords ni claves secretas.

## Parametros usados

```text
nroDocumento: 95466020
idSexo: 2
```

Segun la guia oficial:

- `1`: femenino
- `2`: masculino
- `3`: indeterminado, disponible para Personas RENAPER

## Login NO FHIR

Endpoint oficial:

```http
POST https://bus.msal.gob.ar/masterfile-federacion-service/api/usuarios/aplicacion/login
```

Body esperado por la guia:

```json
{
  "nombre": "{{appName}}",
  "clave": "{{appPassword}}",
  "codDominio": "{{domainCode}}"
}
```

Resultado:

```json
{
  "status": 200,
  "ok": true,
  "token_recibido": true
}
```

Campos devueltos por el login:

```text
idUsuario
tipo
estado
mail
cantidadLogin
fechaUltimoLogin
fechaAlta
fechaBaja
fechaUltimaModificacion
telefono
token
appRazonSocial
appRespNombre
appRespApellido
appRespTipoDoc
appRespDoc
codigoRefes
url
sector
```

El valor de `token` fue omitido intencionalmente.

## Personas RENAPER

Endpoint oficial:

```http
GET https://bus.msal.gob.ar/masterfile-federacion-service/api/personas/renaper?nroDocumento=95466020&idSexo=2
```

Headers oficiales:

```http
token: <token NO FHIR>
codDominio: https://autamedica.com
```

Resultado:

```json
{
  "status": 200,
  "ok": true
}
```

Datos obtenidos:

```json
{
  "apellido": "MARQUES DA ROSA",
  "nombres": "EDUARDO",
  "fechaNacimiento": "1994-09-10",
  "cuil": "0",
  "sexo": "M",
  "numeroDocumento": "95466020",
  "provincia": "CIUDAD_DE_BUENOS_AIRES",
  "pais": "ARGENTINA",
  "mensaf": "Sin Aviso de Fallecimiento",
  "origenf": "RENAPER",
  "codigoError": 99,
  "descripcionError": "DNI/PAS Firmado",
  "fechaConsulta": "02-06-2026",
  "foto": null
}
```

## Campos posibles segun la guia RENAPER

La guia oficial muestra que una respuesta RENAPER puede incluir estos campos:

| Campo                       | Resultado en esta prueba                         |
| --------------------------- | ------------------------------------------------ |
| `idtramiteprincipal`        | No mostrado en la salida resumida                |
| `idtramitetarjetareimpresa` | No mostrado en la salida resumida                |
| `ejemplar`                  | No mostrado en la salida resumida                |
| `vencimiento`               | No mostrado en la salida resumida                |
| `emision`                   | No mostrado en la salida resumida                |
| `apellido`                  | `MARQUES DA ROSA`                                |
| `nombres`                   | `EDUARDO`                                        |
| `fechaNacimiento`           | `1994-09-10`                                     |
| `cuil`                      | `0`                                              |
| `calle`                     | No mostrado por minimizacion de datos personales |
| `numero`                    | No mostrado por minimizacion de datos personales |
| `piso`                      | No mostrado por minimizacion de datos personales |
| `departamento`              | No mostrado por minimizacion de datos personales |
| `cpostal`                   | No mostrado por minimizacion de datos personales |
| `barrio`                    | No mostrado por minimizacion de datos personales |
| `monoblock`                 | No mostrado por minimizacion de datos personales |
| `ciudad`                    | No mostrado por minimizacion de datos personales |
| `municipio`                 | No mostrado por minimizacion de datos personales |
| `provincia`                 | `CIUDAD_DE_BUENOS_AIRES`                         |
| `pais`                      | `ARGENTINA`                                      |
| `mensaf`                    | `Sin Aviso de Fallecimiento`                     |
| `origenf`                   | `RENAPER`                                        |
| `fechaf`                    | No mostrado en la salida resumida                |
| `foto`                      | `null`                                           |
| `sexo`                      | `M`                                              |
| `numeroDocumento`           | `95466020`                                       |
| `fechaConsulta`             | `02-06-2026`                                     |
| `idciudadano`               | No mostrado en la salida resumida                |
| `descripcionError`          | `DNI/PAS Firmado`                                |
| `codigoError`               | `99`                                             |

## Coberturas PUCO

Endpoint oficial:

```http
GET https://bus.msal.gob.ar/masterfile-federacion-service/api/personas/cobertura?nroDocumento=95466020&idSexo=2
```

Headers oficiales:

```http
token: <token NO FHIR>
codDominio: https://autamedica.com
```

Resultado:

```json
{
  "status": 204,
  "ok": true,
  "result": null
}
```

Interpretacion: PUCO no devolvio coberturas para el documento y sexo consultados.

Segun la guia, cuando hay coberturas el servicio devuelve una lista con esta forma:

```json
[
  {
    "rnos": "500807",
    "cobertura": "INSTITUTO NACIONAL DE SERVICIOS SOCIALES PARA JUBILADOS Y PENSIONADOS",
    "servicio": "PUCO",
    "fechaConsulta": null
  }
]
```

## Conclusiones

1. AutaMedica ya puede autenticarse contra el Bus NO FHIR productivo.
2. AutaMedica ya puede consultar Personas RENAPER con DNI y sexo registral.
3. AutaMedica ya puede consultar Coberturas PUCO con DNI y sexo registral.
4. En esta prueba, RENAPER encontro la persona y PUCO no informo cobertura.
5. Esta integracion debe ejecutarse exclusivamente desde backend, nunca desde UI.
6. La UI de AutaMedica debe mostrar esta informacion de forma humana y minimizada, evitando exponer domicilio, foto, tokens o detalles tecnicos al paciente.

## Fuentes oficiales usadas

Archivos oficiales descargados desde el portal ABM Dominios:

- `https://dominios.msal.gob.ar/assets/resources/personas/Gu%C3%ADa%20t%C3%A9cnica%20_Personas_%20%28RENAPER%29%20-%20OCT2025.pdf`
- `https://dominios.msal.gob.ar/assets/resources/personas/RENAPER-PROD%28OCT.2025%29.postman_collection.json`
- `https://dominios.msal.gob.ar/assets/resources/coberturas/Gu%C3%ADa%20t%C3%A9cnica%20_Coberturas_%20%28PUCO%29%20-%20OCT2025.pdf`
- `https://dominios.msal.gob.ar/assets/resources/coberturas/COBERTURAS_PUCO-PROD%28OCT.2025%29.postman_collection.json`
