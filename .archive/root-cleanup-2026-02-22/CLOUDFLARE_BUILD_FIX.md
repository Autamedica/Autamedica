# 🔧 Fix: Cloudflare Pages Build Failing

## 🚨 Error Actual

```
@autamedica/web-app:build: > Build failed because of webpack errors
Command failed with exit code: 1
```

## 🎯 Problema

El build command en Cloudflare Pages está ejecutando `build:cloudflare` que incluye `opennextjs-cloudflare build`, causando errores de webpack.

## ✅ Solución: Simplificar Build Command

### Opción A: Build Estándar Next.js (RECOMENDADO)

**En Cloudflare Pages Dashboard:**

1. Ir a: `Settings → Builds & Deployments → Build Configuration`

2. Cambiar:

```bash
# ❌ ACTUAL (falla)
Build command: cd apps/web-app && pnpm run build:cloudflare

# ✅ CORRECTO (simplificado)
Build command: cd apps/web-app && pnpm install && pnpm build

# Build output directory
apps/web-app/.next

# Root directory
(dejar vacío)

# Framework preset
Next.js
```

### Opción B: Build con Packages Core

Si web-app necesita packages compilados:

```bash
Build command: pnpm install && pnpm build:packages:core && cd apps/web-app && pnpm build
```

### Opción C: Usando Turbo (Más Rápido)

```bash
Build command: pnpm install && pnpm turbo run build --filter=@autamedica/web-app --only
```

## 🔍 Diagnóstico: ¿Por qué falla opennextjs-cloudflare?

El comando actual:

```bash
cd ../.. &&
pnpm build:packages:core &&
pnpm turbo run build --filter=@autamedica/web-app --only &&
cd apps/web-app &&
opennextjs-cloudflare build  # ← FALLA AQUÍ
```

**Problemas identificados:**

1. **Monorepo context:** OpenNext no encuentra correctamente las dependencias en el monorepo
2. **Workspace dependencies:** `@autamedica/tailwind-config` puede no estar resuelto
3. **Build artifacts:** OpenNext intenta bundlear packages internos que causan conflictos
4. **Webpack config:** Next.js 15.5.4 con OpenNext 1.8.3 puede tener incompatibilidades

## 📝 Configuración Completa Cloudflare Pages

```yaml
# Settings → Builds & Deployments

Production branch: main
Build command: cd apps/web-app && pnpm install && pnpm build
Build output directory: apps/web-app/.next
Root directory: (empty)
Framework preset: Next.js
Node version: 22.16.0 (ya detectado correctamente)

# Environment Variables (Production)
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://knywotiidsydsaveqkjs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0eXZkaXJjZmhtZGppYWVscWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2Njc4NTUsImV4cCI6MjA3MjI0Mzg1NX0.DeEm08k7QOrKObWaz8AUaOB5N6Z2QZhZHFaUf2siALA
NEXT_PUBLIC_APP_URL=https://autamedica.com
NEXT_PUBLIC_NODE_ENV=production
SKIP_ENV_VALIDATION=true
```

## 🚀 Pasos para Aplicar el Fix

### 1. Actualizar Configuración en Dashboard

```
1. https://dash.cloudflare.com/
2. Account → Workers & Pages
3. Click "autamedica-web-app"
4. Settings → Builds & Deployments
5. Build Configuration → Edit
6. Aplicar cambios arriba
7. Save
```

### 2. Trigger Nuevo Deploy

```
1. Deployments tab
2. "Create deployment"
3. Select branch: main
4. Deploy
```

**O desde git:**

```bash
git commit --allow-empty -m "trigger: rebuild con nueva configuración"
git push origin main
```

## 🔧 Alternativa: Modificar package.json

Si prefieres mantener `build:cloudflare` pero sin OpenNext:

```json
{
  "scripts": {
    "build:cloudflare": "cd ../.. && pnpm build:packages:core && pnpm turbo run build --filter=@autamedica/web-app --only"
  }
}
```

**Luego commit y push:**

```bash
git add apps/web-app/package.json
git commit -m "fix(web-app): remover opennextjs-cloudflare del build"
git push origin main
```

## 📊 Resultado Esperado

**Build exitoso en ~2-3 minutos:**

```
✓ Next.js build completed
✓ Static pages generated (10 pages)
✓ Deployment successful
→ https://autamedica-web-app.pages.dev
```

## 🐛 Si Aún Falla

### Ver logs completos de webpack:

1. En Cloudflare Dashboard → Deployments
2. Click en el deployment fallido
3. Ver "Build log" completo
4. Buscar líneas que contengan:
   - `Module not found`
   - `Can't resolve`
   - `Error compiling`

### Errores comunes y soluciones:

**Error: "Module not found: Can't resolve '@autamedica/tailwind-config'"**

```bash
# Solución: Asegurar que packages estén en dependencies
Build command: pnpm install --frozen-lockfile && pnpm build:packages:core && cd apps/web-app && pnpm build
```

**Error: "process.env is not defined"**

```bash
# Solución: Agregar NODE_ENV a environment variables en dashboard
```

**Error: "Middleware error"**

```bash
# Solución: Verificar que middleware.ts no use Node.js APIs
# Edge runtime no soporta: fs, crypto (Node), process (excepto env)
```

## 📚 Referencias

- [Next.js on Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [Turborepo Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Guía completa deployment
- [DEPLOYMENT_ATTEMPTS_REPORT.md](./DEPLOYMENT_ATTEMPTS_REPORT.md) - Historial de intentos

---

**Generado:** 2025-09-30 21:40:00
**Error:** Webpack build failure en Cloudflare Pages
**Fix:** Simplificar build command, remover OpenNext
