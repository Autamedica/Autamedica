# 🚀 AutaMedica - Guía de Inicio Rápido

## ⚡ Setup Inmediato

```bash
# 1. Instalar dependencias
pnpm install

# 2. Iniciar desarrollo (todos los portales)
pnpm dev

# 3. Verificar sistema de roles
node test-role-routing.mjs
```

**🎯 En 30 segundos tendrás:**

- ✅ 5 aplicaciones ejecutándose en paralelo
- ✅ Sistema de roles completamente funcional
- ✅ Datos de prueba listos para testing

---

## 🌐 **URLs de Desarrollo**

| Aplicación    | URL Local             | Propósito                   |
| ------------- | --------------------- | --------------------------- |
| **Web-App**   | http://localhost:3000 | Landing + Auth central      |
| **Doctors**   | http://localhost:3001 | Portal médicos profesional  |
| **Patients**  | http://localhost:3002 | Portal pacientes personal   |
| **Companies** | http://localhost:3003 | Portal empresarial + Crisis |
| **Admin**     | http://localhost:3004 | Panel administrativo        |

---

## 👥 **Usuarios de Prueba Listos**

### 🔐 **Login Testing**

**Para testing de redirects automáticos:**

```
📧 admin@clinica-demo.com     → Admin Portal (organization_admin)
📧 company@clinica-demo.com   → Companies Portal (company_admin)
📧 doctor@clinica-demo.com    → Doctors Portal (doctor)
📧 patient@clinica-demo.com   → Patients Portal (patient)
📧 platform@clinica-demo.com  → Platform Admin (platform_admin)
```

**🎯 Flujo de Testing:**

1. Ir a http://localhost:3000/auth/login
2. Usar cualquier email de arriba
3. Sistema redirige automáticamente al portal correcto
4. ✅ Verificar que el rol y URL son correctos

---

## 🧪 **Validación Rápida**

### ⚡ **Tests Automatizados**

```bash
# Verificar role routing (debe mostrar 7/7 roles OK)
node test-role-routing.mjs

# Verificar TypeScript + ESLint
pnpm typecheck && pnpm lint

# Verificar contratos
pnpm docs:validate
```

### 🔍 **Verificación Manual en DB**

```sql
-- Conectar a Supabase y ejecutar:

-- 1. Verificar organización demo
SELECT id, name, slug FROM public.organizations
WHERE name = 'Clínica Demo AutaMedica';

-- 2. Verificar usuarios de prueba
SELECT profile_id, role FROM public.user_roles
WHERE metadata->>'seed' = 'true'
ORDER BY role;

-- 3. Verificar membresías
SELECT organization_id, profile_id, role
FROM public.org_members
WHERE organization_id = '00000000-0000-0000-0000-000000000111';
```

---

## 🔄 **Workflows Comunes**

### 🛠️ **Desarrollo Activo**

```bash
# Solo web-app (más rápido para auth testing)
pnpm dev --filter @autamedica/web-app

# Solo doctors portal
pnpm dev --filter @autamedica/doctors

# Web-app + doctors (testing redirects)
pnpm dev --filter @autamedica/web-app --filter @autamedica/doctors
```

### 🚀 **Preparar Deploy**

```bash
# Build completo
pnpm build

# Verificar todo OK antes de commit
pnpm typecheck && pnpm lint && node test-role-routing.mjs
```

### 🔧 **Resolver Problemas Comunes**

```bash
# Limpiar cache si hay problemas
rm -rf node_modules dist .next .turbo
pnpm install

# Regenerar tipos de DB si cambió schema
pnpm db:generate && pnpm db:validate

# Verificar que seeds están aplicados
node -e "console.log('Seeds check: Connect to Supabase and run verification queries')"
```

---

## 🎯 **Flujos de Testing por Rol**

### 1. **Testing Organization Admin**

```bash
# 1. Login como admin@clinica-demo.com
# 2. Debe redirigir a Admin Portal (localhost:3004)
# 3. Verificar acceso a gestión de organizaciones
```

### 2. **Testing Company Portal**

```bash
# 1. Login como company@clinica-demo.com
# 2. Debe redirigir a Companies Portal (localhost:3003)
# 3. Verificar Crisis Control + Marketplace
```

### 3. **Testing Doctor Portal**

```bash
# 1. Login como doctor@clinica-demo.com
# 2. Debe redirigir a Doctors Portal (localhost:3001)
# 3. Verificar dashboard médico + videollamadas
```

### 4. **Testing Patient Portal**

```bash
# 1. Login como patient@clinica-demo.com
# 2. Debe redirigir a Patients Portal (localhost:3002)
# 3. Verificar portal personal + temas
```

---

## 📚 **Archivos Clave**

### 🔐 **Sistema de Roles**

- `supabase/migrations/20250929_introduce_role_system.sql` - Migración principal
- `supabase/seed_role_system.sql` - Datos de prueba
- `test-role-routing.mjs` - Tests automatizados
- `packages/shared/src/role-routing.ts` - Lógica de routing

### 📊 **Monitoreo**

- `ROLE_SYSTEM_STATUS.md` - Estado del sistema completo
- `.github/workflows/` - CI/CD automático
- `package.json` - Scripts disponibles

---

## 🚨 **Solución de Problemas**

### ❌ **Puerto ocupado**

```bash
# Matar procesos en puertos 3000-3004
lsof -ti:3000,3001,3002,3003,3004 | xargs -r kill -9
```

### ❌ **Seeds no aplicados**

```bash
# Ir a Supabase Dashboard SQL Editor:
# https://supabase.com/dashboard/project/gtyvdircfhmdjiaelqkg/sql
# Copiar contenido de: supabase/seed_role_system.sql
# Ejecutar script
```

### ❌ **Tests fallan**

```bash
# Verificar que packages están built
pnpm build:packages

# Verificar exports
pnpm docs:validate

# Re-ejecutar tests
node test-role-routing.mjs
```

---

## 🎯 **Next Steps**

### 🔥 **Testing Inmediato**

1. ✅ Ejecutar `pnpm dev`
2. ✅ Probar login con usuarios demo
3. ✅ Verificar redirects automáticos
4. ✅ Confirmar que cada portal carga correctamente

### 🚀 **Development Ready**

- Sistema 100% operativo para desarrollo
- Base sólida para features avanzadas
- CI/CD automático configurado
- Datos de prueba realistas listos

**🎉 ¡Sistema listo para development activo!**
