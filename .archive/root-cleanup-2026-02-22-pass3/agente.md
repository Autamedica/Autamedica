# AutaMedica – Agent Queue

**Sistema Agentic OS** - Cola de tareas para ChatGPT/Claude
Última actualización: 2025-10-06

---

## 📋 Hoy

- [ ] Reemplazar `console.*` por `LoggerService` en 5 archivos de producción
  - `apps/doctors/src/components/...`
  - `apps/patients/src/components/...`
  - Ver lista completa en `.logs/console-violations.log`

- [ ] Verificar CORS en `/auth/session` con `Origin=patients.autamedica.com`
  - No wildcards (`*`)
  - Usar allowedOrigins explícitos

- [ ] Corregir warnings de `useEffect` deps en doctors app
  - `components/HorizontalExperience.tsx`
  - `components/PerformanceWidget.tsx`

- [ ] Validar que no existan `apps/**/pages/` (solo App Router)
  - Ejecutar: `find apps -type d -name pages`
  - Migrar a `app/` si se encuentran

- [ ] Ejecutar screenshots y subir a `generated-docs/`
  - Patients: https://patients.autamedica.com
  - Doctors: https://doctors.autamedica.com
  - Auth: https://auth.autamedica.com/auth/login/?role=patient

---

## 📅 Esta semana

- [ ] Añadir tests Vitest para `@autamedica/auth`
  - Verificar presencia de `.d.ts`
  - Test de exports principales

- [ ] Documentar RLS policies en `generated-docs/audit-db-rls.md`
  - Tablas: profiles, doctors, patients, medical_records, appointments, companies, patient_care_team
  - Verificar `rowsecurity = true`

- [ ] Canary deployment 10→50→100 en Cloudflare Pages
  - Smoke automatizado con `node_fetch_check.mjs`
  - Screenshots comparativos

- [ ] Actualizar dependencias con vulnerabilidades
  - Ver `pnpm audit --audit-level moderate`
  - Aplicar patches en `package.json` overrides

---

## 🎯 Este mes

- [ ] Migrar packages críticos desde DevAltamedica
  - `@altamedica/types` (190+ tipos médicos)
  - `@altamedica/auth` (MFA avanzado)
  - `@altamedica/database` (HIPAA + audit)

- [ ] Implementar sistema de logging centralizado
  - Reemplazar todos los `console.*`
  - Usar `LoggerService` de `@autamedica/shared`

- [ ] Configurar monitoring con Upstash/Sentry
  - Error tracking
  - Performance monitoring
  - User analytics (HIPAA-compliant)

---

## ✅ Hecho

- [x] Agentic OS workflow multiagente + rollback real (2025-10-06)
- [x] Scripts de QA: `node_fetch_check.mjs`, `screenshot_check.mjs`, `post_task_report.py`
- [x] Hooks de Husky con validaciones de Router y convenciones SSK_FAE
- [x] Validador de convenciones: `validate-conventions.mjs`
- [x] Cleanup de duplicados con hash checking
- [x] Headers de seguridad en apps/\* (HSTS, CSP, X-Frame-Options)
- [x] patient_care_team migration + RLS policies
- [x] Sistema de autenticación completo con Supabase
- [x] Arquitectura Multi-App (web, doctors, patients, companies, admin)
- [x] Marketplace médico integrado en companies app
- [x] CI/CD enterprise con workflows en español
- [x] Deployment automático a Cloudflare Pages

---

## 🤖 Workflow Agéntico - Comandos Principales

### 🚀 Ejecución Local del Workflow Completo

```bash
# Ejecutar workflow completo (equivalente a GitHub Actions)
bash scripts/run-agentic-local.sh

# Dry-run (ver qué se ejecutaría sin hacerlo)
bash scripts/run-agentic-local.sh --dry-run

# Ejecutar agente específico
bash scripts/run-agent.sh agent_code
bash scripts/run-agent.sh agent_db
bash scripts/run-agent.sh agent_security
```

### 📋 Agentes Disponibles

**1. agent_code** (180 min)

