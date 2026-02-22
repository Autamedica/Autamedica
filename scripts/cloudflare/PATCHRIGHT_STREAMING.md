# Cloudflare DNS con Patchright Streaming

Este flujo usa solo Patchright Streaming y sesion persistente de Chrome CDP.

## 1) Levantar/validar sesion CDP

```bash
cd /home/edu/Autamedica
./scripts/cloudflare/browser-cdp-session.sh start
./scripts/cloudflare/browser-cdp-session.sh status
./scripts/cloudflare/browser-cdp-session.sh tabs
```

Defaults:
- `CDP_URL`: `http://127.0.0.1:9222`
- `PROFILE_DIR`: `/home/edu/.patchright-profile`

## 2) Workflows versionados

- `scripts/cloudflare/cf_dns_open_autamedica_records.workflow.json`
- `scripts/cloudflare/cf_dns_sync_standard_cnames.workflow.json`

## 3) Usar en Patchright Streaming (MCP)

1. Conectar al browser correcto:
   - `stream_status` con `connect: "http://localhost:9222"`
2. Importar workflows:
   - `stream_workflow_import` con `path` al JSON
3. Ejecutar:
   - `stream_workflow_run` `name: "cf_dns_open_autamedica_records"`
   - `stream_workflow_run` `name: "cf_dns_sync_standard_cnames"` (verificacion)

Para crear/editar registros manualmente sin IA:
- `stream_click` `selector: "Agregar registro"`
- `stream_fill` `selector: "[name=\"name\"]"` y `"[name=\"target\"]"`
- `stream_fill` `selector: "input[id^=\"react-select-\"][id$=\"-input\"]"` con `CNAME` + `Enter`
- `stream_click` `selector: "Guardar"`

## 4) Politica operativa

- No usar Playwright en este flujo.
- Mantener la misma sesion persistente para evitar logout/captcha.
- Si Cloudflare cambia el UI, ajustar selectores/pasos del workflow y re-exportar JSON.
