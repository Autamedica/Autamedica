# Manual operativo de controles administrativos

## Autoridad única

La única autoridad sobre el estado activo/inactivo de cualquier flujo operativo de AutaMedica es la fila global de `public.platform_operational_switches`, administrada desde `/admin`. Ningún worker, endpoint, proceso de IA, documento Markdown ni configuración estática puede prevalecer sobre esa fila para decidir si un flujo está habilitado.

Queda prohibido bloquear PRs, merges o despliegues por estados activos/inactivos escritos en Markdown, incluidos estados históricos o checklists de este repositorio. Los documentos describen procedimientos y evidencia; no son configuración ejecutable ni gates dinámicos. Los controles se consultan en vivo desde la tabla.

Los cambios requieren rol `admin` validado contra `public.profiles.role` y/o `app_metadata.role` confiable. Cada modificación registra actor, fecha, motivo y auditoría.

## Cómo operar

Abrir `/admin`, entrar en **Control de Cobros en Vivo / Interruptores operativos**, revisar el estado actual y cambiar únicamente el flujo requerido. La pantalla actualiza el estado cada 15 segundos y muestra el último actor (UUID autenticado) y la hora del último cambio por interruptor. La API es `GET/POST /api/admin/payments/toggle`. Los cambios están restringidos a `public.profiles.role = 'admin'`; los roles `organization_admin` y `platform_admin` no heredan este permiso.

Apagar un interruptor impide iniciar nuevas operaciones de ese flujo. Las solicitudes ya aceptadas por un proveedor externo, pagos aprobados, consultas ya asignadas y videollamadas activas no se cancelan retroactivamente. Una petición de envío que todavía no llegó al proveedor se detiene en la siguiente comprobación; un envío ya aceptado por el proveedor no puede retirarse desde Admin.

## Catálogo de interruptores

### Finanzas

- **Pagos QR Jordan** — `jordan_qr_payments_enabled`. Controla la creación de nuevos checkouts en `POST /api/pharmacy/dispatch/payment/create`, para partner `JORDAN` y solicitudes BR/general. No revierte pagos aprobados ni interrumpe consultas ya asignadas; los pagos `pending`/`approved` existentes siguen devolviendo su URL/estado.
- **Pagos Farmacias Express** — `pharmacy_express_payments_enabled`. Es una de las tres condiciones del checkout en `POST /api/pharmacy/dispatch/payment/create` durante el rollout actual Jordan BR. No cancela preferencias existentes ni conciliaciones.
- **Pasarela Global PIX / MercadoPago** — `global_pix_mp_payments_enabled`. Controla nuevas preferencias MercadoPago creadas por `POST /api/pharmacy/dispatch/payment/create`; la confirmación llega por `/api/payments/mercadopago/webhook`. No revierte transacciones confirmadas ni cancela preferencias ya creadas.

### Growth y comunicaciones

- **Envío WhatsApp** — `whatsapp_send_enabled`. `apps/reminder-worker/src/growth-agent-worker.ts` valida el switch antes de `sendMessageWithFallback` hacia OpenClaw. Apagado: no se inician nuevos envíos; los mensajes ya aceptados por el proveedor siguen su curso.
- **Envío email** — `email_send_enabled`. `apps/newsletter-worker/src/index.ts`, funciones `sendViaResend` y `sendViaBrevo`, para campañas de newsletter. Los correos transaccionales clínicos, de pagos, autenticación y recuperación no dependen de este interruptor. Growth Agent todavía no tiene adaptador de entrega de email implementado. Apagado: no se crean nuevos envíos; campañas o mensajes ya aceptados por el proveedor no se retiran.
- **Dry run** — `dry_run_enabled`. Cuando está activo, Growth Agent simula la entrega y no llama a OpenClaw; Newsletter Worker bloquea el envío externo (no ejecuta una simulación de campaña). Desactivarlo permite la entrega real únicamente si el interruptor del canal correspondiente también está activo.

### Farmacias y Jordan

Los interruptores de Finanzas controlan la apertura de nuevos cobros. No apagan la sala SFU, no cancelan una consulta ya asignada y no modifican el estado de guardia del médico. La confirmación del PSP y el ciclo clínico de una consulta existente continúan su flujo normal.

### IA y decisiones humanas

Las capacidades internas de agentes (`send_whatsapp`, `enqueue_email`, `dry_run_outbound`) se consolidan en los tres switches Growth de esta tabla. Las decisiones de compliance pueden detener una acción concreta y las propuestas de riesgo se presentan en la bandeja de autorizaciones de Admin. No existe hoy un switch global independiente de IA en `public.platform_operational_switches`; la decisión de riesgo sigue la bandeja de aprobación humana.

### Guardia médica

La disponibilidad de médicos, el heartbeat, la asignación de ofertas y las llamadas activas son estados operativos distintos de los controles de cobro y comunicaciones. En el catálogo actual no existe un interruptor global de Guardia Médica en `public.platform_operational_switches`: son estados del flujo de guardia y presencia, no un switch administrativo central. No deben apagarse indirectamente al pausar pagos o Growth.

## Auditoría del cambio

Cada cambio se persiste en `public.platform_operational_switches.updated_by`, `updated_at` y `reason`, y se registra en `public.audit_logs`. La identidad visible en Admin corresponde al UUID del usuario autenticado hasta que el directorio administrativo exponga un nombre legible.

## Regla de repositorio

La única fuente de verdad para el estado operativo activo/inactivo es `public.platform_operational_switches` gobernada desde `/admin`. Está prohibido usar estados estáticos de documentos Markdown como condición para bloquear PRs, merges, CI o despliegues. Un checklist puede documentar evidencia clínica, financiera o técnica, pero nunca reemplaza el estado vivo del sistema.
