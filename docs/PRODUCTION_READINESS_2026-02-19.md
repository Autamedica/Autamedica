# AutaMedica - Production Readiness Report

> Fecha: 2026-02-19
> Proyecto Supabase: `knywotiidsydsaveqkjs`
> Cloudflare Pages: `autamedica-web`
> Repositorio: `ecucondorSA/Autamedica`

---

## 1. Estado de Infraestructura

### Supabase

| Recurso | Valor |
|---|---|
| Project ID | `knywotiidsydsaveqkjs` |
| URL | `https://knywotiidsydsaveqkjs.supabase.co` |
| Región | `us-east-2` (AWS) |
| PostgreSQL | 17.6 |
| Pooler | `aws-1-us-east-2.pooler.supabase.com:6543` (session mode) |

**Nota importante:** El CLI de Supabase (`supabase link`, `supabase db push`) NO tiene acceso a este proyecto. Las migraciones se aplican via `psql` directo al pooler. El token de CLI solo accesa la org de Autorentar.

### Cloudflare Pages

| Proyecto | Dominio | Estado |
|---|---|---|
| `autamedica-web` | `autamedica-web.pages.dev` | Deployado (Astro) |
| `autamedica-auth` | Pendiente creación | Next.js legacy |
| `autamedica-doctors` | Pendiente creación | Next.js legacy |
| `autamedica-companies` | Pendiente creación | Next.js legacy |

- **Account ID:** `5b448192fe4b369642b68ad8f53a7603`
- **Email:** `marques.eduardo95466020@gmail.com`
- **Token CI:** OAuth token (temporal, necesita API Token permanente)

### GitHub Secrets (20 configurados)

```
CLOUDFLARE_ACCOUNT_ID          CLOUDFLARE_API_TOKEN
NEXT_PUBLIC_SUPABASE_URL       NEXT_PUBLIC_SUPABASE_ANON_KEY
PUBLIC_SUPABASE_URL            PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      SUPABASE_DB_URL
SUPABASE_DB_PASSWORD           SUPABASE_JWT_SECRET
SUPABASE_PROJECT_REF           SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY            NEXT_PUBLIC_ALLOWED_REDIRECTS
NEXT_PUBLIC_BASE_URL_ADMIN     NEXT_PUBLIC_BASE_URL_COMPANIES
NEXT_PUBLIC_BASE_URL_DOCTORS   NEXT_PUBLIC_BASE_URL_PATIENTS
NEXT_PUBLIC_BASE_URL_WEB_APP   PAGES_PROJECTS
```

---

## 2. Base de Datos - Números Finales

| Métrica | Valor |
|---|---|
| Tablas públicas | 44 |
| Tablas con RLS habilitado | 43/44 (`spatial_ref_sys` es de PostGIS, no contiene datos de app) |
| Políticas RLS (public) | 122 |
| Políticas RLS (storage) | 16 |
| Storage buckets | 5 |
| Indexes | 198 |
| Triggers | 51 |
| CHECK constraints | 352 |

### View de salud operativa

```sql
SELECT * FROM v_db_health;
```

Retorna: tablas, cobertura RLS, políticas, buckets, audit entries 24h, usuarios activos 24h.

---

## 3. Migraciones Aplicadas (sesión 2026-02-19)

### 3.1 `20260219150000_production_hardening.sql`

**RLS en tablas desprotegidas:**
- `appointments` — no tenía RLS
- `companies` — no tenía RLS
- `doctor_patient` — no tenía RLS

**Políticas para tablas bloqueadas** (RLS activo, 0 políticas = inaccesibles):
- `lab_results` — 3 políticas (paciente lee propio, doctor lee asignado, doctor inserta)
- `medication_logs` — 3 políticas
- `patient_alerts` — 3 políticas
- `symptom_reports` — 3 políticas
- `vital_signs` — 3 políticas

**Vulnerabilidad de escalación de roles corregida:**
- `set_portal_and_role()` permitía a CUALQUIER usuario auto-asignarse rol `admin`
- Fix: solo permite cambio de rol si el usuario no tiene rol (primera vez) o es admin existente
- Bloqueado: no se puede asignar `admin` sin ser admin previamente

