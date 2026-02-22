# 🚀 Release Guide - Sistema de Roles AutaMedica

## Script Unificado de Release

### Ejecución del Script Principal

```bash
# 1. Configurar URL de staging
export SUPABASE_DB_URL_STAGING="postgresql://postgres.knywotiidsydsaveqkjs:3QxHm2j09k-KJ3*^@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# 2. Ejecutar script completo
./scripts/release-org-roles.sh
```

### Qué hace el script:

1. ✅ **Aplica migraciones** ordenadas desde `supabase/migrations/`
2. ✅ **Ejecuta seeds** (seed_role_system.sql)
3. ✅ **Regenera tipos DB** y verifica sincronización
4. ✅ **Quality gates** locales (typecheck/lint/build)
5. ✅ **Tests de role routing** (29/30 tests)
6. ✅ **Crea/actualiza PR** automáticamente (si gh CLI disponible)

### Scripts Disponibles

```bash
# E2E Tests
pnpm test:e2e                    # Ejecutar tests E2E con Playwright
pnpm test:e2e:ui                 # Ejecutar con UI de Playwright

# RLS Tests
pnpm test:rls                    # Ejecutar tests SQL de RLS
# Requiere: export SUPABASE_DB_URL="..."

# Release completo
pnpm release:org-roles           # Ejecutar script unificado

# Tests de role routing
node test-role-routing.mjs       # Tests unitarios de routing
```

### Verificación Manual Post-Release

#### 1. Verificar Migraciones Aplicadas

```sql
-- En Supabase SQL Editor
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('organizations', 'org_members', 'user_roles');
```

#### 2. Verificar Seeds Aplicados

```sql
-- Verificar usuarios de prueba
SELECT email, role FROM public.profiles
WHERE email LIKE '%@clinica-demo.com';

-- Verificar organización demo
SELECT id, name, slug FROM public.organizations
WHERE name = 'Clínica Demo AutaMedica';
```

#### 3. Testing E2E Manual

```bash
# Iniciar desarrollo
pnpm dev

# Probar redirects en navegador:
# http://localhost:3000/auth/login
# - admin@clinica-demo.com → Admin Portal (localhost:3004)
# - company@clinica-demo.com → Companies Portal (localhost:3003)
# - doctor@clinica-demo.com → Doctors Portal (localhost:3001)
# - patient@clinica-demo.com → Patients Portal (localhost:3002)
```

### Rollback de Emergencia

Si algo sale mal:

```bash
# 1. Rollback de código
git revert <commit-hash>
git push origin feature/role-system-org-admin

# 2. Rollback de DB (solo si necesario)
psql "$SUPABASE_DB_URL_STAGING" << 'SQL'
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS org_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
SQL
```

### Estado Final Esperado

Al completar el release:

- ✅ **29/30 tests** de role routing pasando
- ✅ **Migración aplicada** sin errores
- ✅ **5 usuarios de prueba** funcionando
- ✅ **1 organización demo** configurada
- ✅ **RLS policies** activas y validadas
- ✅ **CI/CD workflows** operativos
- ✅ **PR creado** con checklist completo
- ✅ **Documentación** completa (README, Quick Start, Test Credentials)

### Contacto y Soporte

En caso de problemas:

1. Revisar logs del script: `./scripts/release-org-roles.sh`
2. Verificar conectividad DB: `psql "$SUPABASE_DB_URL_STAGING" -c "SELECT 1"`
3. Ejecutar tests: `node test-role-routing.mjs`
4. Consultar documentación: `README.md`, `QUICK_START.md`

**🎯 Sistema listo para producción!**
