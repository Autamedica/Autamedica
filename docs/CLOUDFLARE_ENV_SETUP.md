# 🔐 Cloudflare Pages Environment Variables Setup

## 📋 Overview

Este documento explica cómo configurar las environment variables necesarias para los deployments de Cloudflare Pages.

---

## 🎯 Variables Requeridas por App

### **Doctors App** (`autamedica-doctors`)

| Variable                        | Valor Producción                           | Valor Preview                          | Descripción                         |
| ------------------------------- | ------------------------------------------ | -------------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://qxjjrpksmwwrmubhvjew.supabase.co` | _(mismo)_                              | URL de Supabase                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | _(ver GitHub Secrets)_                     | _(mismo)_                              | Anon key de Supabase                |
| `NEXT_PUBLIC_WEB_APP_URL`       | `https://autamedica.com`                   | `https://autamedica-web-app.pages.dev` | URL del Web App para auth redirects |

### **Patients App** (`autamedica-patients`)

| Variable                        | Valor Producción                           | Valor Preview | Descripción          |
| ------------------------------- | ------------------------------------------ | ------------- | -------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://qxjjrpksmwwrmubhvjew.supabase.co` | _(mismo)_     | URL de Supabase      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | _(ver GitHub Secrets)_                     | _(mismo)_     | Anon key de Supabase |

---

## 🛠️ Cómo Configurar en Cloudflare Dashboard

### **Paso 1: Acceder al Dashboard**

1. Ir a https://dash.cloudflare.com/
2. Account: `ecucondor@gmail.com`
3. Navegar a **Pages** en el menú lateral
4. Seleccionar el proyecto (ej: `autamedica-doctors`)

### **Paso 2: Configurar Variables**

1. Click en **Settings** (tab superior)
2. Scroll down a **Environment variables**
3. Click en **Add variable**

**Para PRODUCTION:**

```
Variable name: NEXT_PUBLIC_WEB_APP_URL
Value: https://autamedica.com
Environment: Production
```

**Para PREVIEW:**

```
Variable name: NEXT_PUBLIC_WEB_APP_URL
Value: https://autamedica-web-app.pages.dev
Environment: Preview
```

4. Click **Save**

### **Paso 3: Re-deploy**

Las variables solo se aplican en **nuevos deployments**:

```bash
# Opción 1: Push a GitHub (trigger automático)
git push origin main

# Opción 2: Re-deploy desde Dashboard
Pages → autamedica-doctors → Deployments → (latest) → "Retry deployment"

# Opción 3: Deploy manual con wrangler
cd apps/doctors
pnpm build:cloudflare
wrangler pages deploy .open-next --project-name=autamedica-doctors --branch=main
```

---

## ✅ Verificación

### **1. Check en Cloudflare Dashboard**

Ir a: Pages → Project → Settings → Environment variables

Verificar que todas las variables estén presentes.

### **2. Check en Runtime**

Abrir la app en browser y ejecutar en console:

```javascript
// Debería mostrar el valor correcto (NO localhost)
console.log(process.env.NEXT_PUBLIC_WEB_APP_URL);
```

### **3. Test de Auth Redirect**

En `doctors.autamedica.com`:

- Click en "Iniciar sesión como médico"
- Debería redirigir a `autamedica.com/auth/login?portal=medico`
- NO debería redirigir a `localhost:3000`

---

## 🚨 Troubleshooting

### **Problema: Redirect a localhost**

**Síntoma:**

```
ERR_CONNECTION_REFUSED at http://localhost:3000/auth/login
```

**Causa:** Environment variable no configurada o deployment viejo

**Solución:**

1. Verificar que `NEXT_PUBLIC_WEB_APP_URL` esté en Cloudflare Dashboard
2. Hacer un nuevo deployment (las vars solo se aplican en nuevos builds)
3. Clear browser cache y recargar

### **Problema: Variable undefined**

**Síntoma:**

```javascript
console.log(process.env.NEXT_PUBLIC_WEB_APP_URL); // undefined
```

**Causa:** Variable no tiene prefijo `NEXT_PUBLIC_`

**Solución:**

- ✅ Correcto: `NEXT_PUBLIC_WEB_APP_URL`
- ❌ Incorrecto: `WEB_APP_URL`

Next.js solo expone variables con prefijo `NEXT_PUBLIC_` al cliente.

---

## 📚 Referencias

- **Cloudflare Pages Environment Variables**: https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables
- **Next.js Environment Variables**: https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
- **GitHub Secrets**: https://github.com/yourusername/Autamedica/settings/secrets/actions

---

**Última actualización**: 2025-10-06
**Autor**: Claude Code + Eduardo
