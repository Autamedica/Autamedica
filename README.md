# 🏥 AutaMedica - Sistema de Roles Operativo

> **Plataforma médica integral** con **sistema de roles normalizado** y arquitectura multi-app completamente operativa.
> Migración completa de company → organization + roles funcional con datos de prueba listos.

---

## 🎯 **ESTADO ACTUAL: SISTEMA DE ROLES OPERATIVO**

**✅ COMPLETADO EXITOSAMENTE**

- 🔐 **Migración de roles aplicada** - Sistema organization + user_roles funcional
- 📊 **Datos de prueba cargados** - 5 usuarios, 1 organización, roles asignados
- 🧪 **Tests pasando** - 29/29 tests de role routing exitosos
- 🚀 **CI/CD operativo** - GitHub Actions con validación automática
- 🔄 **RLS configurado** - Políticas de seguridad por rol implementadas

### 🔐 **Roles Disponibles y Portales**

| Rol                  | Portal de Destino    | URL                                | Estado            |
| -------------------- | -------------------- | ---------------------------------- | ----------------- |
| `organization_admin` | **Admin Portal**     | `https://admin.autamedica.com`     | ✅ Operativo      |
| `company`            | **Companies Portal** | `https://companies.autamedica.com` | ✅ Operativo      |
| `company_admin`      | **Companies Portal** | `https://companies.autamedica.com` | ✅ Legacy Support |
| `doctor`             | **Doctors Portal**   | `https://doctors.autamedica.com`   | ✅ Operativo      |
| `patient`            | **Patients Portal**  | `https://patients.autamedica.com`  | ✅ Operativo      |
| `admin`              | **Admin Portal**     | `https://admin.autamedica.com`     | ✅ Operativo      |
| `platform_admin`     | **Main Platform**    | `https://www.autamedica.com`       | ✅ Operativo      |

---

## 🧠 Insights Operativos (Sesión 2026-02-22)

- **Root cause de redirección rota (doctors/companies)**: se estaban usando slugs de portal (`doctors`, `companies`) como base URL en middleware, lo que rompía redirecciones cross-portal.
- **Root cause adicional de `localhost` en producción**: cuando `NODE_ENV` no estaba disponible en runtime/browser, `isDevelopment()` devolvía `true` y forzaba fallbacks a `http://localhost:3000`.
- **Fix aplicado en main**:
  - `fix(auth): normalize cross-portal redirects to absolute role URLs`
  - `fix(auth): avoid localhost fallback for login redirects in edge`
  - `fix(env): treat non-local browser hosts as production by default`
- **Regla de oro para redirects**: para cambio de portal usar siempre `getTargetUrlByRole(...)` (URL absoluta) y nunca un slug como base de `new URL(...)`.
- **Patchright + Supergravity (CDP) estable**:
  - Si `curl http://127.0.0.1:9222/json/version` falla, Chrome no quedó con CDP activo.
  - Cerrar Chrome completo y reabrir con `--remote-debugging-port=9222`.
  - Compartir `webSocketDebuggerUrl` exacto para conectar la sesión desde Patchright Streaming.
- **Checklist rápido post-deploy auth**:
  - `https://www.autamedica.com/auth/login?portal=patients|doctors|companies` carga formulario.
  - `patients/doctors/companies.autamedica.com` no debe redirigir a `localhost`.
  - `node scripts/monitor-auth.mjs` y `node scripts/node_fetch_check.mjs` en verde.

---

## 🚀 Inicio Rápido

```bash
# Instalar dependencias
pnpm install

# Desarrollo (todas las apps)
pnpm dev

# Tests del sistema de roles
node test-role-routing.mjs

# Validar contratos
pnpm docs:validate

# Commit y push (manejo automático de permisos)
./scripts/smart-commit.sh "feat: mi cambio"
```

---

## 🏗️ **Sistema de Roles - Arquitectura**

### 📊 **Tablas Implementadas**

