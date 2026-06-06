# OpenClaw Event Relay

Relay HTTP autenticado para enviar WhatsApp desde la VM Oracle mediante la sesión Baileys directa.

El relay no acepta un token plano propio. Cada request debe traer `X-API-Key`; el relay valida esa key contra AutaMedica en `/api/openclaw/authorize` y exige el scope `openclaw:send`.

## Variables

```bash
OPENCLAW_EVENT_RELAY_HOST=127.0.0.1
OPENCLAW_EVENT_RELAY_PORT=18791
AUTAMEDICA_OPENCLAW_AUTHORIZE_URL=https://doctor.autamedica.com/api/openclaw/authorize
OPENCLAW_ACCOUNT=autamedica
OPENCLAW_CHANNEL=whatsapp
WHATSAPP_DIRECT_API_URL=http://127.0.0.1:18792
WHATSAPP_DIRECT_API_TOKEN=<secreto-compartido-local>
```

## Ejecutar

```bash
node /opt/autamedica/openclaw-event-relay.mjs
```

## Probar salud

```bash
curl http://127.0.0.1:18791/health
```

## Probar envio

```bash
curl -X POST http://127.0.0.1:18791/send \
  -H "content-type: application/json" \
  -H "x-api-key: $OPENCLAW_EVENT_RELAY_API_KEY" \
  -d '{
    "event": "dispatch.offer",
    "channel": "whatsapp",
    "accountId": "autamedica",
    "to": "5491112345678",
    "message": "Prueba AutaMedica"
  }'
```

## Systemd

```ini
[Unit]
Description=AutaMedica OpenClaw Event Relay
After=network-online.target autamedica-whatsapp-direct-menu.service
Wants=network-online.target

[Service]
Type=simple
User=opc
Environment=OPENCLAW_EVENT_RELAY_HOST=127.0.0.1
Environment=OPENCLAW_EVENT_RELAY_PORT=18791
Environment=AUTAMEDICA_OPENCLAW_AUTHORIZE_URL=https://doctor.autamedica.com/api/openclaw/authorize
Environment=OPENCLAW_ACCOUNT=autamedica
Environment=OPENCLAW_CHANNEL=whatsapp
Environment=WHATSAPP_DIRECT_API_URL=http://127.0.0.1:18792
EnvironmentFile=/etc/autamedica/whatsapp-direct.env
ExecStart=/usr/bin/node /opt/autamedica/openclaw-event-relay.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
