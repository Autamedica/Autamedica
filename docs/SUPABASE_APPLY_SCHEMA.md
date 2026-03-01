# Aplicar Schema de Supabase - Guía Paso a Paso

## ✅ Estado Actual

**Implementación completada:**

- ✅ Types creados en `@autamedica/types` (1,250+ líneas)
- ✅ Hooks personalizados (`useAnamnesis`, `useTelemedicine`, `useCommunity`)
- ✅ Schema SQL completo y listo para aplicar

## 🎯 Próximos Pasos para Activar el Sistema

### 1. Obtener Clave Anónima de Supabase

**Acceder al Dashboard de Supabase:**

```
https://supabase.com/dashboard/project/qxjjrpksmwwrmubhvjew/settings/api
```

**Copiar la clave anónima (anon/public key):**

- Navegar a: Project Settings → API
- Copiar: `anon` / `public` key
- **NO** usar la `service_role` key en frontend

### 2. Actualizar Variables de Entorno

**Archivo:** `.env.local`

```bash
# Supabase (Reemplazar la clave actual)
NEXT_PUBLIC_SUPABASE_URL=https://qxjjrpksmwwrmubhvjew.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=***REDACTED***  # ← REEMPLAZAR AQUÍ
SUPABASE_JWT_SECRET=l5v/qoRl8SqzvN07iMcott58d3rWp4eiFimpYsm4v6YpegKM6uG3BtQGNMjktD5egtJ1PI92tkCzp2EAkXE7gw==
```

### 3. Aplicar Schema SQL en Supabase

**Opción A: SQL Editor (Recomendado)**

1. Abrir SQL Editor en Supabase Dashboard:

   ```
   https://supabase.com/dashboard/project/qxjjrpksmwwrmubhvjew/sql/new
   ```

2. Copiar contenido completo de:

   ```
   docs/supabase-schema-complete.sql
   ```

3. Pegar en el editor y ejecutar (`Run`)

4. Verificar que todas las tablas se crearon:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```

**Opción B: CLI de Supabase**

```bash
# Instalar Supabase CLI (si no está instalado)
npm install -g supabase

# Aplicar schema
supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.qxjjrpksmwwrmubhvjew.supabase.co:5432/postgres" \
  --file docs/supabase-schema-complete.sql
```

### 4. Verificar Tablas Creadas

**Tablas esperadas (19 total):**

**Base:**

- `appointments`
- `patient_care_team`

**Anamnesis (Historia Clínica):**

- `anamnesis`
- `anamnesis_sections`
- `anamnesis_attachments`

**Telemedicina:**

- `telemedicine_sessions`
- `session_participants`
- `session_events`
- `session_recordings`

**Comunidad de Pacientes:**

- `community_groups`
- `group_memberships`
- `community_posts`
- `post_comments`
- `post_reactions`
- `content_reports`
- `community_notifications`

**Salud Preventiva:**

- `patient_screenings`
- `screening_reminders`
- `health_goals`

### 5. Verificar Políticas RLS

Todas las tablas deben tener RLS habilitado:

```sql
-- Verificar RLS
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = true;
```

### 6. Seed Data Inicial (Opcional)

**Crear grupos de comunidad de ejemplo:**

```sql
-- Insertar grupos de comunidad
INSERT INTO community_groups (name, description, category, member_count, privacy_level)
VALUES
  ('Diabetes Tipo 2', 'Comunidad de apoyo para personas con diabetes tipo 2', 'chronic_conditions', 0, 'public'),
  ('Hipertensión', 'Grupo de apoyo para control de presión arterial', 'chronic_conditions', 0, 'public'),
  ('Salud Mental', 'Espacio seguro para compartir sobre salud mental', 'mental_health', 0, 'public'),
  ('Embarazo y Maternidad', 'Apoyo durante el embarazo y primeros meses', 'pregnancy', 0, 'public'),
  ('Cuidadores Familiares', 'Apoyo para quienes cuidan familiares enfermos', 'caregivers', 0, 'public');
```

### 7. Verificar Conexión desde la App

**Test de conexión:**

```typescript
// En cualquier componente de pacientes
import { createBrowserClient } from "@autamedica/auth";

const supabase = createBrowserClient();

// Test básico
const { data, error } = await supabase.from("community_groups").select("*").limit(5);

console.log("Grupos:", data);
console.log("Error:", error);
```

### 8. Reiniciar Servidor de Desarrollo

```bash
# Desde el root del monorepo
pnpm dev --filter @autamedica/patients

# O reiniciar todos los servidores
pnpm dev
```

## 🔍 Troubleshooting

### Error: "relation does not exist"

**Solución:** El schema no se aplicó correctamente. Revisar logs de SQL Editor.

### Error: "JWT expired" o "Invalid API key"

**Solución:** La `NEXT_PUBLIC_SUPABASE_ANON_KEY` es incorrecta o expiró. Obtener nueva key del dashboard.

### Error: "new row violates row-level security policy"

**Solución:** Las políticas RLS están muy restrictivas. Verificar que:

- El usuario está autenticado
- El `patient_id` coincide con `auth.uid()`
- Las políticas permiten INSERT/SELECT

### Error: "permission denied for table"

**Solución:** El rol `anon` necesita permisos. Ejecutar:

```sql
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
```

## 📊 Verificación Final

**Checklist de activación:**

- [ ] Clave anónima actualizada en `.env.local`
- [ ] Schema SQL aplicado exitosamente (19 tablas)
- [ ] RLS habilitado en todas las tablas
- [ ] Políticas RLS funcionando correctamente
- [ ] Seed data de grupos creado (opcional)
- [ ] Test de conexión desde app exitoso
- [ ] Servidor reiniciado y funcionando

## 🚀 Siguiente Fase

Una vez completados estos pasos:

1. **Conectar componentes UI** con los hooks creados
2. **Implementar formularios** de anamnesis
3. **Activar sistema de comunidad** con posts y comentarios
4. **Configurar WebRTC** para telemedicina

## 📚 Referencias

- **Schema completo:** `docs/supabase-schema-complete.sql`
- **Hooks disponibles:** `apps/patients/src/hooks/`
- **Types disponibles:** `packages/types/src/patient/`
- **Setup general:** `docs/SUPABASE_SETUP.md`

---

**✅ Estado:** Listo para aplicar schema y activar sistema completo de portal de pacientes.
