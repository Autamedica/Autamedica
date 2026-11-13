# Farmalink — conciliación segura y prevención de duplicados

Estado al 03/11/2026: **OAuth Test aprobado**. Dos intentos de `altaReceta` con fixture público DEMO finalizaron sin `nroRecElectronica`: timeout de 22 s y HTTP 504 Gateway Timeout a los 30,6 s. **No se puede afirmar que Farmalink no los haya registrado.** No se realizó baja real.

## Identificadores de prueba para soporte

- Datos usados **en las pruebas anteriores** de SwaggerHub, no en la nueva homologación: `codEntidad=7100`; PAN `12345678`; `idOrganizacion=100`. No reutilizar estos datos.
- Primer intento: [run 41584218813](https://github.com/ecucondorSA/Autamedica/actions/runs/41584218813), cerca de las **02:30 ART** del 03/11/2026; petición del ejemplo oficial de SwaggerHub.
- Segundo intento: [run 41587599039](https://github.com/ecucondorSA/Autamedica/actions/runs/41587599039), etiqueta `AutaMedica-Test-c7db15b7b4`, cerca de las **03:05 ART** del 03/11/2026, `HTTP 504`.
- Farmalink: solicitud formal de rastreo enviada al hilo `homologacionre@farmalink.com.ar`, ticket **SOL-3144**.
- No incluir ni reenviar las contraseñas OAuth ni los access tokens en correos o reportes.

**Respuesta oficial de Farmalink del 03/11/2026, 15:42 ART:** `idOrganizacion=182`; omitir `puntoEmisor`; utilizar para nuevas pruebas autorizadas la entidad `7110` y credencial `20123456786` (DNI `12345678`). Solicitan PDFs de receta genérica (`generico=S`) y receta de marca (`generico=N`). Aunque Farmalink indica que observó las pruebas, **no confirma el estado ni el número de las dos altas previas**. Por tanto, su conciliación sigue pendiente y los scripts de alta permanecen bloqueados. Ningún correo debe enviarse sin autorización del usuario.

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


## Auditoría independiente de la rama — 03/11/2026

- La firma de reserva es `claim_farmalink_issue(uuid,text,uuid,jsonb)`: el último argumento es la copia de `clinical_data` leída por el servidor, comparada bajo bloqueo de fila. El overload anterior de tres argumentos se elimina para impedir eludir esa comprobación.
- La reserva requiere médico y paciente activos de AR, perfil médico activo con estado `valid`, REFEPS y domicilio profesional. Una exención genérica no basta para Farmalink.
- El contenido clínico, paciente, médico y país quedan bloqueados después de la reserva. Solo se permite guardar `vendor_name=farmalink` con un intento confirmado, mismo número y código funcional `00/0`.
- CI ejecuta conexiones `psql` concurrentes contra Supabase local descartable. No son mocks de unicidad. Incluye reinicio del proceso cliente, fallo de persistencia, estado incierto, permisos y casos AR/BR.
- La suite PDF renderiza una receta sintética y decodifica su Code 128 con Poppler y ZBar, independientemente del encoder.
- El mapper rechaza cantidades no enteras/positivas, fechas inexistentes o invertidas e identificadores numéricos inválidos. La matrícula sale del registro del médico, sin reemplazos de configuración.
- El circuito Farmalink rechaza pacientes externos representados por otro registro y recetas de varios medicamentos mientras no exista un circuito PDF/mapping completo para esos casos. No emite una receta parcial.
- El cliente HTTP usa un límite de 30 segundos y no retransmite tras errores. El workflow manual de red ejecuta únicamente OAuth; no alta ni baja mientras las dos DEMO sigan sin conciliar.

### Requisitos todavía incompletos: no habilitar producción

1. **Conciliación funcional auditada:** `record_farmalink_issue` solo finaliza `reserved`. No permite transformar `unknown` en `confirmed`, ni liberar un intento. No existe todavía endpoint/herramienta de conciliación con identidad del operador, evidencia del proveedor y comparación completa de paciente/medicación. No usar un UPDATE manual para suplirlo. Falta confirmar el contrato de consulta y los números de ambas DEMO con Farmalink.
2. **Recuperación posterior a aprobación:** `regenerateIssuedPrescriptionPdf` recupera documentos con CUIR ya persistido. Si Farmalink aprobó pero falló el PDF o el guardado antes de persistir CUIR en `prescriptions`, el número queda protegido en `farmalink_issue_attempts`, pero el flujo de recuperación de ese caso no está implementado. Reemitir queda bloqueado. Se necesita una instantánea íntegra de emisión y su reconstrucción auditada, sin llamar a `altaReceta`.
3. **Identidad del prescriptor y cobertura:** la BD verificada no contiene fecha de nacimiento/DNI del médico en `doctors/profiles`. El mapper aún recibe esos valores de metadatos o configuración de homologación. No se acreditó su asociación autoritativa para cada profesional, ni un circuito productivo sin credenciales/códigos DEMO por defecto.
4. **Contrato externo:** el catálogo oficial suministrado por Farmalink (`https://catalogo-srv.farmalink.com.ar/`) no pudo recuperarse desde este entorno (fallo de conexión/timeout). No se atribuye el 504 a un payload o permiso específico sin trazas del proveedor. Se confirmó la organización 182 y que el punto emisor debe omitirse; todavía faltan alta/consulta/baja válidas, modalidad genérica y de marca en PDF, conciliación de intentos anteriores y aprobación formal.

Las comprobaciones técnicas de la rama no son homologación oficial. Staging y producción se consultan solo en modo lectura y no reciben esta migración.
