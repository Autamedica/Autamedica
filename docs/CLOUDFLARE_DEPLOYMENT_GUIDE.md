# 🌐 Guía de Despliegue en Cloudflare Pages

Esta guía te ayudará a desplegar tu monorepo de AutaMedica en Cloudflare Pages.

## 📋 Configuración Completada

✅ **Wrangler CLI instalado** (v4.38.0)
✅ **OpenNext adapter configurado** en web-app
✅ **Archivos wrangler.toml** creados para cada app
✅ **Scripts de build** configurados

## 🚀 Método 1: Despliegue Manual via Cloudflare Dashboard

### Paso 1: Configura cada proyecto en Cloudflare Pages

1. Ve a [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages
2. Crea un nuevo proyecto para cada app:

#### 🌐 **Web App Principal**

```
Project Name: autamedica-web-app
Build Command: cd apps/web-app && pnpm build:cloudflare
Output Directory: apps/web-app/.open-next/dist
Root Directory: /
Environment Variables:
  - NODE_ENV: production
  - SKIP_ENV_VALIDATION: true
  - NEXT_PUBLIC_APP_URL: https://autamedica.com
```

#### 👨‍⚕️ **Doctors App**

```
Project Name: autamedica-doctors
Build Command: cd apps/doctors && pnpm add @opennextjs/cloudflare && pnpm build:cloudflare
Output Directory: apps/doctors/.open-next/dist
Root Directory: /
Environment Variables:
  - NODE_ENV: production
  - SKIP_ENV_VALIDATION: true
  - NEXT_PUBLIC_APP_URL: https://doctors.autamedica.com
```

#### 👤 **Patients App**

```
Project Name: autamedica-patients
Build Command: cd apps/patients && pnpm add @opennextjs/cloudflare && pnpm build:cloudflare
Output Directory: apps/patients/.open-next/dist
Root Directory: /
Environment Variables:
  - NODE_ENV: production
  - SKIP_ENV_VALIDATION: true
  - NEXT_PUBLIC_APP_URL: https://patients.autamedica.com
```

#### 🏢 **Companies App**

```
Project Name: autamedica-companies
Build Command: cd apps/companies && pnpm add @opennextjs/cloudflare && pnpm build:cloudflare
Output Directory: apps/companies/.open-next/dist
Root Directory: /
Environment Variables:
  - NODE_ENV: production
  - SKIP_ENV_VALIDATION: true
  - NEXT_PUBLIC_APP_URL: https://companies.autamedica.com
```

## 🚀 Método 2: Despliegue via CLI (después de autenticación)

### Paso 1: Autenticación

```bash
wrangler login
```

### Paso 2: Crear proyectos

```bash
# Web App
cd apps/web-app
wrangler pages project create autamedica-web-app --production-branch main

# Doctors
cd ../doctors
wrangler pages project create autamedica-doctors --production-branch main

# Patients
cd ../patients
wrangler pages project create autamedica-patients --production-branch main

# Companies
cd ../companies
wrangler pages project create autamedica-companies --production-branch main
```

### Paso 3: Deploy

```bash
# Desde cada app
pnpm deploy:cloudflare
```

## 🛠️ Scripts Disponibles

### Para cada app (web-app configurada, otros necesitan setup):

```bash
# Build para Cloudflare
pnpm build:cloudflare

# Deploy directo (requiere autenticación)
pnpm deploy:cloudflare
```

## 📦 Setup Restantes Apps

Para configurar las otras apps, ejecuta desde cada directorio:

```bash
# En apps/doctors, apps/patients, apps/companies
pnpm add @opennextjs/cloudflare

# Copia la configuración de web-app:
cp ../web-app/open-next.config.ts .
cp ../web-app/wrangler.toml . # Ya está creado

# Actualiza package.json con scripts de Cloudflare
```

## 🌐 Ventajas de Cloudflare Pages

- ✅ **Monorepo nativo** - Detecta cambios automáticamente
- ✅ **Edge Computing** - Deploy global automático
- ✅ **Zero Config SSL** - HTTPS automático
- ✅ **Preview Deployments** - Branch previews
- ✅ **Integración con GitHub** - Deploy en cada push
- ✅ **Analytics incluído** - Métricas sin configuración

## 🔧 Troubleshooting

### Error: "experimental.esmExternals warning"

```javascript
// En next.config.js, remover:
experimental: {
  esmExternals: 'loose',
},
```

### Error: "node_modules pattern matching"

Revisar `tailwind.config.js` y optimizar patterns:

```javascript
content: [
  './src/**/*.{js,ts,jsx,tsx}',
  '../../packages/*/src/**/*.{js,ts,jsx,tsx}', // Más específico
],
```

### Build timeout

Aumentar límites en Cloudflare Dashboard:

- Build timeout: 20 minutos
- Memory limit: 2GB

## 🎯 Próximos Pasos

1. **Elegir método de deploy** (Dashboard o CLI)
2. **Configurar dominios personalizados** en Cloudflare
3. **Configurar redirects** entre apps si necesario
4. **Setup CI/CD** con GitHub Actions

## 📚 Recursos

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [OpenNext Cloudflare Guide](https://opennext.js.org/cloudflare)
- [Monorepo Configuration](https://developers.cloudflare.com/pages/configuration/monorepos/)
