# AGENTS-2.md - Advanced Platform Hardening Rules

> Reglas de hardening senior descubiertas en sesiones de debugging de producción.
> Complementario a AGENTS.md. Previene schema drift, auth bypasses, enum mismatches y gaps de RLS.

**Contexto:** Estas reglas emergieron de sesiones de auditoría donde se descubrieron:

- Mismatches entre tipos TypeScript y enums de DB (causan errores en runtime)
- Auth bypasses en Edge Functions (cualquier request sin autenticación puede ejecutar lógica)
- Gaps de RLS (buckets de storage sin política INSERT)
- Schema drift (código asumiendo columnas que no existen)
- Defaults peligrosos (status 'active' por defecto sin validación)
- Status updates sin tipado (aceptando cualquier string)

**Filosofía:** Prevención sobre reacción. Automatizar donde sea posible. Fallar rápido en compile-time o pre-commit.

---

## Tabla de Contenidos

- [17. Database-Code Contract Enforcement](#17-database-code-contract-enforcement)
  - [17.1 Enum Sync Protocol](#171-enum-sync-protocol-mandatory)
  - [17.2 Schema Verification Before Coding](#172-schema-verification-before-coding-critical)
  - [17.3 Migration Idempotency Standards](#173-migration-idempotency-standards)
- [18. Edge Function Security Standards](#18-edge-function-security-standards)
  - [18.1 Auth-First Pattern](#181-auth-first-pattern-mandatory)
  - [18.2 Edge Function Security Checklist](#182-edge-function-security-checklist)
- [19. RLS & Storage Policy Enforcement](#19-rls--storage-policy-enforcement)
  - [19.1 RLS Coverage Requirements](#191-rls-coverage-requirements)
  - [19.2 RLS Audit Script](#192-rls-audit-script)
- [20. Type Safety for Status Updates](#20-type-safety-for-status-updates)
  - [20.1 Typed Status Update Functions](#201-typed-status-update-functions)
  - [20.2 Default Values Safety](#202-default-values-safety)
- [21. Pre-Deploy Verification Protocol](#21-pre-deploy-verification-protocol)
- [22. Automated Quality Gates](#22-automated-quality-gates)
- [23. Imported Senior Rules (Framework-Agnostic)](#23-imported-senior-rules-framework-agnostic)

---

## 17. Database-Code Contract Enforcement

### 17.1 Enum Sync Protocol (Mandatory)

**Problema:** Los tipos TypeScript divergen de los enums de la DB, causando errores en runtime de producción.

**Ejemplo del bug:**

```typescript
// Tipo TypeScript (INCORRECTO)
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'no_show';

// Enum de DB (REAL)
-- CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');

// Resultado: Código que escribe 'confirmed' falla si la DB tiene 'completed' en lugar de 'confirmed'
```

**Protocolo Obligatorio:**

```bash
# ANTES de modificar cualquier tipo que mapea a un enum de DB:

# 1. Verificar valores reales del enum en DB
psql $DATABASE_URL -c "SELECT unnest(enum_range(NULL::public.appointment_status));"

# 2. Comparar con el tipo TypeScript
grep "AppointmentStatus" packages/types/src/index.ts

# 3. Si hay mismatch:
#    a) Actualizar DB primero (migración para agregar/quitar valores)
#    b) Luego actualizar el tipo TypeScript
#    c) Buscar y reemplazar todos los usos de valores viejos
```

**Enums Críticos de AutaMedica (verificar antes de modificar):**

- `appointment_status`: estados de consultas médicas
- `user_role`: `patient`, `doctor`, `company`, `admin`
- `consultation_type`: `video`, `chat`, `in_person`
- `document_status`: estados de documentos médicos

**Script de Validación** (`scripts/validate-enum-sync.ts`):

```typescript
#!/usr/bin/env tsx
// Valida que los tipos TypeScript coincidan con los enums de DB
// Run: pnpm tsx scripts/validate-enum-sync.ts
// Exit code: 0 = todo OK, 1 = mismatches encontrados

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CRITICAL_ENUMS = [
  {
    tsType: "AppointmentStatus",
    dbEnum: "appointment_status",
    file: "packages/types/src/index.ts",
    linePattern: /type AppointmentStatus = ([^;]+);/,
  },
  // Agregar más enums aquí
];

async function getDbEnumValues(enumName: string): Promise<Set<string>> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase.rpc("get_enum_values", { enum_name: enumName });
  if (error) {
    console.error(`Failed: ${enumName}`, error);
    process.exit(1);
  }
  return new Set(data.map((row: { enumlabel: string }) => row.enumlabel));
}

// ... implementación completa en scripts/validate-enum-sync.ts
```

**SQL Helper (agregar a migraciones):**

```sql
CREATE OR REPLACE FUNCTION public.get_enum_values(enum_name text)
RETURNS TABLE(enumlabel text)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT enumlabel::text FROM pg_enum
  JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
  WHERE pg_type.typname = enum_name ORDER BY enumsortorder;
$$;
GRANT EXECUTE ON FUNCTION public.get_enum_values TO service_role;
```

---

### 17.2 Schema Verification Before Coding (Critical)

**Problema:** El código asume que columnas/tablas existen basándose en memoria o docs desactualizados.

**Ejemplo:**

```typescript
// Asume que profiles.specialty existe
const { data } = await supabase.from("profiles").select("specialty"); // ❌ Columna no existe en profiles!

// Realidad: specialty vive en doctor_profiles.specialty
```

**Protocolo Obligatorio:**

```bash
# ANTES de escribir cualquier query de Supabase:

# 1. Regenerar tipos a archivo temporal
supabase gen types typescript --project-id qxjjrpksmwwrmubhvjew > /tmp/fresh-db-types.ts

# 2. Buscar la tabla que vas a consultar
grep -A 30 "profiles:" /tmp/fresh-db-types.ts

# 3. Verificar que la columna existe en el tipo Row
# Si la columna es 'never', buscar en tabla relacionada

# 4. Si la columna no existe:
#    a) Verificar si está en una tabla relacionada
#    b) O crear una migración para agregarla
#    c) NO asumir que existe y codear contra ella
```

**Checklist de Schema Verification:**

- [ ] Tipos regenerados a archivo temporal (< 24 horas)
- [ ] Tabla buscada en los tipos generados
- [ ] Columna confirmada existe en tipo `Row`
- [ ] Si es `never`, se encontró la tabla correcta
- [ ] Si la tabla no existe, verificado que no es un typo

---

### 17.3 Migration Idempotency Standards

**Problema:** Migraciones fallan en segundo run, causando problemas de deployment.

**Ejemplo de migración NO idempotente:**

```sql
-- ❌ Falla si se ejecuta dos veces
CREATE POLICY "policy_name" ON public.my_table FOR SELECT USING (...);
-- ERROR: policy "policy_name" already exists

ALTER TYPE appointment_status ADD VALUE 'rescheduled';
-- ERROR: enum value already exists
```

**Template Obligatorio:**

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_descriptive_name.sql
-- Idempotencia: Seguro de ejecutar múltiples veces
-- Author: [Nombre]
-- Context: [Issue o tarea relacionada]

-- ============================================================================
-- 1. SCHEMA CHANGES
-- ============================================================================

-- Tablas: Usar IF NOT EXISTS
CREATE TABLE IF NOT EXISTS public.appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    doctor_id uuid NOT NULL REFERENCES auth.users(id),
    status text NOT NULL DEFAULT 'pending',
    scheduled_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Columnas: Verificar existencia antes de agregar
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'appointments'
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE public.appointments ADD COLUMN notes text;
    END IF;
END $$;

-- ============================================================================
-- 2. ENUM MODIFICATIONS
-- ============================================================================

-- Agregar valores: Envolver en exception handler
DO $$ BEGIN
    ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'rescheduled';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Enum value rescheduled already exists, skipping';
END $$;

-- ============================================================================
-- 3. FUNCTIONS (RPCs)
-- ============================================================================

-- Usar CREATE OR REPLACE para idempotencia
CREATE OR REPLACE FUNCTION public.get_patient_appointments(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(a.*) INTO result
    FROM appointments a
    WHERE a.patient_id = p_patient_id;
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_patient_appointments IS 'Retorna appointments de un paciente';

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'appointments'
        AND policyname = 'Patients can view own appointments'
    ) THEN
        CREATE POLICY "Patients can view own appointments"
        ON public.appointments FOR SELECT TO authenticated
        USING (auth.uid() = patient_id);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'appointments'
        AND policyname = 'Doctors can view own appointments'
    ) THEN
        CREATE POLICY "Doctors can view own appointments"
        ON public.appointments FOR SELECT TO authenticated
        USING (auth.uid() = doctor_id);
    END IF;
END $$;

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON public.appointments(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status)
WHERE status IN ('pending', 'confirmed');

-- ============================================================================
-- 6. GRANTS & PERMISSIONS
-- ============================================================================

REVOKE ALL ON public.appointments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
REVOKE ALL ON FUNCTION public.get_patient_appointments FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_appointments TO authenticated;

-- ============================================================================
-- 7. TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 8. VERIFICATION (comentadas, para testing manual)
-- ============================================================================

-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'appointments';
-- SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'appointments';
-- SELECT COUNT(*) FROM public.appointments;
```

**Checklist de Idempotencia:**

- [ ] `CREATE TABLE` → `IF NOT EXISTS`
- [ ] `ALTER TABLE ADD COLUMN` → Envuelto en check de existencia
- [ ] `ALTER TYPE ADD VALUE` → Envuelto en `DO $$ BEGIN ... EXCEPTION` block
- [ ] `CREATE POLICY` → Envuelto en check (query `pg_policies`)
- [ ] `CREATE FUNCTION` → `CREATE OR REPLACE`
- [ ] `CREATE INDEX` → `IF NOT EXISTS`
- [ ] `DROP` statements → Envueltos en checks de existencia
- [ ] `INSERT` (data migrations) → `ON CONFLICT DO NOTHING` o `WHERE NOT EXISTS`
- [ ] La migración puede ejecutarse 2-3 veces sin errores
- [ ] Queries de verificación incluidas (comentadas)

---

## 18. Edge Function Security Standards

### 18.1 Auth-First Pattern (Mandatory)

**Problema:** Edge Functions ejecutables sin autenticación, permitiendo consumo no autorizado de APIs.

**Patrón Obligatorio para TODA Edge Function:**

```typescript
// supabase/functions/my-function/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// CORS (si el frontend llama directamente)
const ALLOWED_ORIGINS = [
  "https://autamedica.com",
  "https://www.autamedica.com",
  "http://localhost:3000", // Dev
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // ====================================================================
    // PASO 1: AUTENTICACIÓN (OBLIGATORIO — Primera línea en try block)
    // ====================================================================

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.warn("[my-function] Missing Authorization header");
      return new Response(JSON.stringify({ error: "Missing Authorization header", code: "AUTH_REQUIRED" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[my-function] Auth failed:", authError);
      return new Response(JSON.stringify({ error: "Invalid or expired token", code: "AUTH_INVALID" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[my-function] Authenticated: ${user.id}`);

    // ====================================================================
    // PASO 2: AUTORIZACIÓN (si es operación admin/owner)
    // ====================================================================

    // Para operaciones ADMIN:
    // Verificar role en user_metadata o tabla de admin_users

    // Para verificar OWNERSHIP de recurso médico:
    // const resourceId = (await req.json()).appointment_id;
    // Verificar que appointment.patient_id === user.id

    // ====================================================================
    // PASO 3: VALIDACIÓN DE INPUT
    // ====================================================================

    const body = await req.json();
    if (!body.required_field) {
      return new Response(JSON.stringify({ error: "Missing required_field", code: "VALIDATION_ERROR" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ====================================================================
    // PASO 4: LÓGICA DE NEGOCIO (después de auth + validación)
    // ====================================================================

    const result = await performMedicalOperation(supabase, user.id, body);

    // ====================================================================
    // PASO 5: RESPUESTA
    // ====================================================================

    return new Response(JSON.stringify({ success: true, data: result }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[my-function] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error", code: "INTERNAL_ERROR" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
```

**Helper Reutilizable** (`supabase/functions/_shared/auth-helpers.ts`):

```typescript
import { createClient, SupabaseClient, User } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export interface AuthResult {
  user: User;
  supabase: SupabaseClient;
}

/**
 * Valida Authorization header y retorna usuario autenticado.
 * Lanza Response (401) si auth falla — catchear y retornar.
 */
export async function requireAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: "Missing Authorization header", code: "AUTH_REQUIRED" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Invalid or expired token", code: "AUTH_INVALID" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  return { user, supabase };
}

/** Opcional — retorna null si no autenticado (no lanza). */
export async function optionalAuth(req: Request): Promise<AuthResult | null> {
  try {
    return await requireAuth(req);
  } catch (error) {
    if (error instanceof Response && error.status === 401) return null;
    throw error;
  }
}
```

**Uso del helper:**

```typescript
import { requireAuth } from "../_shared/auth-helpers.ts";

Deno.serve(async (req) => {
  try {
    const { user, supabase } = await requireAuth(req);
    // ... lógica médica aquí
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // requireAuth lanza Response en auth failure
    if (error instanceof Response) return error;
    console.error("[fn] Error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
});
```

---

### 18.2 Edge Function Security Checklist

Antes de deployar CUALQUIER Edge Function:

**Autenticación & Autorización:**

- [ ] Auth verificada ANTES de cualquier lógica de negocio (primera línea en try block)
- [ ] Usa `requireAuth()` helper o equivalente
- [ ] Si operación admin: verifica role en metadata o tabla
- [ ] Si operación de owner: verifica `resource.patient_id === user.id` (o doctor_id)
- [ ] Retorna 401 para auth faltante/inválida
- [ ] Retorna 403 para permisos insuficientes
- [ ] Logs de auth failures con user ID para audit trail

**Validación de Input:**

- [ ] Valida campos requeridos existen
- [ ] Valida tipos de datos (UUID format para IDs)
- [ ] Valida valores enum contra listas permitidas
- [ ] Retorna 400 con mensaje claro para input inválido
- [ ] NUNCA confiar en `req.body.user_id` — usar `auth.getUser()` (JWT)

**Datos Médicos:**

- [ ] Nunca retornar datos de otros pacientes
- [ ] Logs NO contienen datos sensibles (diagnósticos, medicamentos, datos personales)
- [ ] Datos en tránsito solo via HTTPS

**Error Handling:**

- [ ] Códigos HTTP semánticos (400/401/403/404/409, no 500 genérico)
- [ ] Estructura de error: `{ error: string, code: string }`
- [ ] Errores internos no filtran detalles al cliente
- [ ] Logs full error con contexto: `console.error('[function-name]', error)`

**CORS:**

- [ ] CORS configurado si el frontend llama directamente
- [ ] Maneja OPTIONS preflight
- [ ] Whitelist de origins definida (no `'*'` en producción)

**Secrets & Config:**

- [ ] Todos los secrets desde `Deno.env.get()`, nunca hardcodeados
- [ ] API keys nunca en logs ni en responses
- [ ] Service role key solo cuando es estrictamente necesario

**Testing:**

- [ ] Probado con token válido
- [ ] Probado sin token (esperar 401)
- [ ] Probado con token expirado (esperar 401)
- [ ] Probado con input inválido (esperar 400)

---

## 19. RLS & Storage Policy Enforcement

### 19.1 RLS Coverage Requirements

**Regla:** Toda tabla nueva y bucket de storage DEBEN tener políticas RLS definidas en la misma migración que los crea.

**Policy Matrix Template (documentar antes de implementar):**

```
Tabla: appointments

| Rol           | SELECT        | INSERT        | UPDATE        | DELETE        |
|---------------|---------------|---------------|---------------|---------------|
| anon          | ❌ Ninguno    | ❌ Ninguno    | ❌ Ninguno    | ❌ Ninguno    |
| patient       | ✅ Own        | ✅ Own        | ✅ Limitado   | ❌ Ninguno    |
| doctor        | ✅ Own        | ❌ Ninguno    | ✅ Limited    | ❌ Ninguno    |
| admin         | ✅ All        | ✅ All        | ✅ All        | ✅ All        |

Notas:
- "Own" para patient = WHERE patient_id = auth.uid()
- "Own" para doctor = WHERE doctor_id = auth.uid()
- "Limitado" = solo ciertos campos (no puede cambiar doctor_id ni patient_id)
```

**Patrones Comunes de RLS:**

```sql
-- Pattern 1: Visibilidad por rol del usuario
CREATE POLICY "Patients view own" ON public.appointments
  FOR SELECT TO authenticated
  USING (auth.uid() = patient_id);

CREATE POLICY "Doctors view own" ON public.appointments
  FOR SELECT TO authenticated
  USING (auth.uid() = doctor_id);

-- Pattern 2: Basado en role en metadata
CREATE POLICY "Admins see all" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Pattern 3: Datos médicos públicos de doctor (perfil)
CREATE POLICY "Doctor profiles are public" ON public.doctor_profiles
  FOR SELECT TO public
  USING (is_verified = true AND is_active = true);

-- Pattern 4: Solo propietario puede modificar
CREATE POLICY "Patients insert own" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = patient_id);
```

**Storage Bucket Policies:**

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_create_medical_docs_bucket.sql

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-docs',
  'medical-docs',
  false,  -- NUNCA público para documentos médicos
  10485760,  -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Solo el propietario puede ver sus documentos
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'Users can view own medical docs'
    ) THEN
        CREATE POLICY "Users can view own medical docs"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'medical-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
    END IF;
END $$;

-- Solo el propietario puede subir a su carpeta
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'Users can upload own medical docs'
    ) THEN
        CREATE POLICY "Users can upload own medical docs"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'medical-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
    END IF;
END $$;
```

---

### 19.2 RLS Audit Script

**SQL para auditar cobertura:**

```sql
-- Tablas sin RLS habilitado
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND NOT rowsecurity
ORDER BY tablename;

-- Tablas con RLS pero sin políticas
SELECT DISTINCT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public' AND t.rowsecurity = true
AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename
)
ORDER BY t.tablename;

-- Storage buckets sin políticas
SELECT b.name, b.public
FROM storage.buckets b
WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
    AND p.qual::text LIKE '%' || b.id || '%'
)
ORDER BY b.name;
```

---

## 20. Type Safety for Status Updates

### 20.1 Typed Status Update Functions

**Problema:** Funciones que aceptan `status: string` permiten valores enum inválidos.

```typescript
// ❌ PROHIBIDO — acepta cualquier string
async updateAppointmentStatus(id: string, status: string): Promise<void> {
  await supabase.from('appointments').update({ status }).eq('id', id);
}

// ✅ REQUERIDO — tipo explícito que coincide con enum de DB
type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

async updateAppointmentStatus(
  id: string,
  status: AppointmentStatus  // TypeScript atrapa valores inválidos en compile-time
): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id);

  if (error) {
    if (error.code === '23514') { // Check constraint violation
      throw new Error(`Invalid status transition: ${error.message}`);
    }
    throw error;
  }
}
```

**State Machine de Appointments:**

```typescript
// Transiciones permitidas (enforceadas en DB via trigger + en TypeScript)
const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [], // Estado final
  cancelled: [], // Estado final
  no_show: [], // Estado final
};

function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return APPOINTMENT_TRANSITIONS[from].includes(to);
}
```

---

### 20.2 Default Values Safety

**Problema:** Defaults peligrosos que permiten crear recursos en estado "activo" sin validación.

```typescript
// ❌ PELIGROSO — doctor activo por defecto sin verificación
async createDoctorProfile(data: DoctorData): Promise<void> {
  await supabase.from('doctor_profiles').insert({
    ...data,
    status: 'active',  // ❌ Debería ser 'pending_verification'
  });
}

// ✅ SEGURO — estado inicial requiere verificación
async createDoctorProfile(data: DoctorData): Promise<void> {
  await supabase.from('doctor_profiles').insert({
    ...data,
    status: 'pending_verification',  // ✅ Requiere proceso de verificación
  });
}
```

**Regla:** Para datos médicos críticos, el default NUNCA es el estado más permisivo. Siempre comenzar en el estado más restrictivo y escalar con verificación explícita.

---

## 21. Pre-Deploy Verification Protocol

**Antes de deployar cualquier cambio que toque DB:**

```bash
# 1. Verificar schema actual vs código
supabase gen types typescript --project-id qxjjrpksmwwrmubhvjew > /tmp/current-types.ts
diff packages/types/src/database.types.ts /tmp/current-types.ts

# 2. Verificar que las migraciones pending están en orden correcto
ls supabase/migrations/ | sort  # Verificar timestamps cronológicos

# 3. Test idempotencia local (si aplica)
# supabase db reset && supabase db push

# 4. Verificar RLS coverage
psql $DATABASE_URL -c "
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND NOT rowsecurity
ORDER BY tablename;"

# 5. Verificar que las funciones tocadas siguen existiendo y tienen la lógica correcta
psql $DATABASE_URL -c "
SELECT proname, LEFT(prosrc, 200)
FROM pg_proc
WHERE proname IN ('fn_name_1', 'fn_name_2');"

# 6. Después de aplicar migración, verificar comportamiento esperado
psql $DATABASE_URL -c "
SELECT COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'pending') as pending
FROM appointments;"
```

**Checklist Pre-Deploy:**

- [ ] Migración aplicada en staging/local sin errores
- [ ] Migración es idempotente (ejecutada 2 veces sin errores)
- [ ] RLS policies alineadas con nueva estructura
- [ ] Tipos regenerados: `pnpm db:sync`
- [ ] `pnpm --filter @autamedica/web check` sin errors
- [ ] `pnpm lint` sin errors
- [ ] Edge Functions que tocan estas tablas actualizadas
- [ ] Query de verificación post-deploy preparada

**Checklist Post-Deploy:**

- [ ] Migración aplicada en producción
- [ ] Query de verificación SQL ejecutada y resultado esperado
- [ ] Flujo completo probado manualmente (o via browser automation)
- [ ] Logs de Edge Functions revisados (sin errores nuevos)
- [ ] Tipos en producción coinciden con código

---

## 22. Automated Quality Gates

### CI/CD Checks (GitHub Actions)

```yaml
# .github/workflows/quality-gates.yml
name: Quality Gates

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm build:packages:core

      - name: Lint
        run: pnpm lint

      - name: TypeScript check (Astro)
        run: pnpm --filter @autamedica/web check

      - name: Unit tests
        run: pnpm test:unit

      - name: Build Astro
        run: pnpm --filter @autamedica/web build
        env:
          PUBLIC_SUPABASE_URL: ${{ secrets.PUBLIC_SUPABASE_URL }}
          PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.PUBLIC_SUPABASE_ANON_KEY }}
```

### Pre-commit Hooks

```bash
# .husky/pre-commit (si se usa husky)
#!/bin/bash

echo "Running quality gates..."

# 1. Lint
pnpm lint
if [ $? -ne 0 ]; then
  echo "❌ Lint failed. Fix errors before committing."
  exit 1
fi

# 2. TypeScript check (si se modificó apps/web)
if git diff --cached --name-only | grep -q "apps/web/"; then
  pnpm --filter @autamedica/web check
  if [ $? -ne 0 ]; then
    echo "❌ Astro TypeScript check failed."
    exit 1
  fi
fi

echo "✅ Quality gates passed"
```

### Comandos de Auditoría (On-Demand)

```bash
# Auditar RLS coverage
psql $DATABASE_URL < scripts/audit-rls.sql

# Verificar enum sync
pnpm tsx scripts/validate-enum-sync.ts

# Verificar schema drift
supabase gen types typescript --project-id qxjjrpksmwwrmubhvjew > /tmp/fresh.ts
diff packages/types/src/database.types.ts /tmp/fresh.ts

# Build completo para verificación
pnpm build:packages:core && pnpm --filter @autamedica/web build
```

---

## 23. Imported Senior Rules (Framework-Agnostic)

Paquete de reglas transferido desde AutoRenta y adaptado a AutaMedica sin dependencia de framework.

### 23.1 AI Cross-Review Protocol (Mandatory)

**Regla:** Ningún cambio generado por IA queda "done" sin segunda auditoría (humano u otro agente).

**Checklist obligatorio (antes de merge):**

- [ ] `pnpm lint` pasa (0 errors / 0 warnings)
- [ ] Verificación de imports duplicados y paths no canónicos
- [ ] Verificación de regresiones de performance obvias (event listeners sin `passive: true` removido sin razón, rerenders evitables)
- [ ] Confirmar que no hubo reformat destructivo fuera del scope

**Riesgo real observado:** cambios auto-generados tienen tasa de rechazo alta cuando no se auditan en segunda pasada.

### 23.2 Safe DB Types Regeneration Protocol

**Regla:** Nunca sobreescribir `database.types.ts` directamente.

```bash
# 1) Generar snapshot temporal
supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > /tmp/fresh-db-types.ts

# 2) Comparar contra archivo canónico
diff packages/types/src/database.types.ts /tmp/fresh-db-types.ts

# 3) Validar enums/estados críticos del dominio
rg -n "appointment_status|user_role|consultation_type|document_status" /tmp/fresh-db-types.ts

# 4) Validar build/check antes de reemplazar
pnpm build:packages:core
pnpm --filter @autamedica/web check
```

Solo si todo pasa, copiar el snapshot al archivo canónico y commitear.

### 23.3 Workflow Resilience Standard

**Regla:** Preferir `skip` explícito por precondición faltante. Evitar `continue-on-error` en jobs críticos.

```yaml
# ✅ Correcto
- name: Check prerequisites
  id: precheck
  run: |
    if [ -z "${{ secrets.REQUIRED_SECRET }}" ]; then
      echo "skip=true" >> "$GITHUB_OUTPUT"
      echo "Missing secret, skipping safely."
    fi

- name: Critical step
  if: steps.precheck.outputs.skip != 'true'
  run: ./scripts/run-critical-step.sh

# ❌ Incorrecto
- name: Critical step
  continue-on-error: true
  run: ./scripts/run-critical-step.sh
```

### 23.4 Post-Implementation Review (UI)

**Regla:** Cambios UI/UX requieren evidencia, no inferencia.

**Checklist obligatorio:**

- [ ] Captura before/after
- [ ] Viewports: 375, 768, 1024, 1440
- [ ] Lista explícita de issues encontrados (aunque sean menores)
- [ ] Confirmación de touch targets y overflow en móvil

### 23.5 Long-Running Ops Reliability

Migraciones largas, builds pesados o test suites extensas deben correr en `tmux`:

- Persistencia si se corta la sesión SSH/terminal
- Monitoreo de progreso con `tmux capture-pane`
- Menor riesgo de operaciones incompletas

### 23.6 SQL Identifier Safety (`atomic` rule)

Por bug conocido del parser de Supabase CLI, evitar `atomic` dentro de identificadores SQL:

- Tablas
- Columnas
- Funciones

Si un nombre legado no puede cambiarse, aislarlo en migración de statement único y validar localmente con `supabase db reset`.

### 23.7 Frozen Code Protocol

Todo dominio crítico debe tener un inventario de "frozen paths":

- Read-only por defecto
- Solo se modifican con pedido explícito del usuario
- Sin refactors "por limpieza" en código congelado

---

## Notas de Implementación

### Datos Médicos (Consideraciones Específicas)

1. **Retención:** Historia clínica mínimo 15 años (Ley 26.529 Argentina).
2. **Acceso:** Solo el paciente, médico tratante y admin autorizados.
3. **Audit Trail:** Toda modificación de datos médicos debe tener timestamp y actor.
4. **Cifrado:** Datos sensibles (diagnósticos, medicamentos) cifrados en reposo.
5. **Logs:** NUNCA loguear contenido médico. Solo IDs y timestamps para debugging.

### Telemedicina WebRTC

1. **Signaling Server**: No almacena sesiones médicas en DB. Solo facilita la conexión.
2. **Grabaciones**: Si se implementan, requieren consentimiento explícito y cifrado.
3. **Conexión P2P**: Los datos médicos en video NO pasan por los servidores de AutaMedica.
