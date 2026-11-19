# AutaMedica Infrastructure Reference

> Estado actual de la infraestructura. Actualizado: 2026-03-01.

---

## 1) Supabase Project

| Campo             | Valor                                                       |
| ----------------- | ----------------------------------------------------------- |
| **Project ref**   | `qxjjrpksmwwrmubhvjew`                                      |
| **Region**        | sa-east-1 (South America)                                   |
| **API URL**       | `https://qxjjrpksmwwrmubhvjew.supabase.co`                  |
| **Dashboard**     | https://supabase.com/dashboard/project/qxjjrpksmwwrmubhvjew |
| **Functions URL** | `https://qxjjrpksmwwrmubhvjew.supabase.co/functions/v1`     |
| **DB Pooler**     | `aws-0-sa-east-1.pooler.supabase.com:6543`                  |
| **Account**       | `autamedica@gmail.com`                                      |
| **Org ID**        | `onknnxypxwnvvewamqcg`                                      |
| **Plan**          | Free                                                        |

> **Nota**: Proyecto anterior archivado por incidentes de RLS recursiva (2026-03-01).

---

## 2) Database (Live Stats - 2026-03-01)

| Metric          | Value                                          |
| --------------- | ---------------------------------------------- |
| Tables (public) | 44                                             |
| Tables con RLS  | 43 (solo `spatial_ref_sys` de PostGIS sin RLS) |
| RLS Policies    | 132                                            |
| Views           | 5                                              |
| Functions       | 799                                            |
| Triggers        | 45                                             |

### Views con security_invoker

| View                              | security_invoker | Notas                       |
| --------------------------------- | ---------------- | --------------------------- |
| `v_db_health`                     | true             | Dashboard DB sin auth.users |
| `user_identifiers`                | true             | Respeta RLS de profiles     |
| `telemedicine_sessions_canonical` | true             | Respeta RLS                 |
| `geography_columns`               | false            | PostGIS system view         |
| `geometry_columns`                | false            | PostGIS system view         |

### RLS Exception

`spatial_ref_sys` es tabla de PostGIS (owned by extension). No se puede activar RLS. Read-only reference data. Warning del Advisor aceptable.

---

## 3) Edge Functions

4 funciones desplegadas y verificadas:

| Function                     | Status    | JWT | CORS                        | Descripcion                                        |
| ---------------------------- | --------- | --- | --------------------------- | -------------------------------------------------- |
| `create-call`                | ACTIVE v2 | No  | `*` (cors.ts)               | Crea llamada via RPC `create_call`                 |
| `update-call-status`         | ACTIVE v2 | No  | `*` (cors.ts)               | Actualiza estado via RPC `update_call_status`      |
| `get-meeting-token`          | ACTIVE v2 | No  | `*` (cors.ts)               | Genera JWT de LiveKit para video calls             |
| `ingest-patient-observation` | ACTIVE v2 | No  | whitelist (auth-helpers.ts) | Ingesta vitales, medicacion, sintomas, lab results |

### Healthcheck (2026-03-01)

```
create-call:                200 OK
update-call-status:         200 OK
get-meeting-token:          200 OK
ingest-patient-observation: 204 No Content
```

### Shared Helpers

- `_shared/cors.ts`: CORS permisivo (`Access-Control-Allow-Origin: *`). Usado por create-call, update-call-status, get-meeting-token.
- `_shared/auth-helpers.ts`: Auth middleware con whitelist de origins + `requireAuth()` + `getCorsHeaders()`. Usado por ingest-patient-observation.

### Consumers

| Function                     | Consumer                 | Location                                     |
| ---------------------------- | ------------------------ | -------------------------------------------- |
| `create-call`                | CallService              | `packages/telemedicine/src/calls/service.ts` |
| `update-call-status`         | CallService              | `packages/telemedicine/src/calls/service.ts` |
| `get-meeting-token`          | Sin consumidor TS activo | Desplegada para uso futuro                   |
| `ingest-patient-observation` | Portal pacientes         | `apps/patients/`                             |

---

## 4) Auth Configuration (Remote)

| Setting                | Value                                 |
| ---------------------- | ------------------------------------- |
| site_url               | `https://www.autamedica.com`          |
| autoconfirm            | `false` (email confirmation required) |
| signup                 | enabled                               |
| anonymous_sign_ins     | disabled                              |
| JWT expiry             | 3600s                                 |
| refresh_token_rotation | enabled                               |

### Redirect URLs configuradas

```
https://www.autamedica.com/**
https://autamedica.com/**
https://autamedica-web.pages.dev/**
https://autamedica-patients.pages.dev/**
https://autamedica-doctors.pages.dev/**
https://autamedica-companies.pages.dev/**
https://autamedica-admin.pages.dev/**
http://localhost:3000/**
http://localhost:3001/**
http://localhost:3002/**
http://localhost:3003/**
http://localhost:3004/**
```

### Trigger de signup: `handle_new_user()`

Se ejecuta en `auth.users AFTER INSERT`:

1. Determina rol desde `raw_user_meta_data->>'role'` (default: `'patient'`)
2. Asigna `numeric_id` secuencial por rol
3. Crea perfil en `profiles`
4. Crea registro en tabla de rol (`patients`, `doctors`, `companies`)

---

## 5) Variables de Entorno por App

### apps/web (Astro)

```env
PUBLIC_SUPABASE_URL=https://qxjjrpksmwwrmubhvjew.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_SUPABASE_URL=<same>        # alias para @autamedica/shared
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same>   # alias
PUBLIC_APP_URL=http://localhost:3000
PUBLIC_DOCTORS_URL=https://autamedica-doctors.pages.dev
PUBLIC_PATIENTS_URL=https://autamedica-patients.pages.dev
PUBLIC_COMPANIES_URL=https://autamedica-companies.pages.dev
```

