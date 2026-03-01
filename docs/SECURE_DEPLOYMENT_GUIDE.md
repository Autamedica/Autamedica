# 🔐 Guía de Deploy Seguro - Cloudflare Pages

## ✅ Objetivos

- Desplegar cada app del monorepo en Cloudflare Pages con variables y secretos seguros.
- Garantizar cumplimiento HIPAA con controles de acceso y monitoreo.

## 🛡️ Checklist previo al deploy

1. Ejecutar validaciones:
   ```bash
   pnpm check:all
   pnpm security:check
   pnpm docs:validate
   ```
2. Confirmar que `.open-next/dist` existe para cada app (`pnpm build:cloudflare`).
3. Verificar variables en Cloudflare Dashboard → Pages → `<proyecto>` → _Environment Variables_.

## 🔑 Gestión de secretos

Usar `wrangler` para administrar secretos y variables (no se almacenan en repositorio):

```bash
cd apps/doctors
wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
wrangler pages secret put JWT_SECRET
wrangler pages secret put JWT_REFRESH_SECRET
```

Variables públicas definidas como `Environment Variables`:

```
NEXT_PUBLIC_SITE_URL=https://doctors.autamedica.com
NEXT_PUBLIC_APP_URL=https://doctors.autamedica.com
NEXT_PUBLIC_API_URL=https://api.autamedica.com
NEXT_PUBLIC_SUPABASE_URL=https://qxjjrpksmwwrmubhvjew.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
```

## 🚀 Deploy seguro

Ejecutar despliegue por app (uno a la vez):

```bash
cd apps/<app>
pnpm build:cloudflare
wrangler pages deploy .open-next/dist --project-name autamedica-<app> --branch main
```

### Bloqueo de despliegues accidentales

- Configura `Required Deployments` en Cloudflare Dashboard → Branch Deployments.
- Habilita aprobaciones manuales en GitHub Actions (pendiente).

## 🔍 Validaciones post-deploy

```bash
wrangler pages deployments list autamedica-<app>
wrangler pages deployment tail autamedica-<app>
```

- Verificar que el estado sea `success`.
- Revisar Cloudflare Analytics para tráfico anómalo.

## 🌐 DNS y certificados

- DNS administrado desde Cloudflare (ver `DOMAIN_CONFIGURATION.md`).
- Activar Always Use HTTPS y HSTS.
- Certificados automáticos generados por Cloudflare (no subir certificados manuales).

## 📡 Alertas y monitoreo

- Configurar Logpush → almacenamiento seguro (R2/BigQuery).
- Integrar con Slack/PagerDuty desde Cloudflare Notifications.
- Automatizar health-checks con `pnpm health` + cron.

## 📥 Recuperación ante incidentes

1. Revertir al deploy anterior: `wrangler pages deployment rollback autamedica-<app> <deployment-id>`
2. Revocar secretos comprometidos y re-generarlos en Supabase.
3. Documentar incidentes en `SECURITY_VULNERABILITIES_REPORT.md`.

---

Mantener esta guía actualizada cada vez que se agregue una app o cambie la configuración de Cloudflare.
