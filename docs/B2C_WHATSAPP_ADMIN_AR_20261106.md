# B2C WhatsApp Argentina — administración AutaMedica (2026-11-06)

## Alcance implementado

- Vista protegida para administradores: `/admin/b2c-whatsapp`, accesible desde `/admin/crm`.
- Importación de CSV `source_key,display_name,phone,crossed_out,excluded,exclusion_reason`, lotes de 100, idempotencia por `source_key`.
- Consentimiento **pendiente por defecto**: la importación nunca habilita un contacto.
- Verificación administrativa requiere una descripción del respaldo de consentimiento.
- Enlace `wa.me` solo si hay consentimiento verificado, teléfono con formato válido y ausencia de bloqueo. Envíos siempre manuales.
- Resultados: enviado, respondió, interesado, no interesa, no respondió, baja. No se recontactan los estados bloqueados.
- Asociación explícita con `patients.id`. Pagos aprobados y consultas completadas salen de tablas operacionales de Supabase; no se presentan como causalmente atribuidos a WhatsApp.
- Receptor `/api/whatsapp/b2c-webhook` que verifica HMAC-SHA256 de Meta, recibe eventos, no guarda texto y registra bajas. Función Postgres idempotente en una transacción.
- No hay endpoint de envío automático ni integración mediante WhatsApp Web no oficial.

## Datos y seguridad

Las tablas `public.b2c_whatsapp_contacts` y `public.b2c_whatsapp_events` tienen RLS, privilegios revocados a `anon`/`authenticated` y acceso exclusivo al servicio backend. Sin DNI, CUIL, obras sociales, diagnósticos o contenido de mensajes. No importar archivos con campos adicionales.

La autorización declarada por el titular de AutaMedica no se transforma automáticamente en prueba individual. Confirmar fecha, canal y finalidad del consentimiento antes de marcar como verificado. Los registros con rechazo previo, baja, teléfono tachado, NC ambiguo o duplicado quedan excluidos.

## Activación en Meta

La app WhatsApp Business actual **no equivale a una cuenta Cloud API habilitada**. Para recibir respuestas automáticamente sin abandonar la app, primero completar el onboarding oficial de **WhatsApp Business App Coexistence** desde Meta Embedded Signup. Comprobar elegibilidad y permisos. Puede existir sincronización histórica limitada y una ventana restringida al activar coexistencia.

Configurar en el entorno del servidor (nunca en código ni cliente):

- `META_WHATSAPP_APP_SECRET`: app secret de Meta para HMAC.
- `META_WHATSAPP_VERIFY_TOKEN`: token secreto elegido para confirmar el webhook.
- `META_WHATSAPP_PHONE_NUMBER_ID`: ID del teléfono comercial conectado (no es el número visible).

En Meta registrar URL pública HTTPS `https://<HOST>/api/whatsapp/b2c-webhook`.
Suscribir al menos `messages` y, si está disponible con coexistencia, `smb_message_echoes`. No activar cambios de producción hasta validar firma, recepción y baja.

**Importante:** los mensajes enviados manualmente desde la app son gratuitos, pero la coexistencia y los envíos desde la Cloud API tienen condiciones/costos de Meta. Esta implementación **no envía** mensajes a través de la API, por lo que no compra créditos.

## Pruebas y validación

1. Migrar primero en staging (Supabase). Validar RLS y ausencia de permisos directos.
2. Ejecutar tests unitarios de número argentino, consentimientos y baja.
3. Importar el CSV depurado: todos los consentimientos quedan pendientes; ningún envío se dispara.
4. Verificar manualmente un consentimiento con su evidencia, abrir un chat y marcar el resultado.
5. Probar eventos firmados de Meta (no solicitudes inventadas): inbound, echo, read/delivered, BAJA; reintentos deben ser idempotentes.
6. Vincular manualmente un paciente existente para comprobar pagos **aprobados** y citas **completed**; no contar pagos reportados manualmente como aprobados.
7. Solo entonces publicar.

## Limitaciones actuales

- Sin Embedded Signup activo y credenciales Meta, el webhook no recibirá conversaciones: esto es configuración pendiente, no una sincronización ya realizada.
- Se registran metadatos de eventos y respuestas, no transcripciones completas ni contenido clínico.
- La vinculación paciente/contacto requiere verificación manual de identidad.
- Los enlaces `wa.me` no prueban entrega, lectura ni titularidad del teléfono.
- Las cifras de pagos y consultas son historial verificado del paciente asociado, no atribución del canal de adquisición.
