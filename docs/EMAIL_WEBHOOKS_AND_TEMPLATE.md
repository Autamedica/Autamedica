# Email webhooks y template AutaMedica

## Resend webhook

Endpoint:

```text
https://www.autamedica.com/api/webhooks/resend
```

Variable requerida en Cloudflare Pages y desarrollo local:

```text
RESEND_WEBHOOK_SECRET=whsec_...
```

Eventos recomendados en Resend:

```text
email.sent
email.delivered
email.delivery_delayed
email.complained
email.bounced
email.opened
email.clicked
contact.created
contact.updated
contact.deleted
```

El endpoint valida las cabeceras Svix (`svix-id`, `svix-timestamp`, `svix-signature`) usando el body crudo y guarda los eventos en:

```text
growth_os.email_events
```

## Template unico

Modulo:

```text
apps/web/src/lib/email/autamedica-template.ts
```

Exporta:

```ts
renderAutamedicaEmail()
buildWelcomeEmail()
buildReminderEmail()
buildNewsletterEmail()
```

Regla operativa: todos los correos de AutaMedica deben salir usando este modulo o una extension directa del mismo. El GIF va como `background` en tabla, no como `<img>`, para evitar el boton de descarga de Gmail.

Remitente canonico:

```text
Eduardo Marques <contacto@autamedica.com>
```

