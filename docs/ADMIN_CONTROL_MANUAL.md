# Manual operativo de controles administrativos

## Autoridad única

La única autoridad sobre el estado activo/inactivo de cualquier flujo operativo de AutaMedica es la fila global de `public.platform_operational_switches`, administrada desde `/admin`. Ningún worker, endpoint, proceso de IA, documento Markdown ni configuración estática puede prevalecer sobre esa fila para decidir si un flujo está habilitado.

Queda prohibido bloquear PRs, merges o despliegues por estados activos/inactivos escritos en Markdown, incluidos estados históricos o checklists de este repositorio. Los documentos describen procedimientos y evidencia; no son configuración ejecutable ni gates dinámicos. Los controles se consultan en vivo desde la tabla.

Los cambios requieren rol `admin` validado contra `public.profiles.role` y/o `app_metadata.role` confiable. Cada modificación registra actor, fecha, motivo y auditoría.

## Cómo operar

Abrir `/admin`, entrar en **Control de Cobros en Vivo / Interruptores operativos**, revisar el estado actual y cambiar únicamente el flujo requerido. La pantalla muestra el último actor y la hora del último cambio. La API es `GET/POST /api/admin/payments/toggle`.

Apagar un interruptor impide iniciar nuevas operaciones de ese flujo. Las solicitudes ya aceptadas por un proveedor externo, pagos aprobados, consultas ya asignadas y videollamadas activas no se cancelan retroactivamente. Una petición de envío que todavía no llegó al proveedor se detiene en la siguiente comprobación; un envío ya aceptado por el proveedor no puede retirarse desde Admin.

## Catálogo de interruptores

### Finanzas

- **Pagos QR Jordan** — `jordan_qr_payments_enabled`. Gobierna la habilitación de nuevos checkouts QR de Jordan. No revierte pagos ya aprobados ni interrumpe consultas ya asignadas.
- **Pagos Farmacias Express** — `pharmacy_express_payments_enabled`. Gobierna la creación de nuevos cobros de Farmacia Express. No cancela conciliaciones ni pagos ya aceptados.
- **Pasarela Global PIX / MercadoPago** — `global_pix_mp_payments_enabled`. Gobierna nuevas operaciones a través de las pasarelas globales integradas. No revierte transacciones confirmadas por el PSP.

### Growth y comunicaciones

- **Envío WhatsApp** — `whatsapp_send_enabled`. Controla los envíos salientes de WhatsApp desde Growth Agent y Newsletter Worker, incluidos los adaptadores conectados a OpenClaw y WhatsApp Business API. Apagado: no se inician nuevos envíos; los mensajes ya aceptados por el proveedor siguen su curso.
- **Envío email** — `email_send_enabled`. Controla envíos salientes de Resend y Brevo ejecutados por los workers de comunicaciones. Apagado: no se crean nuevos envíos; campañas o mensajes ya aceptados por el proveedor no se retiran.
- **Dry run** — `dry_run_enabled`. Cuando está activo, los workers compatibles simulan la entrega y no llaman al proveedor externo. Desactivarlo permite la entrega real únicamente si el interruptor del canal correspondiente también está activo.

### Farmacias y Jordan

Los interruptores de Finanzas controlan la apertura de nuevos cobros. No apagan la sala SFU, no cancelan una consulta ya asignada y no modifican el estado de guardia del médico. La confirmación del PSP y el ciclo clínico de una consulta existente continúan su flujo normal.

### IA y decisiones humanas

Las capacidades internas de agentes y las decisiones de compliance pueden restringir una acción concreta, pero no pueden modificar el estado global de un flujo ni sustituir la autoridad administrativa. Las propuestas de riesgo se presentan en la bandeja de autorizaciones de Admin; la decisión final corresponde al administrador humano.

### Guardia médica

La disponibilidad de médicos, el heartbeat, la asignación de ofertas y las llamadas activas son estados operativos distintos de los controles de cobro y comunicaciones. No deben apagarse indirectamente al pausar pagos o Growth. La guardia activa y las videollamadas en curso se mantienen; los controles de negocio sólo afectan el flujo que describen.

## Auditoría del cambio

Cada cambio se persiste en `public.platform_operational_switches.updated_by`, `updated_at` y `reason`, y se registra en `public.audit_logs`. La identidad visible en Admin corresponde al UUID del usuario autenticado hasta que el directorio administrativo exponga un nombre legible.

## Regla de repositorio

La única fuente de verdad para el estado operativo activo/inactivo es `public.platform_operational_switches` gobernada desde `/admin`. Está prohibido usar estados estáticos de documentos Markdown como condición para bloquear PRs, merges, CI o despliegues. Un checklist puede documentar evidencia clínica, financiera o técnica, pero nunca reemplaza el estado vivo del sistema.
