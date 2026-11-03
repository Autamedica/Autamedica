# Farmacias AR/BR — candidato de liberación

Actualizado: 2026-11-03. PR existente: https://github.com/ecucondorSA/Autamedica/pull/646.
**No fusionado ni desplegado por este trabajo. No equivale a un circuito clínico habilitado.**

## 1. Estado general y método de cierre

Separar siempre tres resultados: código implementado, prueba ejecutada y operación real habilitada.
Los controles automatizados de referencia de `ac9ac3b` aprobaron TypeScript/build, lint,
unitarias, E2E, Database & RLS, reproducción completa y concurrencia independiente.
El control adicional de tipos Edge detectó un error de `beforeSend` en Sentry;
su corrección debe pasar nuevamente en el HEAD que se revise.

El cierre técnico se calcula sobre criterios binarios con evidencia del mismo HEAD.
P0: CI completo; aislamiento de jurisdicción; autorización/RLS; transacciones y
concurrencia; preservación al migrar tablas ocupadas; habilitación profesional con
evidencia; emisión/verificación autorizada; QR/aviso/aceptación/consulta completos.
Un criterio sin prueba completa no cuenta como cerrado, aunque tenga código.
P1: inventario histórico; staging; métricas por país; alertas; liberación y recuperación
verificadas. Una prueba sintética no certifica un proveedor ni una matrícula real.

## 2. Correcciones implementadas

- `createAstroAdminClient` consume el `Database` exportado por `@autamedica/types`,
  desde `packages/types/src/supabase/database.types.ts`; actualizar otra copia no
  corregía el tipado web. Se sincronizan ambas copias pertinentes.
- Se elimina la doble declaración de `doctor` en aclaraciones y se mantienen las
  comprobaciones de receta, paciente, prescriptor, institución y operador.
- PostgreSQL deriva el país de la orden de la receta y el del operador de su
  establecimiento. Ningún navegador, documento o teléfono determina jurisdicción.
- Un país histórico desconocido no se rellena automáticamente. Las filas anteriores
  quedan con país NULL, retenidas e invisibles para operaciones autenticadas ordinarias.
- Nuevas escrituras sin país válido, cambios de identidad clínica, elevación de
  verificación por farmacia y nuevas órdenes que eludan una orden histórica se bloquean.
- Los eventos de entrega son inmutables. Un bloqueo de la orden serializa cantidades;
  evento, estado de orden, estado de receta y auditoría se confirman juntos.
- El UUID de entrega se conserva en reintentos y se compara con el contenido original.
- Aclaración, transición de estado y auditoría se confirman en la misma transacción.
- Las mutaciones conservan el JWT real; las lecturas privilegiadas comprueban identidad,
  rol vigente, actividad, asignación y jurisdicción. No basta un rol antiguo en el JWT.
- Se retiran las rutas públicas Gen 1 de creación, estado y cancelación (HTTP 410).
  `pharmacy_dispatch_requests` es la cola canónica; se conserva el historial Gen 1.
- Los errores públicos y la telemetría no deben incluir filas SQL fallidas ni contenido
  clínico. Push exige credencial privada antes de procesar el cuerpo; una clave anon
  o el indicador `pharmacy_dispatch_incoming` no autorizan envíos.

## 3. Argentina

Lectura de producción: 27 fichas AR, 27 vinculadas a cuentas, 25 activas; 5 pacientes
con país AR y 1.804 pacientes todavía sin país. Son conteos de registros, no prueba
de disponibilidad, habilitación profesional o demanda clínica.

El QR solicita cuenta del paciente y selección explícita de país cuando falta.
Si el establecimiento y el paciente discrepan, se bloquea el ingreso y se ofrece
el acceso correspondiente. El endpoint toma el país persistido y comprueba actividad.
Las pruebas de API cubren ausencia de sesión/país y los cruces AR↔BR.

La existencia de un PDF, CUIR, hash o estado `signed` no acredita autorización del
proveedor ni verificación criptográfica. Las confirmaciones clínicas y la evidencia
del documento exacto son requisitos distintos para una dispensación operativa.

## 4. Brasil

Lectura de producción: 683 fichas BR, solo 6 vinculadas a cuentas y activas;
677 fichas importadas sin usuario no son médicos incorporados ni disponibles.
Hay 26 fichas vinculadas activas con país todavía desconocido, separadas de AR/BR.

El QR comercial atribuye el origen de una teleconsulta; no otorga acceso clínico
ni autorización de dispensación al comercio. Las tablas de atribución de socios
añadidas por otro trabajo deben conservarse y no confundirse con farmacias habilitadas.

Cloudflare `autamedica-web`: Memed tiene nombres de credenciales configurados y
`MEMED_RX_ENABLED=false` en producción. No se expusieron valores de claves ni se
activó la integración. El emisor PDF interno no debe ser un reemplazo de Memed;
el servicio web rechaza ese fallback para BR.