**18 indexes en FK sin indexar:**
- `medical_records(doctor_id)`, `medical_records(appointment_id)`, `medical_chats(appointment_id)`
- `companies(owner_profile_id)`, `organizations(owner_profile_id)`, `appointments(created_by)`
- `lab_results(reviewed_by)`, `lab_results(uploaded_by_id)`, `medication_logs(logged_by_id)`
- `org_members(invited_by)`, `patient_alerts(created_by_id)`, `patient_alerts(acknowledged_by_id)`
- `symptom_reports(reported_by_id)`, `user_roles(granted_by)`, `vital_signs(recorded_by_id)`
- Composites: `appointments(doctor_id, start_time)`, `appointments(patient_id, start_time)`, `appointments(status, start_time)`

**9 CHECK constraints:**
- `profiles.role` — `NULL | patient | doctor | company | admin`
- `user_roles.role` — `patient | doctor | company | admin`
- `appointments.status` — `scheduled | confirmed | in_progress | completed | cancelled | no_show`
- `patients.blood_type` — `NULL | A+ | A- | B+ | B- | AB+ | AB- | O+ | O-`
- `patients.gender` — `NULL | male | female | non_binary | other | prefer_not_to_say`
- `medical_records.type` — `NULL | consultation | diagnosis | prescription | lab_result | imaging | referral | follow_up | emergency`
- `patient_alerts.severity` — `NULL | low | medium | high | critical`
- `patient_risk_factors.severity` — `NULL | low | medium | high | critical`
- `telemedicine_sessions.status` — `NULL | waiting | in_progress | completed | cancelled | failed`

**Triggers duplicados eliminados:**
- `update_medical_records_updated_at` (duplicado de `trigger_update_medical_records_timestamp`)
- `update_telemedicine_sessions_updated_at` (duplicado de `trigger_update_telemedicine_sessions_timestamp`)

---

### 3.2 `20260219160000_storage_observability_rls_cleanup.sql`

**Storage Buckets:**

| Bucket | Público | Límite | Tipos MIME |
|---|---|---|---|
| `avatars` | Si | 2 MB | image/jpeg, image/png, image/webp |
| `medical-records` | No | 50 MB | image/jpeg, image/png, image/webp, application/pdf |
| `lab-results` | No | 50 MB | image/jpeg, image/png, image/webp, application/pdf |
| `prescriptions` | No | 10 MB | application/pdf |
| `company-logos` | Si | 2 MB | image/jpeg, image/png, image/webp, image/svg+xml |

**16 Storage Policies:**
- `avatars`: select público, insert/update/delete propio (folder = `user_id`)
- `medical-records`: select paciente (propio) + doctor (asignado), insert doctor
- `lab-results`: select paciente (propio) + doctor (asignado), insert autenticado
- `prescriptions`: select paciente (propio) + doctor (asignado), insert solo doctor
- `company-logos`: select público, insert/update admin de company

**Audit System:**

Bug corregido: la tabla `audit_logs` NO EXISTÍA pero 2 triggers la referenciaban:
- `trigger_log_authorization_changes` en `medical_record_authorizations`
- `trigger_log_medical_record_access` en `medical_records`

Ambos fallaban silenciosamente en cada operación.

Tabla `audit_logs` creada con:
- `id`, `user_id`, `action`, `resource_type`, `resource_id`, `metadata` (jsonb), `ip_address`, `user_agent`, `created_at`
- RLS: solo admins pueden leer, sistema puede insertar
- 4 indexes: `user_id`, `(resource_type, resource_id)`, `created_at DESC`, `action`

**Trigger genérico `fn_audit_sensitive_change()`:**
- Registra INSERT/UPDATE/DELETE con usuario, tabla, registro, campos cambiados
- Aplicado a 10 tablas: `appointments`, `doctor_patient`, `lab_results`, `patient_alerts`, `vital_signs`, `symptom_reports`, `medication_logs`, `user_roles`, `companies`, `telemedicine_sessions`