- Pre-commit emulation (lint + vitest)
- Pre-push emulation (typecheck + build)
- Router validation (App Router only)
- Cleanup duplicates

**2. agent_db** (180 min)

- Fetch DB credentials via MCP
- DB snapshot before changes
- Run migrations
- Validate RLS policies

**3. agent_security** (120 min)

- Enforce security headers
- Node fetch checks
- Screenshot validation

**4. agent_dns_deploy** (90 min)

- Build & deploy to Cloudflare Pages
- Validate headers in production
- Post-deployment screenshots

**5. agent_qa** (60 min)

- Final mandatory tests
- Full system validation

**6. agent_docs** (20 min)

- Auto-commit generated docs
- Update README and logs

### 🎨 Impact Pack (Validación Avanzada)

```bash
# Visual regression testing
pnpm dlx playwright test --project=chromium

# DB drift detection
supabase db diff --linked

# Lighthouse CI
lhci autorun --collect.url=https://patients.autamedica.com

# k6 smoke tests
k6 run scripts/k6-smoke.js

# SLO budget check
node scripts/slo-budget-check.mjs

# Health gate check
node scripts/health-gate.mjs
```

### 🔧 Health Checks y Validaciones

```bash
# Pre-workflow validation
pnpm run health && node scripts/node_fetch_check.mjs

# Post-task report
python3 scripts/post_task_report.py

# Validate conventions
node scripts/validate-conventions.mjs

# Cleanup duplicates
bash scripts/cleanup_duplicates.sh
```

### 📊 Configuración del Workflow

- **Global**: `/root/.claude/agentic-config.json`
- **Local**: `/root/Autamedica/.claude/agentic-workflow.json`
- **GitHub**: `.github/workflows/autamedica-agentic.yml`

---

## 🔧 Notas Técnicas

### Convenciones de Nomenclatura (SSK_FAE/snake_híbrido)

- **DB (Supabase)**: `snake_case` para tablas/columnas
  - Ejemplo: `patient_care_team`, `doctor_id`
- **TS Types**: `PascalCase`
  - Ejemplo: `PatientCareTeam`, `UserRole`
- **Variables TS**: `camelCase`
  - Ejemplo: `userId`, `patientList`
- **Carpetas**: `kebab-case`
  - Ejemplo: `patient-care`, `auth-forms`
- **Componentes**: `PascalCase.tsx`
  - Ejemplo: `PatientDashboard.tsx`, `LoginForm.tsx`

### Router (Next.js App Router)

- **✅ Usar**: `app/` con `page.tsx`, `layout.tsx`
- **❌ No usar**: `pages/` (Pages Router legacy)
- **Inyección de componentes**: En el `page.tsx` correspondiente
  ```tsx
  // apps/patients/app/(consultation)/appointments/page.tsx
  import CreateAppointmentModal from "@/components/appointments/CreateAppointmentModal";
  export default function Page() {
    return <CreateAppointmentModal />;
  }
  ```

### Comandos de Verificación

```bash
# Validar convenciones
node scripts/validate-conventions.mjs

# Fetch real a producción
node scripts/node_fetch_check.mjs

# Screenshots de apps
node scripts/screenshot_check.mjs

# Reporte post-tarea
python3 scripts/post_task_report.py

# Smoke test completo
bash scripts/smoke-all.sh

# Cleanup de duplicados
bash scripts/cleanup_duplicates.sh
```

---

## 📊 Métricas de Salud

| Métrica         | Estado      | Objetivo      |
| --------------- | ----------- | ------------- |
| Build Success   | ✅ 100%     | 100%          |
| TypeCheck       | ✅ 0 errors | 0 errors      |
| ESLint Warnings | ⚠️ ~50      | 0             |
| Test Coverage   | 📊 ~40%     | 80%           |
| Security Audit  | ✅ 0 HIGH   | 0 HIGH/MEDIUM |
| Deployment      | ✅ Auto     | Auto + Canary |

---

## 🚨 Alertas y Bloqueos

**Ninguno actualmente** ✅

---

_Este archivo es actualizado automáticamente por el agente `agent_docs` del workflow Agentic OS._