El fixture BR usa personas, credenciales y evidencia de prueba completamente
sintéticas, roles autenticados y rollback. Exige comprobar estados y auditoría,
no solo una respuesta HTTP. Su resultado válido es el del CI del HEAD revisado.

## 5. Seguridad y alcance de las pruebas

`pharmacy_country_isolation.sql` ejercita actores autenticados reales, no únicamente
el rol postgres. `test-pharmacy-concurrency.sh` usa conexiones psql independientes:
una sola reclamación; entrega competidora sin superar cantidad; UUID repetido sin
segunda entrega; consistencia de receta, orden, evento y auditoría.

La prueba de migración histórica crea filas antes de aplicar las migraciones,
incluye duplicados históricos y siete eventos, compara los registros originales y
comprueba cuarentena y bloqueo de reactivación/reclasificación/borrado privilegiados.
Los scripts destructivos de prueba exigen CI, aislamiento, base vacía y loopback
54322. Nunca deben ejecutarse contra staging alojado o producción.

La tabla privada de evidencia no tiene un escritor de aplicación habilitado.
Su contenido sintético en una prueba no demuestra firmas o proveedores reales.
La confirmación del prescriptor y el verificador autorizado deben conectarse y
probarse antes de presentar la dispensación real como operativa.

## 6. Datos históricos: corrección de la auditoría inicial

La consulta actual identifica **2 farmacias, 2 farmacéuticos, 33 órdenes y 7 eventos**,
con órdenes de abril–junio de 2026. La premisa anterior de tablas vacías era incorrecta.
No se deben borrar, reclasificar ni reactivar estas filas para instalar el cambio.

Hay 101 recetas: 72 AR con ficha de prescriptor BR (47 borradores, 22 enviadas y
3 marcadas firmadas); 24 AR/AR; 5 BR/BR. Las 72 discrepancias requieren revisión
individual, sin convertir países por nacionalidad o por la ficha actual del médico.

Se analizaron los campos de los 23 PDF asociados a esas 72 discrepancias: ninguno
contiene un campo de firma PDF `/FT /Sig`. Se conservaron sus SHA-256 actuales en
el inventario privado; no se modificaron bytes ni se acreditó una firma externa.
Las 7 recetas marcadas como totalmente dispensadas **sí tienen eventos estructurados
vinculados**. No corresponde repetir el hallazgo anterior de ausencia de eventos.

Se conservan 153 solicitudes dispatch y 34 solicitudes Gen 1 sin país.
`scripts/db/pharmacy-reconciliation.sql` produce un inventario de solo lectura por
identificador, sin diagnósticos, nombres, URLs firmadas ni correcciones automáticas.
Los datos exportados no se publican en el repositorio.

## 7. CI, staging y liberación

Cada gate debe pertenecer al mismo SHA: lint, TypeScript/build, unitarias, E2E,
tipos Edge, Database & RLS, replay y preservación histórica. El PR permanece borrador
mientras falten pruebas operativas y revisión clínica/regulatoria.

Staging `qqevyncgnanpmvauehys` tenía un fixture mínimo de perfiles y luego recibió
tablas de atribución QR por otro trabajo. No se reinicia ese proyecto ni se elimina
su esquema. Cualquier reconstrucción debe preservar esos cambios, usar migraciones
versionadas y datos sintéticos, y configurar las integraciones externas en sandbox.
La configuración preview de Pages no tenía una clave administrativa de staging;
la prueba web completa exige configurar el acceso correcto, sin usar producción.

Orden de liberación: respaldo y restauración comprobados; esquema compatible y
cuarentena; Edge y web del SHA aprobado; pruebas sintéticas AR/BR; comprobación de
proveedores y credenciales; despliegue por etapas; verificación posterior.
Un rollback de aplicación conserva las restricciones y la historia en base de datos;
no borra columnas, evidencias o eventos para que una versión antigua continúe operando.

## 8. Pendientes que impiden declarar producción corregida

- CI completo del último HEAD, incluida compatibilidad con tablas ocupadas y BR positivo.
- Staging alineado, credenciales de prueba y recorrido web QR completo con aceptación,
  llamada, cierre, notificación y documentación.
- Evidencia auténtica de habilitación de profesionales; actividad y tiers no la sustituyen.
- Definición versionada del helper de push referido por el matcher, consumo de cola y
  prueba del aviso oportuno al teléfono. No simular el helper para declarar ese flujo aprobado.
- Escritor/verificador autorizado de evidencia de recetas y superficie de confirmación
  del prescriptor, con certificación o autorización externa cuando corresponda.
- Revisión clínica individual de documentos históricos, métricas por país, alertas y
  comprobación del despliegue real. Responsables: ingeniería, dirección clínica y operador
  de las integraciones, respectivamente; no se inventan aprobaciones ni plazos externos.
