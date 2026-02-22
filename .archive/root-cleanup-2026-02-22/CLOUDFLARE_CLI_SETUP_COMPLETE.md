# ✅ Configuración Cloudflare Pages - Completada via CLI

**Fecha:** 2025-10-04 08:10:00
**Método:** Wrangler CLI (automatizado)
**Estado:** ✅ COMPLETADO

---

## 🎯 Resumen

Se configuraron **todas las variables de entorno** para las **6 aplicaciones** de AltaMedica en Cloudflare Pages usando `wrangler pages secret put`.

### ✅ Apps Configuradas

| App       | Proyecto Cloudflare    | Variables | Estado        |
| --------- | ---------------------- | --------- | ------------- |
| Auth      | `autamedica-auth`      | 7 vars    | ✅ Completado |
| Patients  | `autamedica-patients`  | 12 vars   | ✅ Completado |
| Doctors   | `autamedica-doctors`   | 7 vars    | ✅ Completado |
| Companies | `autamedica-companies` | 7 vars    | ✅ Completado |
| Admin     | `autamedica-admin`     | 7 vars    | ✅ Completado |
| Web-App   | `autamedica-web-app`   | 4 vars    | ✅ Completado |

---

## 📋 Variables Configuradas

### 🔐 Variables Comunes (Server-side)

Todas las apps excepto web-app:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` 🔒 **SENSIBLE**
- `AUTH_COOKIE_DOMAIN`

### 🌐 Variables Públicas (Client-side)

Todas las apps:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BASE_URL` (específico por app)

### 📱 Variables Específicas

**Patients App** (adicionales):

- `NEXT_PUBLIC_AUTH_CALLBACK_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_PATIENTS_URL`
- `NEXT_PUBLIC_DOCTORS_URL`
- `NEXT_PUBLIC_COMPANIES_URL`

---

## 🚀 Cómo se Hizo (Reproducible)

### Script Automatizado

```bash
#!/bin/bash
# Configuración Auth App
PROJECT="autamedica-auth"
echo "https://knywotiidsydsaveqkjs.supabase.co" | \
  wrangler pages secret put SUPABASE_URL --project-name="$PROJECT"

echo "eyJhbGci..." | \
  wrangler pages secret put SUPABASE_ANON_KEY --project-name="$PROJECT"

# ... (repetir para cada variable)
```

### Comando por Variable

```bash
echo "VALOR" | wrangler pages secret put NOMBRE_VAR --project-name="nombre-proyecto"
```

**Ventajas del método CLI:**

- ✅ **Atómico**: Una variable a la vez
- ✅ **Seguro**: Las secrets no se logean
- ✅ **Reproducible**: Mismo comando funciona siempre
- ✅ **Versionable**: Scripts en git
- ✅ **Automatable**: Se puede incluir en CI/CD

---

## 📊 Estado de Deployments Actuales

| App       | Último Deployment                      | Edad        | Necesita Redeploy        |
| --------- | -------------------------------------- | ----------- | ------------------------ |
| Auth      | `2f696113-bc69-4f45-9d74-5669026b5759` | 1 hour ago  | ⚠️ Sí (variables nuevas) |
| Patients  | `d23dbe35-07d3-4e92-8485-728b5d731882` | 5 hours ago | ⚠️ Sí                    |
| Doctors   | `d830ad9a-3d53-4de3-9f9a-5b74ffb82bb8` | 1 day ago   | ⚠️ Sí                    |
| Companies | `447896f3-9e21-465f-9e3a-15640f6e00d4` | 1 day ago   | ⚠️ Sí                    |
| Admin     | `fea69305-1971-419e-aeef-8cfab4bd93c1` | 1 hour ago  | ⚠️ Sí                    |
| Web-App   | `6188466b-0155-4c2a-8e5b-80c2d0815699` | 2 days ago  | ⚠️ Sí                    |

---

## 🔄 Aplicar las Variables (Redeploy)

Las variables **YA están configuradas** en Cloudflare, pero necesitan un nuevo deployment para aplicarse.

### Opción 1: Git Watcher (Automático) ⭐ **RECOMENDADO**

```bash
# El Git Watcher ya está corriendo y hará commit + push automáticamente
# Esto triggereará deployments automáticos via GitHub Actions
./scripts/status-git-watcher.sh
```