### apps/doctors, apps/patients, apps/companies, apps/admin (Next.js)

```env
NEXT_PUBLIC_SUPABASE_URL=https://qxjjrpksmwwrmubhvjew.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=<same>                    # server-side
SUPABASE_ANON_KEY=<same>               # server-side
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_COOKIE_DOMAIN=localhost            # .autamedica.com en produccion
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:3005/signal
SUPABASE_JWT_SECRET=<jwt-secret>
NODE_ENV=development
PORT=<3001|3002|3003|3004>
```

### apps/mobile (Expo)

```env
EXPO_PUBLIC_SUPABASE_URL=https://qxjjrpksmwwrmubhvjew.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### Edge Functions (automaticas via Supabase)

```env
SUPABASE_URL              # Automatica
SUPABASE_ANON_KEY         # Automatica
SUPABASE_SERVICE_ROLE_KEY # Automatica
LIVEKIT_API_KEY           # Manual - para get-meeting-token
LIVEKIT_API_SECRET        # Manual - para get-meeting-token
LIVEKIT_URL               # Manual - para get-meeting-token
```

---

## 6) Deployment

### Edge Functions

```bash
# Prerequisito: token PAT (formato actual: sbp_<token>)
export SUPABASE_ACCESS_TOKEN=sbp_<token>

# Deploy todas (script canonico)
./scripts/deploy/deploy-functions.sh

# Deploy individual
supabase functions deploy create-call \
  --project-ref qxjjrpksmwwrmubhvjew \
  --no-verify-jwt
```

### DB Migrations

```bash
# Via Management API (hotfixes)
python3 -c "
import json
sql = open('supabase/migrations/XXXXXX.sql').read()
payload = json.dumps({'query': sql})
open('/tmp/migration.json', 'w').write(payload)
"
curl -X POST \
  -H 'Authorization: Bearer sbp_<token>' \
  -H 'Content-Type: application/json' \
  -d @/tmp/migration.json \
  'https://api.supabase.com/v1/projects/qxjjrpksmwwrmubhvjew/database/query'

# Via CLI
SUPABASE_ACCESS_TOKEN=sbp_<token> supabase db push --project-ref qxjjrpksmwwrmubhvjew
```

### Regenerar tipos DB

```bash
pnpm db:sync
# Equivalente a:
supabase gen types typescript --project-id qxjjrpksmwwrmubhvjew \
  > packages/types/src/supabase/database.types.ts
```

### Quick CORS test

```bash
for fn in create-call update-call-status get-meeting-token ingest-patient-observation; do
  curl -s -o /dev/null -w "$fn %{http_code}\n" -X OPTIONS \
    "https://qxjjrpksmwwrmubhvjew.supabase.co/functions/v1/$fn"
done
```

---

## 7) Migrations Applied

| Timestamp      | File                                | Description                          |
| -------------- | ----------------------------------- | ------------------------------------ |
| 20260222000000 | `baseline_remote.sql`               | Baseline completo (516KB)            |
| 20260222224500 | `auth_session_cleanup.sql`          | Limpieza sesiones auth               |
| 20260301180000 | `harden_auth_signup_trigger.sql`    | Fix handle_new_user()                |
| 20260301190000 | `fix_recursive_rls_policies.sql`    | Fix politicas recursivas en profiles |
| 20260301200000 | `enable_rls_fix_views.sql`          | RLS ON + views security_invoker      |
| 20260301210000 | `fix_triggers_and_role_records.sql` | Fix triggers y registros de rol      |

---

## 8) Tokens y Accesos

### Supabase CLI (Personal Access Token)

- Env var: `SUPABASE_ACCESS_TOKEN`
- Formato esperado: `sbp_<token>`
- Usar el token PAT exacto como lo entrega Supabase (no agregar ni remover prefijos manualmente)
- Generar/rotar: Dashboard > Account > Access Tokens

### Supabase API Keys

- Dashboard > Project Settings > API
- `anon` key: uso publico/cliente
- `service_role` key: operaciones server-only (nunca en cliente)

### JWT Secret

- Dashboard > Project Settings > API > JWT Secret
- Solo en env de servidor, nunca en bundles cliente

---

## 9) Troubleshooting

### BOOT_ERROR en edge functions

Las funciones deben desplegarse via `supabase functions deploy` (CLI con bundling eszip), no via el campo `body` de la Management API.

### "Unsupported lockfile version 5"

Eliminar `supabase/functions/deno.lock` antes del deploy. El script `deploy-functions.sh` lo hace automaticamente.

### "Invalid access token format"

El CLI no acepta tokens con `v0_`. Usar `sbp_<token>` sin el prefijo `v0_`.

### "infinite recursion in policy for relation profiles"

Nunca hacer `SELECT FROM profiles` dentro de una policy `ON profiles`. Usar `is_platform_or_org_admin()` (SECURITY DEFINER).

### "must be owner of table spatial_ref_sys"

PostGIS system table. No se puede modificar. Warning aceptable.

### PL/pgSQL triple-quoting via JSON API

Usar `python3 json.dumps()` para generar payload JSON. Verificar `prosrc` en `pg_proc` despues del deploy.

### CORS mismatch entre funciones

`create-call`, `update-call-status`, `get-meeting-token` usan cors.ts (permisivo `*`). `ingest-patient-observation` usa auth-helpers.ts (whitelist). Verificar cual helper importa la funcion.