**Retención:** `fn_cleanup_old_audit_logs(retention_days)` — default 365 días.

**Consolidación de políticas duplicadas:**

Eliminadas (11 total):
- `profiles_select_all` — **CRITICO**: tenía `USING (true)` = cualquier usuario leía TODOS los perfiles
- `profiles_insert_own` — duplicado de `Enable profile creation`
- `Users can view own profile` — duplicado de `Users can read own profile`
- `Admins can read all profiles` — duplicado de `Platform admins can view all profiles`
- `profiles_update_own` — duplicado de `Users can update own profile`
- `Doctors can view own data` — cubierto por `doctors_select_public`
- `Doctors can view own profile` — cubierto por `doctors_select_public`
- `Patients can view own data` — cubierto por `patients_select_restricted`
- `Patients can view own profile` — cubierto por `patients_select_restricted`
- `Doctors can view their appointments` — cubierto por `appointments_select_participants`
- `Patients can view own appointments` — cubierto por `appointments_select_participants`

**doctor_patient desbloqueada:**
- Estaba con RLS activado pero 0 políticas (completamente inaccesible)
- 5 nuevas políticas: select doctor, select patient, insert doctor, delete doctor, manage admin

---

## 4. Deploy - Configuración Final

### Workflow: `desplegar-produccion.yml`

```
push to main → deploy-web (Astro) ✅
              → deploy-auth (Next.js) ❌ proyecto CF no existe
              → deploy-doctors (Next.js) ❌ proyecto CF no existe
              → deploy-companies (Next.js) ❌ proyecto CF no existe
```

### apps/web (Astro) - Configuración que funciona

`wrangler.toml`:
```toml
name = "autamedica-web"
compatibility_date = "2025-09-23"
compatibility_flags = ["nodejs_compat_v2"]
pages_build_output_dir = "dist"
```

- `nodejs_compat_v2` requerido por React 19 SSR (`MessageChannel`)
- `compatibility_date` >= `2025-09-23` necesario para APIs de Worker modernas

### Problemas resueltos en deploy

| Problema | Causa | Solución |
|---|---|---|
| `wrangler: not found` | `npx` no resuelve en pnpm CI | Cambiar a `pnpm dlx wrangler` |
| `Project not found` | `CLOUDFLARE_ACCOUNT_ID` apuntaba a cuenta equivocada | Actualizar secret con ID correcto |
| `MessageChannel is not defined` | `compatibility_date` viejo + `nodejs_compat` v1 | Actualizar a `2025-09-23` + `nodejs_compat_v2` |

---

## 5. Vulnerabilidades Encontradas y Corregidas

### P0 - Crítico

| # | Vulnerabilidad | Impacto | Estado |
|---|---|---|---|
| 1 | `set_portal_and_role()` permite escalación a admin | Cualquier usuario podía hacerse admin | Corregido |
| 2 | `profiles_select_all` con `USING (true)` | Cualquier usuario leía todos los perfiles | Eliminada |
| 3 | 3 tablas sin RLS (`appointments`, `companies`, `doctor_patient`) | Datos accesibles sin restricción | RLS habilitado |
| 4 | 5 tablas con RLS pero 0 políticas | Datos completamente inaccesibles | Políticas creadas |
| 5 | `audit_logs` no existía (2 triggers rotos) | Operaciones en medical_records fallaban silenciosamente | Tabla creada |

### P1 - Alto

| # | Problema | Estado |
|---|---|---|
| 1 | 15 FK sin index (full table scans en JOINs) | 18 indexes creados |
| 2 | Sin CHECK constraints en roles/status | 9 constraints creados |
| 3 | Triggers duplicados en 2 tablas | Eliminados |
| 4 | 11 políticas RLS duplicadas/redundantes | Consolidadas |
| 5 | 0 storage buckets configurados | 5 buckets + 16 políticas |
| 6 | Sin audit trail en tablas sensibles | 10 triggers de audit |

---

## 6. Funciones Helper de Seguridad

Funciones usadas en políticas RLS (definidas en `public` schema):

