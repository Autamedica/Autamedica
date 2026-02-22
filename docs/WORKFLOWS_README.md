# 📋 Workflows de GitHub Actions - AutaMedica

Este documento describe los **3 workflows oficiales** de AutaMedica, adaptados a partir del estándar de calidad y observabilidad de AutoRenta.

## 🎯 **Resumen Ejecutivo**

| **Workflow**           | **Propósito**                                    | **Triggers**                |
| ---------------------- | ------------------------------------------------ | --------------------------- |
| `ci.yml`               | ✅ CI Principal (Lint, Types, Unit, E2E, SEO)    | push, pull_request          |
| `build-and-deploy.yml` | 🚀 Deploy DB, Edge Functions y Web Pages         | push a main/staging/develop |
| `pr-validation.yml`    | 🛡️ Validación cualitativa de PRs (Spam, Secrets) | pull_request                |

---

## 📁 **Detalles por Workflow**

### 1️⃣ `ci.yml` - **CI Automático (Obligatorio)**

**Propósito**: Puerta de entrada crítica para cualquier contribución en el repositorio.
**Pasos Obligatorios (Gates)**:

- Build de packages y apps (`pnpm build`).
- Linter y Typescheckers estrictos.
- Ejecución de Tests Unitarios (`vitest`).
- Verificador de paridad SEO y puntaje garantizado en Lighthouse (bloqueante si SEO < 100).
  _Nota: Si este workflow falla, ninguna PR puede ser mergeada a main o develop._

### 2️⃣ `build-and-deploy.yml` - **Deploy Contínuo**

**Propósito**: Enviar a servidor cada merge exitoso en main y staging.
**Estrategia Matriz**:

- Despliega todas las aplicaciones Astro y Next.js simultáneamente a Cloudflare Pages en ramas idénticas al entorno.
- Actualiza bases de datos (Supabase Migrations).
- Despliega Edge Functions automáticamente.
- Realiza Smoke Tests una vez los entornos han sido publicados.

### 3️⃣ `pr-validation.yml` - **Quality Control (PR)**

**Propósito**: Evitar code-smells agresivos e inteligencia en validación antes del review humano.

- Valida calidad técnica visual (logs `console.log` sueltos, secretos hardcodeados, env vars erróneas).
- Valida tamaño descabellado de PR e informa si el PR fue escrito por bots genéricos sin descripciones.
- Realiza comprobaciones anti-spam para Pull Requests vacías.

---

## 🔧 **Configuración de Secrets en GitHub**

Asegúrate que los siguientes secretos y variables existan en `Settings → Secrets and variables → Actions`:

| **Secret**                 | **Uso**                                   |
| -------------------------- | ----------------------------------------- |
| `CLOUDFLARE_API_TOKEN`     | Despliegue de Pages y API Cloudflare.     |
| `CLOUDFLARE_ACCOUNT_ID`    | Identificador único Cloudflare.           |
| `SUPABASE_PROJECT_ID`      | Project Ref para DB Push y Functions.     |
| `SUPABASE_ACCESS_TOKEN`    | Personal API Token de la cuenta Supabase. |
| `SUPABASE_DB_PASSWORD`     | Contraseña DB en Supabase.                |
| `PUBLIC_SUPABASE_URL`      | Variable inyectada en Build de apps Auth. |
| `PUBLIC_SUPABASE_ANON_KEY` | Variable de Build de cliente anónimo.     |

**© 2026 AutaMedica | Standard Operating Procedure CI/CD**