**Ventaja:** Todo automático, sin intervención manual.

### Opción 2: Dashboard Manual

1. Ir a: https://dash.cloudflare.com/pages
2. Seleccionar cada proyecto
3. Click en "Deployments"
4. Click "..." en el último deployment
5. Click "Retry deployment"

### Opción 3: Nuevo Deployment CLI (Manual)

```bash
# Desde cada app
cd apps/auth && pnpm build
wrangler pages deploy .open-next --project-name=autamedica-auth --branch=main
```

---

## ✅ Validación Post-Deployment

Después del redeploy, verificar:

### 1. Health Check de URLs

```bash
# Auth
curl -I https://auth.autamedica.com
# Debe retornar: 200 OK

# Patients
curl -I https://patients.autamedica.com
# Debe retornar: 200 OK o 307 (redirect si no autenticado)
```

### 2. Verificar Variables en Browser

```javascript
// Abrir DevTools Console en cada app
console.log(process.env.NEXT_PUBLIC_SUPABASE_URL);
// Debe mostrar: https://knywotiidsydsaveqkjs.supabase.co
```

### 3. Test de Autenticación

- Ir a: https://auth.autamedica.com/auth/login
- Intentar login con Google
- Verificar redirect correcto según rol
- Verificar cookie `.autamedica.com` en DevTools

---

## 🔐 Seguridad

### ✅ Variables Seguras Configuradas

- `SUPABASE_SERVICE_ROLE_KEY`: Solo server-side ✅
- `AUTH_COOKIE_DOMAIN`: Correctamente con punto (`.autamedica.com`) ✅
- Secrets no logueadas en output CLI ✅

### 🚨 Variables Públicas (Esperadas)

- `NEXT_PUBLIC_*`: Expuestas al cliente (diseño correcto) ✅
- `SUPABASE_ANON_KEY`: Pública pero con RLS protegiendo DB ✅

---

## 📝 Comandos de Referencia

### Listar Variables Configuradas

```bash
# Wrangler CLI no tiene comando para listar secrets
# Usar dashboard: Settings > Environment variables
```

### Actualizar una Variable

```bash
echo "NUEVO_VALOR" | \
  wrangler pages secret put NOMBRE_VAR --project-name="nombre-proyecto"
```

### Eliminar una Variable

```bash
wrangler pages secret delete NOMBRE_VAR --project-name="nombre-proyecto"
```

### Ver Deployments

```bash
wrangler pages deployment list --project-name="autamedica-auth"
```

---

## 🎯 Próximos Pasos

1. **Esperar Git Watcher** (auto-deploy en ~5 minutos) ⏱️
2. **Monitorear GitHub Actions** workflows
3. **Validar deployments** cuando completen
4. **Test end-to-end** del flujo de autenticación

---

## 📊 Tiempo Total

- **Configuración manual (dashboard):** ~15 minutos estimados
- **Configuración CLI (automatizada):** ~2 minutos reales ⚡
- **Ahorro de tiempo:** 87% 🎉

---

## 🔗 Links Útiles

**Cloudflare Dashboard:**

- Auth: https://dash.cloudflare.com/5737682cdee596a0781f795116a3120b/pages/view/autamedica-auth
- Patients: https://dash.cloudflare.com/5737682cdee596a0781f795116a3120b/pages/view/autamedica-patients
- Doctors: https://dash.cloudflare.com/5737682cdee596a0781f795116a3120b/pages/view/autamedica-doctors
- Companies: https://dash.cloudflare.com/5737682cdee596a0781f795116a3120b/pages/view/autamedica-companies
- Admin: https://dash.cloudflare.com/5737682cdee596a0781f795116a3120b/pages/view/autamedica-admin
- Web-App: https://dash.cloudflare.com/5737682cdee596a0781f795116a3120b/pages/view/autamedica-web-app

**Documentación:**

- Wrangler Pages: https://developers.cloudflare.com/workers/wrangler/commands/#pages
- Cloudflare Pages Secrets: https://developers.cloudflare.com/pages/platform/build-configuration/

---

**Generado:** 2025-10-04 08:10:00
**Método:** Wrangler CLI
**Script usado:** `/tmp/configure-all-apps.sh`
**Git Watcher:** ✅ Activo (commit automático pending)
