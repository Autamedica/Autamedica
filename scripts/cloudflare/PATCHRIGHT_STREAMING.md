# Cloudflare DNS con Patchright Streaming

Este flujo usa solo Patchright Streaming y sesion persistente de Chrome CDP.

## 1) Levantar/validar sesion CDP

```bash
cd /home/edu/Autamedica
./scripts/cloudflare/browser-cdp-session.sh start
./scripts/cloudflare/browser-cdp-session.sh status
./scripts/cloudflare/browser-cdp-session.sh tabs
./scripts/cloudflare/browser-cdp-session.sh ws
```

Defaults:
- `CDP_URL`: `http://127.0.0.1:9222`
- `PROFILE_DIR`: `/home/edu/.patchright-profile`
- `BROWSER_MODE`: `headed`

Acciones disponibles:
- `start`: levanta Chrome con CDP y perfil persistente
- `stop`: cierra la instancia controlada por el helper
- `restart`: reinicia la sesion CDP
- `status`: muestra browser, tabs, pid, profile y websocket exacto
- `tabs`: lista tabs activas
- `ws`: imprime solo `webSocketDebuggerUrl`

Modos de browser:
- `BROWSER_MODE=headed`: default para desktop local
- `BROWSER_MODE=headless`: forzar headless en servidores
- `BROWSER_MODE=auto`: usa headed si hay display, headless si no lo hay

Ejemplo para server sin display:

```bash
BROWSER_MODE=auto CDP_PORT=9333 ./scripts/cloudflare/browser-cdp-session.sh start
```

## 2) Workflows versionados

- `scripts/cloudflare/cf_dns_open_autamedica_records.workflow.json`
- `scripts/cloudflare/cf_dns_sync_standard_cnames.workflow.json`

## 2.5) API-first antes de tocar UI

```bash
pnpm cloudflare:token:install
pnpm cloudflare:dns:audit
pnpm cloudflare:dns:audit:secure
pnpm cloudflare:dns:cron
pnpm cloudflare:dns:cron:install
pnpm cloudflare:dns:cron:show
pnpm cloudflare:dns:reconcile
pnpm cloudflare:token-flow
pnpm cloudflare:token-flow:tmux
```

Notas:
- `cloudflare:token:install` guarda el token validado en `~/.config/autamedica/cloudflare.env` con permisos `600`.
- `cloudflare:dns:audit` valida drift sin mutar estado y devuelve JSON.
- `cloudflare:dns:audit:secure` pide el token en modo oculto, verifica el token y corre el audit sin persistir el secreto.
- `cloudflare:dns:cron` corre el audit no interactivo usando el token instalado localmente.
- `cloudflare:dns:cron:install` agrega una entrada horaria al `crontab` del usuario.
- `cloudflare:dns:cron:show` muestra la entrada gestionada por AutaMedica.
- `cloudflare:dns:reconcile` aplica el estado canonico definido en `scripts/config/domains.js`.
- `cloudflare:token-flow` unifica prompt oculto, verificacion del token y ejecucion de `audit` o `reconcile`.
- `cloudflare:token-flow:tmux` abre la pagina de tokens y deja el flujo corriendo en una sesion `tmux`.
- Si `~/.config/autamedica/cloudflare.env` existe, `cloudflare:token-flow` carga el token automaticamente y ya no pide prompt.
- El cron guarda log en `~/.local/state/autamedica/cloudflare-dns-audit.log` y el ultimo JSON en `~/.local/state/autamedica/cloudflare-dns-audit.latest.json`.
- Filtrado opcional: `node scripts/cloudflare/reconcile-pages-domains.mjs --audit --project=autamedica-doctors,autamedica-patients`

## 3) Usar en Patchright Streaming (MCP)

1. Conectar al browser correcto:
   - `stream_connect` con `url: "http://127.0.0.1:9222"`
   - o usar el websocket exacto devuelto por `./scripts/cloudflare/browser-cdp-session.sh ws`
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
- Preferir `scripts/cloudflare/reconcile-pages-domains.mjs` para cambios repetibles; usar Streaming para verificacion visual o tareas bloqueadas por UI.
- Si Cloudflare cambia el UI, ajustar selectores/pasos del workflow y re-exportar JSON.