```sql
-- Organizaciones normalizadas
public.organizations (id, owner_profile_id, name, slug, type, metadata, ...)

-- Membresías de organizaciones
public.org_members (organization_id, profile_id, role, status, metadata, ...)

-- Sistema de roles granular
public.user_roles (id, profile_id, organization_id, role, granted_by, expires_at, ...)
```

### 🔄 **Migración de Datos**

- ✅ **companies → organizations** - Migración automática con preservación de datos
- ✅ **company_members → org_members** - Roles mapeados correctamente
- ✅ **Backward compatibility** - `company_admin` sigue funcionando
- ✅ **Slugs generados** - URLs amigables para organizaciones

### 👥 **Usuarios de Prueba Disponibles**

| Email                       | Rol Global           | Organización | Propósito                |
| --------------------------- | -------------------- | ------------ | ------------------------ |
| `admin@clinica-demo.com`    | `organization_admin` | Clínica Demo | Testing admin portal     |
| `company@clinica-demo.com`  | `company_admin`      | Clínica Demo | Testing companies portal |
| `doctor@clinica-demo.com`   | `doctor`             | -            | Testing doctors portal   |
| `patient@clinica-demo.com`  | `patient`            | -            | Testing patients portal  |
| `platform@clinica-demo.com` | `platform_admin`     | -            | Testing platform admin   |

**Organización de prueba**: `Clínica Demo AutaMedica` (slug: `clinica-demo`)

---

## 🧪 **Testing y Validación**

### 🔍 **Queries de Verificación**

```sql
-- Verificar organización creada
SELECT id, name, slug FROM public.organizations
WHERE id = '00000000-0000-0000-0000-000000000111';

-- Verificar roles de usuario
SELECT profile_id, role, organization_id
FROM public.user_roles
WHERE metadata->>'seed' = 'true'
ORDER BY role;

-- Verificar membresías
SELECT om.organization_id, om.profile_id, om.role, ur.role as user_global_role
FROM public.org_members om
JOIN public.user_roles ur ON om.profile_id = ur.profile_id
WHERE om.organization_id = '00000000-0000-0000-0000-000000000111';
```

### ⚡ **Test Automatizado**

```bash
# Ejecutar tests de routing
node test-role-routing.mjs

# Resultado esperado:
# ✅ organization_admin → https://admin.autamedica.com
# ✅ company → https://companies.autamedica.com
# ✅ company_admin (legacy) → https://companies.autamedica.com
# 📊 Summary: 7/7 roles configured correctly
```

---

## 🚀 **Aplicaciones Multi-Portal**

### 🌐 **Web-App** (puerto 3000)

- **Landing Page + Autenticación Central**
- **Role Selection** - Selección de rol post-login
- **Redirección automática** según rol del usuario
- **OAuth completo** con Google + email magic links

### 👨‍⚕️ **Doctors** (puerto 3001)

- **Portal médico profesional** estilo VSCode
- **Sistema de videollamadas** WebRTC integrado
- **Dashboard médico** con información de pacientes
- **Componentes especializados** para workflow médico

### 👤 **Patients** (puerto 3002)

- **Portal personal del paciente** responsive
- **Sistema de temas** personalizables
- **Historial médico** y resultados
- **Interfaz amigable** optimizada para pacientes

### 🏢 **Companies** (puerto 3003)

- **Centro de Control de Crisis** médicas
- **Marketplace Médico** integrado
- **Dashboard corporativo** para empresas
- **Sistema de contratación** de profesionales

### ⚙️ **Admin** (puerto 3004)

- **Panel administrativo** para organization_admin
- **Gestión de organizaciones** y usuarios
- **Métricas** y reportes del sistema

---

## 📦 **Packages del Sistema**

### 🔐 **@autamedica/auth** - Autenticación + Roles

```typescript
import { getTargetUrlByRole, getPortalForRole } from "@autamedica/shared";

// organization_admin → https://admin.autamedica.com
const adminUrl = getTargetUrlByRole("organization_admin");
const portal = getPortalForRole("organization_admin"); // 'admin'
```

