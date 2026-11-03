# Farmalink: recuperación y conciliación conservadora

Esta implementación no activa Farmalink ni aplica migraciones remotas. Requiere desplegar primero la migración de snapshot y luego la aplicación, incluso con FARMALINK_ENABLED=false. Si no se puede comprobar una reserva existente, la emisión AR falla cerrada: desactivar el flag no permite sustituir una receta Farmalink pendiente por una emisión interna.

## Snapshot antes de alta

La reserva de cinco argumentos guarda los datos originales del PDF, CUIR determinista, fechas de emisión/vencimiento, solicitud y orden de dispensación. La tabla contiene datos clínicos y está restringida al servidor con RLS, sin acceso anon/authenticated. El snapshot no puede modificarse ni completarse retrospectivamente en intentos históricos.

Emisión inicial y recuperación cierran mediante la misma RPC transaccional: receta, una sola orden y auditoría. Solicitudes concurrentes conservan el primer artefacto comprometido; los posteriores quedan registrados como superseded, sin sobrescribirlo ni crear otra orden. La comprobación de intentos no depende de vendor_name: cambiar esa etiqueta no permite usar el generador heredado. Una vez comprometido, el proveedor, CUIR y puntero de PDF no pueden sobrescribirse. No se reactiva una receta cancelada/vencida y se revalida el acceso al finalizar. Una respuesta código 00/0 sin número, o sin código funcional, queda unknown.

## Operación autenticada

- `POST /api/doctors/prescriptions/{id}/recover-farmalink`: solo el profesional propietario activo, con recibo confirmado y snapshot válido. Conserva CUIR y fechas, firma si existe certificado y bloquea el proceso si esa firma falla. No importa el cliente Farmalink y no puede emitir ni anular. Si ya existe un artefacto comprometido, devuelve un enlace firmado nuevo sin regenerarlo.
- `GET /api/admin/farmalink/pending`: solo platform_admin/admin. Devuelve como máximo 100 identificadores de intentos, estados, fechas y disponibilidad de snapshot; sin datos clínicos.
- `POST /api/admin/farmalink/reconcile`: recibe prescriptionId, vendorId, evidenceSha256 y providerReference. Identidad del operador tomada de la sesión, no del cuerpo. Consulta una vez el número proporcionado y no ejecuta alta/baja. Requiere igualdad de identidades, credencial, todos los medicamentos y fechas con la solicitud retenida.

## Bloqueo externo obligatorio

La revisión experimental `consulta-v3-estado-vigente-1` espera `consultaRecetaElectRs.recElectronica`, número coincidente y estado `VIGENTE`, sin campos adicionales respecto de la solicitud. **Ese shape no está acreditado con una respuesta oficial real de Farmalink.** Por ello la conciliación devuelve `farmalink_consulta_contract_unverified` mientras no se configure expresamente FARMALINK_CONSULTA_SCHEMA_REVISION con esa revisión. No configurar esa variable hasta contrastar el contrato, sus estados y una respuesta representativa con el proveedor. Actualizar parser y pruebas si el contrato real difiere.

Una consulta HTTP 200 o código 00 no prueba por sí sola que la receta esté vigente. Cualquier dato faltante, número ajeno, estado diferente, cambio de ambiente o formato no reconocido conserva el bloqueo.

La conciliación almacena transaccionalmente operador, fecha, referencia, hash de evidencia externa y cuerpo/hash de consulta en una tabla privada append-only. SQL comprueba que el cuerpo conservado corresponde al hash. La evidencia externa indicada por el operador debe conservarse por el procedimiento institucional; su hash no sustituye el documento original. No registrar cuerpos clínicos, tokens ni credenciales en logs.

## Límites que permanecen

Las dos DEMO anteriores no tienen un número confirmado ni snapshot de aplicación. No se inventan asociaciones ni se crea retrospectivamente un snapshot: requieren trazas y respuesta de SOL-3144. Las filas históricas sin snapshot permanecen bloqueadas.

La habilitación productiva también requiere identidades autoritativas por profesional, parámetros productivos, alta/consulta/baja TEST válidas y aprobación formal del proveedor. Esta implementación y sus pruebas sintéticas no constituyen homologación ni autorización de activación. No fusionar ni desplegar automáticamente este PR.