```sql
is_doctor()                    -- true si auth.uid() tiene role='doctor' y active=true
is_patient()                   -- true si auth.uid() tiene role='patient' y active=true
is_system_admin()              -- true si role IN ('admin', 'platform_admin') y active=true
doctor_has_patient_access(uid) -- true si el doctor actual tiene relación con el paciente
```

---

## 7. Extensiones PostgreSQL Activas

| Extensión | Versión | Uso |
|---|---|---|
| `pg_graphql` | 1.5.11 | API GraphQL automática |
| `pg_stat_statements` | 1.11 | Monitoreo de queries |
| `pgcrypto` | 1.3 | Funciones criptográficas |
| `postgis` | 3.3.7 | Datos geoespaciales |
| `supabase_vault` | 0.3.1 | Almacenamiento seguro de secrets |
| `uuid-ossp` | 1.1 | Generación de UUIDs |

---

## 8. Pendientes para Siguiente Sesión

### Infraestructura
- [ ] Crear API Token permanente en Cloudflare (el actual es OAuth temporal)
- [ ] Crear proyectos CF Pages para auth, doctors, companies (o migrar a Astro primero)
- [ ] Configurar custom domain `www.autamedica.com` → `autamedica-web`
- [ ] Configurar SMTP personalizado en Supabase (emails de auth)

### Base de datos
- [ ] Vincular Supabase CLI al proyecto (requiere acceso a la org correcta)
- [ ] Configurar Realtime solo en tablas necesarias (actualmente deshabilitado)
- [ ] Crear Edge Functions para operaciones sensibles
- [ ] Configurar pg_cron para `fn_cleanup_old_audit_logs()` automático
- [ ] Agregar constraints de longitud en columnas text críticas (email, phone)

### Aplicación
- [ ] Migrar apps legacy (auth, doctors, patients, companies, admin) a Astro
- [ ] Regenerar tipos TypeScript desde DB actual (`pnpm db:sync`)
- [ ] Configurar Sentry para monitoreo de errores en producción
- [ ] Integrar storage buckets con componentes de upload en la app

### Seguridad
- [ ] Configurar rate limiting en Edge Functions
- [ ] Implementar PITR (Point-in-Time Recovery) en Supabase
- [ ] Rotar el JWT secret actual por precaución (estaba en archivos de ejemplo)
- [ ] Auditar que `SUPABASE_SERVICE_ROLE_KEY` nunca se expone al cliente

---

## 9. Comandos Operativos

```bash
# Health check rápido
PGPASSWORD="..." psql "postgresql://postgres.knywotiidsydsaveqkjs@aws-1-us-east-2.pooler.supabase.com:6543/postgres" \
  -c "SELECT * FROM v_db_health;"

# Ver audit logs recientes
PGPASSWORD="..." psql "..." \
  -c "SELECT action, resource_type, resource_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 20;"

# Limpiar audit logs viejos (manual)
PGPASSWORD="..." psql "..." \
  -c "SELECT fn_cleanup_old_audit_logs(365);"

# Deploy manual (Astro)
cd apps/web && pnpm build && pnpm dlx wrangler pages deploy dist --project-name autamedica-web

# Aplicar migración nueva
PGPASSWORD="..." psql "postgresql://postgres.knywotiidsydsaveqkjs@aws-1-us-east-2.pooler.supabase.com:6543/postgres" \
  -f supabase/migrations/YYYYMMDD_nombre.sql
```

---

## 10. Separación de Proyectos

**AutaMedica** y **Autorentar** comparten la misma cuenta de Cloudflare pero son proyectos completamente independientes:

| | AutaMedica | Autorentar |
|---|---|---|
| Supabase Project | `knywotiidsydsaveqkjs` | `aceacpaockyxgogxsfyc` |
| Supabase Región | us-east-2 | sa-east-1 |
| CF Pages | `autamedica-web` | `autorentar` |
| Dominio | autamedica.com | autorentar.com |
| Repositorio | ecucondorSA/Autamedica | (separado) |

No hay recursos compartidos. No mezclar tokens, secrets, ni migraciones entre proyectos.