### 🏗️ **@autamedica/types** - Contratos de Roles

```typescript
export type UserRole = "patient" | "doctor" | "company" | "company_admin" | "organization_admin" | "admin" | "platform_admin";

export type OrganizationRole = "owner" | "admin" | "member" | "billing" | "support";
```

### 🛠️ **@autamedica/shared** - Role Utilities

```typescript
import { isValidRole, normalizeRole } from "@autamedica/shared";

const isValid = isValidRole("organization_admin"); // true
const normalized = normalizeRole("company_admin"); // 'company'
```

---

## 🧱 **Patrones Arquitecturales**

Sobre la arquitectura de 7 capas (UI → Hook → Service → API Client → Controller → Service → Repository):

| Patrón            | Ubicación                      | Propósito                                                       |
| ----------------- | ------------------------------ | --------------------------------------------------------------- |
| **Ports**         | `packages/types/src/ports/`    | Interfaces abstractas de repos + adapter factories para testing |
| **Domain Events** | `packages/shared/src/events/`  | Event bus tipado para desacoplar side-effects                   |
| **Use Cases**     | `apps/web/src/lib/*/usecases/` | Flujos de negocio completos con inyección de dependencias       |
| **CQRS Lite**     | `apps/web/src/lib/*/queries/`  | Read models de dashboard separados de lógica de negocio         |

Ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) para detalle completo.

---

## 🔄 **CI/CD y Deployment**

### ✅ **GitHub Actions Operativo**

- **Validación automática** - TypeScript + ESLint + Build
- **Tests de roles** - Ejecución automática en PRs
- **Deploy automático** - Cloudflare Pages configurado
- **Smoke tests** - Validación post-deployment

### 🚀 **URLs de Producción**

- **Web-App**: https://autamedica-web-app.pages.dev
- **Doctors**: https://autamedica-doctors.pages.dev
- **Patients**: https://autamedica-patients.pages.dev
- **Companies**: https://autamedica-companies.pages.dev

---

## 🛡️ **Seguridad y RLS**

### 🔒 **Row Level Security**

```sql
-- Solo owners/admins pueden gestionar su organización
CREATE POLICY "Organization owners manage organization"
ON public.organizations FOR ALL TO authenticated
USING (owner_profile_id = auth.uid() OR EXISTS (...));

-- Usuarios ven solo sus propios roles
CREATE POLICY "User roles read"
ON public.user_roles FOR SELECT TO authenticated
USING (profile_id = auth.uid() OR EXISTS (...));
```

### 🔐 **Funciones de Utilidad**

```sql
-- Selección automática de rol primario
SELECT public.select_primary_role_for_profile('user-uuid');

-- Sincronización automática de roles
TRIGGER sync_profile_role_after_user_roles
```

---

## 🎯 **Próximos Pasos**

### 1. **Testing Manual** 🧪

- Probar login con usuarios de prueba
- Validar redirects por rol
- Verificar RLS policies funcionando

### 2. **Features Avanzadas** 🚀

- Dashboard admin con métricas
- Gestión de organizaciones vía UI
- Sistema de invitaciones

### 3. **Optimización** ⚡

- Performance monitoring
- Caching de roles
- Audit logs

---

## 🛠️ Desarrollo - Scripts de Utilidad

### Smart Commit Script

Script inteligente para manejar commits y push con permisos correctos.

```bash
# Commit + Push en un comando
./scripts/smart-commit.sh "feat: nueva funcionalidad"

# Amend del último commit
./scripts/smart-commit.sh --amend

# Solo push (sin commit)
./scripts/smart-commit.sh --push-only

# Ver estado del repo
./scripts/smart-commit.sh --status

# Ver ayuda completa
./scripts/smart-commit.sh --help
```

**Características:**

- ✅ Auto-corrección de permisos (root vs edu)
- ✅ Commits creados como usuario `edu`
- ✅ Push ejecutado con credenciales de `root`
- ✅ Bypass automático de hooks problemáticos
- ✅ Verificación de PR asociado después del push

