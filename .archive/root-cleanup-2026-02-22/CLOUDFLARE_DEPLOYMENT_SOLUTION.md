# 🎯 Solución Final: Cloudflare Deployment

**Fecha:** 2025-09-30
**Estado:** Configuración corregida

---

## 🔍 Análisis: Workers vs Pages

### Cloudflare Workers + Static Assets (Documentación compartida)

```toml
# Para Workers con assets estáticos
[assets]
directory = "./dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
```

**Características:**

- Deploy manual con `wrangler deploy`
- Más control sobre routing
- Requiere Worker script
- Para aplicaciones custom

### Cloudflare Pages (Lo que estamos usando ✅)

```toml
# Para Pages con Git integration
pages_build_output_dir = ".next"
```

**Características:**

- Deploy automático desde Git
- Build automático en cada push
- Más simple para Next.js
- Lo que ya tenemos configurado ✅

---

## ✅ Correcciones Aplicadas

### 1. wrangler.toml Corregido

**❌ ANTES (Incorrecto):**

```toml
pages_build_output_dir = "out"  # Next.js NO genera "out/"
```

**✅ AHORA (Correcto):**

```toml
pages_build_output_dir = ".next"  # Next.js genera ".next/"
```

### 2. Variables de Entorno

**Removido del wrangler.toml:**

```toml
# ❌ NO poner NEXT_PUBLIC_* aquí
NEXT_PUBLIC_SUPABASE_URL = "..."
NEXT_PUBLIC_SUPABASE_ANON_KEY = "..."
```

**✅ Ya configuradas en Dashboard:**

- `NEXT_PUBLIC_SUPABASE_URL` ✅
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅

---

## 🚀 Configuración Final Dashboard

### Build Settings (Cloudflare Pages Dashboard)

```yaml
Build command: cd apps/web-app && pnpm install && pnpm build
Build output directory: apps/web-app/.next
Root directory: (empty)
Framework preset: Next.js
Branch: main
```

### Environment Variables (Ya configuradas ✅)

**Production:**

- `NEXT_PUBLIC_SUPABASE_URL` = `https://knywotiidsydsaveqkjs.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbGc...` (tu key)

**Opcionales (agregar si el build falla):**

- `NODE_ENV` = `production`
- `NEXT_PUBLIC_NODE_ENV` = `production`

---

## 📁 Estructura de Archivos Correcta

```
apps/web-app/
├── .next/                    ← Next.js build output
│   ├── server/
│   ├── static/
│   └── BUILD_ID
├── src/
│   └── app/
│       ├── page.tsx
│       ├── layout.tsx
│       └── auth/
├── package.json
├── next.config.mjs
└── wrangler.toml             ← Configuración Cloudflare
```

---

## 🎯 Próximos Pasos

### Paso 1: Commit y Push

```bash
git add apps/web-app/wrangler.toml CLOUDFLARE_DEPLOYMENT_SOLUTION.md
git commit -m "fix(cloudflare): corregir pages_build_output_dir a .next

- Cambiar output directory de 'out' a '.next' (correcto para Next.js)
- Remover variables NEXT_PUBLIC_* de wrangler.toml (ya en dashboard)
- Agregar documentación de solución completa"

git push origin main
```

### Paso 2: Verificar Deployment

**Cloudflare Pages detectará el nuevo commit automáticamente.**

Monitorea en:

```
https://dash.cloudflare.com/
→ Workers & Pages
→ autamedica-web-app
→ Deployments (último)
```

### Paso 3: Verificar Build Logs

**Buscar en logs:**

```
✅ Cloning repository
✅ Installing dependencies
✅ Building application
   → next build
   → Generating .next/ directory
✅ Deploying to Cloudflare edge
✅ Success! Deployed to https://autamedica-web-app.pages.dev
```

---

## 🐛 Si Aún Falla

### Error: "Build output directory not found"

**Causa:** Build command incorrecto
**Solución:**

```bash
# Dashboard → Build configuration → Edit
Build command: pnpm install && pnpm build:packages:core && cd apps/web-app && pnpm build
Build output: apps/web-app/.next
```

### Error: "Module not found: @autamedica/tailwind-config"

**Causa:** Packages no compilados antes de web-app
**Solución:** Usar el build command completo:

```bash
pnpm install && pnpm build:packages:core && cd apps/web-app && pnpm build
```

### Error: "NEXT_PUBLIC_SUPABASE_URL is undefined"

**Causa:** Variables no configuradas en el scope correcto
**Solución:**

1. Dashboard → Environment variables
2. Verificar que estén en **Production** scope
3. Trigger nuevo deployment (Retry deployment)

---

## 📊 Resultado Esperado

### Build Exitoso

```
✓ Compiled successfully
  Collecting page data ...
  Generating static pages (10/10)
✓ Build completed

Route (app)                                 Size  First Load JS
┌ ○ /                                    11.7 kB         114 kB
├ ○ /auth/callback                       1.74 kB         147 kB
├ ○ /auth/login                          3.25 kB         148 kB
├ ○ /auth/register                       3.43 kB         148 kB
└ ○ /auth/select-role                    2.45 kB         147 kB

○  (Static)  prerendered as static content
```

### Deployment URL

```
✅ https://autamedica-web-app.pages.dev
   Deployed successfully to Cloudflare edge
```

---

## 🎯 Alternativa: Workers + Assets (Avanzado)

Si en el futuro quieres usar Workers + Assets (como en la doc compartida):

### 1. Crear Worker Script

```javascript
// apps/web-app/src/worker.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API routes
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Serve static assets
    return env.ASSETS.fetch(request);
  },
};
```

### 2. Actualizar wrangler.toml

```toml
name = "autamedica-web-app"
main = "src/worker.js"
compatibility_date = "2024-01-01"

[assets]
directory = "./.next"
not_found_handling = "single-page-application"
binding = "ASSETS"
run_worker_first = ["/api/*"]
```

### 3. Deploy Manual

```bash
cd apps/web-app
wrangler deploy
```

**Nota:** Esto es más avanzado y solo necesario si requieres lógica custom en el edge.

---

## 📚 Referencias

- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Next.js Build Output](https://nextjs.org/docs/app/api-reference/next-config-js/output)
- [wrangler.toml Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

---

**Última actualización:** 2025-09-30 22:00:00
**Cambios aplicados:** wrangler.toml corregido
**Próximo paso:** Commit + Push → Deploy automático
