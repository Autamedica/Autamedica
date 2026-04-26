# AutaMedica Newsletter Worker

Worker de newsletter y emails operativos de AutaMedica.

## Flujo actual

1. El cron frecuente procesa `growth_os.email_jobs`.
2. El cron diario `10 11 * * *` genera una edición de newsletter como draft.
3. La edición queda en `growth_os.newsletter_editions`.
4. Eduardo revisa `/preview`.
5. El envío real se dispara con `/newsletter/send`.

El cron diario no manda directo. Esto evita enviar una edición vacía o mala por error.

## Schema

Aplicar:

```bash
sql/001_newsletter_editions.sql
sql/002_newsletter_consent_hardening.sql
```

Tabla principal:

- `growth_os.newsletter_editions`
- estados: `draft`, `approved`, `sending`, `sent`, `failed`, `skipped`
- guarda `html`, candidatos RSS, notas aceptadas, proveedor y error si falla

## Variables y secrets

Requeridos:

```bash
wrangler secret put GEMINI_API_KEY
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_AUDIENCE_ID
wrangler secret put BREVO_API_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put TRIGGER_KEY
```

Fallback Brevo:

```bash
# opción recomendada para audiencia real
wrangler secret put BREVO_LIST_IDS

# opción controlada para pruebas, emails separados por coma
wrangler secret put BREVO_NEWSLETTER_RECIPIENTS
```

`BREVO_LIST_IDS` usa campañas de Brevo. Si no está configurado, el fallback usa `BREVO_NEWSLETTER_RECIPIENTS`; si tampoco está, manda solo a `FROM_EMAIL`.

Aviso opcional por Telegram cuando se genera un draft:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

Configurar también `WORKER_PUBLIC_URL` en `wrangler.toml` para que el mensaje incluya link de preview.

## Endpoints

Todos los endpoints operativos requieren header:

```txt
x-trigger-key: <TRIGGER_KEY>
```

Generar draft:

```bash
curl -H "x-trigger-key: $TRIGGER_KEY" \
  https://autamedica-newsletter.<account>.workers.dev/newsletter/draft
```

Preview de última edición:

```bash
curl https://autamedica-newsletter.<account>.workers.dev/preview
```

Preview por ID:

```bash
curl "https://autamedica-newsletter.<account>.workers.dev/preview?id=<uuid>"
```

Aprobar edición:

```bash
curl -X POST -H "x-trigger-key: $TRIGGER_KEY" \
  "https://autamedica-newsletter.<account>.workers.dev/newsletter/approve?id=<uuid>"
```

Enviar edición:

```bash
curl -X POST -H "x-trigger-key: $TRIGGER_KEY" \
  "https://autamedica-newsletter.<account>.workers.dev/newsletter/send?id=<uuid>"
```

Procesar jobs transaccionales:

```bash
curl -H "x-trigger-key: $TRIGGER_KEY" \
  https://autamedica-newsletter.<account>.workers.dev/jobs
```

## Sincronizacion de audiencia

La fuente de verdad para newsletter es `public.profiles.newsletter_subscribed`.

Antes de enviar, el worker compara Supabase contra Resend. Si hay un email activo en Resend que no esta activo en Supabase, o un email activo en Supabase que no existe activo en Resend, el envio se bloquea.

Auditar diferencias sin tocar nada:

```bash
pnpm sync-audience
```

Aplicar la sincronizacion:

```bash
pnpm sync-audience:apply
```

La sincronizacion respeta bajas del proveedor: si Resend tiene un contacto como `unsubscribed`, Supabase pasa a `newsletter_subscribed=false`. Nunca se re-suscribe automaticamente a alguien que ya se dio de baja en el proveedor.

Para propagar bajas tambien a Brevo:

```bash
pnpm sync-audience -- --apply --brevo
```

## Desarrollo local

```bash
pnpm install
pnpm run typecheck
pnpm dev
```

Preview local:

```bash
curl http://localhost:8787/preview
```

Crear draft local:

```bash
curl -H "x-trigger-key: $TRIGGER_KEY" \
  http://localhost:8787/newsletter/draft
```

## Deploy

```bash
pnpm deploy
```

## Notas de proveedor

Resend es el canal primario por broadcast.

Brevo queda como fallback:

- con `BREVO_LIST_IDS`, crea una campaña en `/v3/emailCampaigns` y la dispara con `/sendNow`
- sin listas, envía por `/v3/smtp/email` a destinatarios explícitos

La API de Brevo crea campañas en draft y exige contenido `htmlContent` o equivalente; el envío inmediato usa `POST /v3/emailCampaigns/:campaignId/sendNow`.