**Documentación completa**: Ver `scripts/README.md`

---

## 🐛 Troubleshooting

### Problemas de Roles

```bash
# Verificar configuración de roles
node test-role-routing.mjs

# Regenerar tipos de base de datos
pnpm db:generate && pnpm db:validate

# Verificar seeds aplicados
psql "$SUPABASE_DB_URL" -c "SELECT COUNT(*) FROM public.user_roles WHERE metadata->>'seed' = 'true';"
```

### Build Errors

```bash
# Limpiar cache completo
rm -rf node_modules dist .next .turbo
pnpm install && pnpm build

# Validar contratos
pnpm docs:validate
```

---

## 📄 **Documentación Técnica**

- **Migración SQL**: `supabase/migrations/20250929_introduce_role_system.sql`
- **Seeds**: `supabase/seed_role_system.sql`
- **Tests**: `test-role-routing.mjs`
- **Status Report**: `ROLE_SYSTEM_STATUS.md`
- **PR**: [#5 - introduce organization_admin role system](https://github.com/ecucondorSA/Autamedica/pull/5)

---

## 🏆 **Estado del Proyecto**

**✅ PRODUCTION READY**

- ✅ 29/29 tests pasando
- ✅ 0 warnings ESLint
- ✅ TypeScript strict mode
- ✅ CI/CD operativo
- ✅ Datos de prueba cargados
- ✅ RLS configurado
- ✅ Backward compatibility

**🎯 Ready for staging deployment!**

---

## 🤖 **Agentic OS - Sistema Multiagente Inteligente**

**AutaMedica Agentic OS** es un sistema de CI/CD avanzado con agentes especializados que ejecutan tareas automatizadas, validaciones integrales, y rollback real ante fallos.

### 🎯 **Características Principales**

- ✅ **Multiagente real**: 6 agentes especializados en jobs separados
- ✅ **Rollback automático**: Reversión de deployments (Cloudflare Pages) y DB ante fallos
- ✅ **QA obligatorio**: Fetch real + screenshots + tests unitarios
- ✅ **Hooks obligatorios**: Pre-commit y pre-push con validaciones estrictas
- ✅ **Validación de convenciones**: SSK_FAE, Router, nomenclatura DB/TS
- ✅ **MCP Supabase**: Integración real para credenciales sin hardcode
- ✅ **Sesiones ilimitadas**: CLAUDE_TIMEOUT_MS=900000 (15min)

### 🏗️ **Agentes del Sistema**

| Agente             | Responsabilidad                         | Herramientas                                       |
| ------------------ | --------------------------------------- | -------------------------------------------------- |
| `agent_code`       | Lint, TypeCheck, Build, Convenciones    | ESLint, TypeScript, validate-conventions.mjs       |
| `agent_db`         | Migraciones, RLS, Performance           | Supabase CLI, psql, MCP                            |
| `agent_security`   | Headers, CORS, CVEs                     | pnpm audit, \_headers validation                   |
| `agent_dns_deploy` | Deploy a Cloudflare Pages               | wrangler, build scripts                            |
| `agent_qa`         | Fetch, Screenshots, Tests               | node_fetch_check.mjs, screenshot_check.mjs, vitest |
| `agent_docs`       | Actualizar README, claude.md, agente.md | Git auto-commit                                    |

### 🚀 **Cómo Ejecutar el Workflow**

#### Automático (push a main):

```bash
git push origin main
# El workflow se ejecuta automáticamente
```

#### Manual (workflow_dispatch):

```bash
# Via GitHub UI
Actions → "AutaMedica Agentic OS" → Run workflow

# Via CLI
gh workflow run "AutaMedica Agentic OS"
```

### 📋 **Scripts de QA Disponibles**

```bash
# Validar convenciones de nomenclatura
node scripts/validate-conventions.mjs

# Fetch real a URLs de producción
node scripts/node_fetch_check.mjs

# Capturar screenshots con Playwright
node scripts/screenshot_check.mjs

# Generar reporte post-tarea (Python)
python3 scripts/post_task_report.py

# Cleanup de duplicados
bash scripts/cleanup_duplicates.sh

# Smoke test completo
bash scripts/smoke-all.sh
```

### 🔧 **Convenciones de Nomenclatura (SSK_FAE)**

El sistema valida automáticamente las convenciones en cada commit y push:

- **DB (Supabase)**: `snake_case` para tablas/columnas
  - ✅ `patient_care_team`, `doctor_id`
  - ❌ `patientCareTeam`, `doctorId`

- **TS Types**: `PascalCase`
  - ✅ `PatientCareTeam`, `UserRole`
  - ❌ `patient_care_team`, `userRole`

- **Variables TS**: `camelCase`
  - ✅ `userId`, `patientList`
  - ❌ `user_id`, `patient_list`

- **Carpetas**: `kebab-case`
  - ✅ `patient-care`, `auth-forms`
  - ❌ `patientCare`, `auth_forms`

- **Componentes**: `PascalCase.tsx`
  - ✅ `PatientDashboard.tsx`, `LoginForm.tsx`
  - ❌ `patientDashboard.tsx`, `login-form.tsx`

### 🗂️ **Router: App Router (No Pages)**

AutaMedica usa **Next.js App Router** exclusivamente:

- ✅ `apps/*/app/` con `page.tsx`, `layout.tsx`
- ❌ `apps/*/pages/` (bloqueado por hooks y CI)

Ejemplo de estructura:

```
apps/patients/
├── app/
│   ├── (consultation)/
│   │   └── appointments/
│   │       └── page.tsx  ← Inyecta componentes aquí
│   └── layout.tsx
└── src/
    └── components/
        └── appointments/
            └── CreateAppointmentModal.tsx
```

### 🔄 **Rollback Real**

Si el workflow falla, el job `rollback_on_fail` ejecuta:

#### Cloudflare Pages Rollback:

```bash
# Obtiene deployment previo y revierte
prev=$(npx wrangler pages deployment list --json | jq -r '.[1].id')
npx wrangler pages deployment rollback "$prev" --project-name=autamedica-doctors
```

#### DB Rollback:

```bash
# Si existe backup, restaura
psql "$DATABASE_URL" -f generated-docs/db-backup.sql
```

### 📊 **Artifacts Generados**

Cada ejecución del workflow genera:

- `generated-docs/POST_TASK_REPORT.json` - Resumen consolidado
- `generated-docs/POST_TASK_REPORT.md` - Versión Markdown
- `generated-docs/fetch-check-report.json` - Resultados de fetch
- `generated-docs/screenshot-check-report.json` - Resultados de screenshots
- `generated-docs/*.png` - Screenshots de producción
- `.logs/*.log` - Logs de cada agente

### 🔐 **Secrets Requeridos (GitHub)**

Configura estos secrets en GitHub → Settings → Secrets:

```bash
SUPABASE_MCP_ENDPOINT        # Endpoint MCP para DB credentials
SUPABASE_MCP_TOKEN           # Token de autenticación MCP
SECRET_MANAGER_ENDPOINT      # Endpoint para otros secretos
SECRET_MANAGER_TOKEN         # Token de autenticación
CLOUDFLARE_API_TOKEN         # Para deploy y rollback
```

### 📖 **Documentación Viva**

El sistema mantiene 3 documentos actualizados automáticamente:

- **README.md** (este archivo) - Documentación del proyecto
- **CLAUDE.md** - Guía para Claude Code con reglas y metodología
- **agente.md** - Cola de tareas para ChatGPT/Claude con prioridades

### 🎯 **Cola de Tareas Actual**

Ver [`agente.md`](./agente.md) para la lista completa de tareas pendientes y completadas.

---

**AutaMedica © 2025** - Sistema de roles empresarial operativo + Agentic OS
