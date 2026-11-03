# Farmalink — conciliación segura y prevención de duplicados

Estado al 03/11/2026: **OAuth Test aprobado**. Dos intentos de `altaReceta` con fixture público DEMO finalizaron sin `nroRecElectronica`: timeout de 22 s y HTTP 504 Gateway Timeout a los 30,6 s. **No se puede afirmar que Farmalink no los haya registrado.** No se realizó baja real.

## Identificadores de prueba para soporte

- Entidad DEMO autorizada: `codEntidad=7100`; PAN `12345678`.
- Primer intento: [run 41584218813](https://github.com/ecucondorSA/Autamedica/actions/runs/41584218813), cerca de las **02:30 ART** del 03/11/2026; petición del ejemplo oficial de SwaggerHub.
- Segundo intento: [run 41587599039](https://github.com/ecucondorSA/Autamedica/actions/runs/41587599039), etiqueta `AutaMedica-Test-c7db15b7b4`, cerca de las **03:05 ART** del 03/11/2026, `HTTP 504`.
- Farmalink: solicitud formal de rastreo enviada al hilo `homologacionre@farmalink.com.ar`, ticket **SOL-3144**.
- No incluir ni reenviar las contraseñas OAuth ni los access tokens en correos o reportes.

El método público `consultaReceta` requiere un `nroRecElectronica`. **No permite buscar por etiqueta ni recuperar un número que Farmalink nunca devolvió.** La conciliación de los dos intentos exige evidencia del backend del proveedor o un identificador suministrado por su equipo.

## Estados del circuito de producción (implementación PR #652)

| Estado | Significado | Nueva alta automática |
| --- | --- | --- |
| sin reserva | Todavía no se transmitió; la API intenta una reserva atómica | Permitida una vez |
| `reserved` | La reserva durable se grabó antes de iniciar HTTP | Bloqueada |
| `unknown` | Error/timeout/504 o resultado externo sin certeza | Bloqueada |
| `rejected` | Rechazo explícito registrado por Farmalink | Bloqueada hasta revisión |
| `confirmed` | Respuesta positiva con `nroRecElectronica` guardada | Bloqueada |

La tabla `public.farmalink_issue_attempts` tiene **clave primaria `prescription_id`**, reserva única y hash SHA-256 de la solicitud, sin almacenar datos clínicos ni secretos de OAuth. `claim_farmalink_issue` y `record_farmalink_issue` se exponen exclusivamente al rol de servidor `service_role`; validan el médico que inició la emisión y la jurisdicción AR. Ninguna operación SQL libera automáticamente una reserva, incluso tras fallo HTTP.

## Pasos de conciliación al obtener respuesta de Farmalink

1. Corroborar ambiente **TEST**, fecha, etiqueta de correlación y código de entidad con la traza oficial. Anotar referencias del proveedor y resultado de cada solicitud.
2. Si Farmalink confirma una receta emitida, recuperar el número real y ejecutar `consultaReceta` **sin anular nada** para validar que corresponde al intento DEMO. No utilizar números tomados de ejemplos Swagger o de terceros como evidencia.
3. Para producción, si existe una tentativa en estado `unknown` o `reserved`, un operador autorizado debe contrastar el número y paciente/medicamento en el canal privado del proveedor antes de cualquier regularización. **No cambiar estados de base manualmente sin registro de auditoría y verificación clínica.**
4. Si el proveedor confirma inequívocamente que no creó ninguna receta, conservar los antecedentes del intento y definir un procedimiento de nueva emisión autorizado por responsable clínico. **No borrar filas de intentos ni reiniciar automáticamente.**
5. Solo después de conciliar altas, validar una receta test aprobada, consulta, baja controlada, PDF/código de barras y confirmación de homologación se podrá evaluar habilitar `FARMALINK_ENABLED=true`.

## Validación del parche antes de despliegue

- Ejecutar migraciones en **base descartable**; verificar RLS y privilegios.
- Ejecutar `supabase/tests/farmalink_once_only_issue.sql`: reserva primera, doble intento bloqueado, médico ajeno denegado, persistencia de estado `unknown` y ausencia de EXECUTE para roles browser.
- Ejecutar `apps/web/src/lib/prescriptions/farmalink.issue-gate.test.ts` más regresiones PDF/mapper/cliente.
- Mantener PR en borrador hasta que los jobs de build, typecheck, SQL y seguridad estén en verde y haya revisión técnica.
- Antes de despliegue: migración **primero**, aplicación después; si RPC no está disponible el flujo debe fallar sin llamar Farmalink.
