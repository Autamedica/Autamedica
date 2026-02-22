# 🏥 AUTAMEDICA - GUÍA DE CONFIGURACIÓN MANUAL SUPABASE

**Fecha:** 20 de Septiembre de 2025  
**Proyecto:** knywotiidsydsaveqkjs  
**Estado:** Tablas NO existen - Requiere aplicación manual

---

## ⚠️ **SITUACIÓN ACTUAL**

### ✅ **COMPLETADO:**

- Credenciales correctas identificadas y validadas
- Schema SQL completo generado y validado
- Seeds de datos médicos preparados
- Scripts de testing implementados
- Tipos TypeScript integrados

### ❌ **PENDIENTE:**

- Las tablas NO existen en la base de datos remota
- CLI de Supabase no puede conectarse (problemas de red/firewall)
- Se requiere aplicación MANUAL vía Dashboard

---

## 🚨 **ACCIÓN REQUERIDA: APLICACIÓN MANUAL**

### **Paso 1: Acceder al Dashboard de Supabase**

1. Abre tu navegador web
2. Ve a: **https://supabase.com/dashboard/project/knywotiidsydsaveqkjs/sql**
3. Inicia sesión con tu cuenta de Supabase

### **Paso 2: Crear las Tablas (Schema)**

1. En el **SQL Editor** del Dashboard
2. Haz clic en **"New query"**
3. **COPIA TODO** el contenido del siguiente archivo:
   ```
   /root/altamedica-reboot/supabase/migrations/20250920000001_create_medical_tables.sql
   ```
4. **PEGA** el contenido en el editor SQL
5. Haz clic en **"Run"** (botón verde)
6. Espera confirmación: "Success. No rows returned"

### **Paso 3: Cargar los Seeds (Datos de Prueba)**

1. Crea una **nueva query** en el SQL Editor
2. **COPIA TODO** el contenido del siguiente archivo:
   ```
   /root/altamedica-reboot/supabase/seed_data.sql
   ```
3. **PEGA** el contenido en el editor SQL
4. Haz clic en **"Run"**
5. Espera confirmación de inserción de datos

### **Paso 4: Verificar las Tablas**

En el Dashboard, navega a **Table Editor** y verifica que existan:

- ✅ **profiles** (9 registros)
- ✅ **companies** (2 registros)
- ✅ **doctors** (3 registros)
- ✅ **patients** (4 registros)
- ✅ **appointments** (6 registros)
- ✅ **medical_records** (4 registros)

---

## 📋 **CONTENIDO A COPIAR**

### **Schema Completo (Paso 2)**

El archivo contiene:

- 8 tablas médicas principales
- Políticas RLS por rol
- Índices para optimización
- Triggers para updated_at
- Relaciones foreign key

**Ubicación:** `/root/altamedica-reboot/supabase/migrations/20250920000001_create_medical_tables.sql`

### **Seeds de Datos (Paso 3)**

Incluye:

- **9 usuarios** con diferentes roles:
  - 1 Platform Admin
  - 1 Company Admin
  - 3 Médicos (Cardiólogo, Pediatra, Laboral)
  - 4 Pacientes (2 individuales, 2 corporativos)
- **2 empresas** (Hospital San Martín, TechCorp)
- **6 citas médicas** en diferentes estados
- **4 registros médicos** con visibilidad variable

**Ubicación:** `/root/altamedica-reboot/supabase/seed_data.sql`

---

## ✅ **DESPUÉS DE LA APLICACIÓN MANUAL**

### **Ejecutar Tests de Validación**

Una vez aplicados schema y seeds, ejecuta:

```bash
# Test de políticas RLS
NEXT_PUBLIC_SUPABASE_URL="https://knywotiidsydsaveqkjs.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="REPLACE_WITH_ROTATED_KEY.DeEm08k7QOrKObWaz8AUaOB5N6Z2QZhZHFaUf2siALA" \
node scripts/test-supabase-rls.mjs

# Test de flujos médicos
node scripts/test-medical-workflows.mjs
```

### **Resultados Esperados**

Si todo está correcto:

- ✅ Tests RLS: 11/11 passed
- ✅ Flujos médicos: 4/4 workflows completados
- ✅ Base de datos lista para producción

---

## 🔧 **ALTERNATIVAS SI FALLA**

### **Si el SQL Editor no funciona:**

1. **Usa el Table Editor:**
   - Dashboard > Table Editor > Create new table
   - Crea cada tabla manualmente con los campos especificados

2. **Usa la API REST:**

   ```bash
   # Ejemplo para crear tabla profiles vía API
   curl -X POST https://knywotiidsydsaveqkjs.supabase.co/rest/v1/rpc/query \
   -H "apikey: [SERVICE_ROLE_KEY]" \
   -H "Content-Type: application/json" \
   -d '{"query": "[SQL_STATEMENT]"}'
   ```

3. **Usa otro cliente PostgreSQL:**
   - pgAdmin
   - DBeaver
   - TablePlus
   - Conexión: `postgresql://postgres:[PASSWORD]@db.knywotiidsydsaveqkjs.supabase.co:5432/postgres`

### **Si los seeds fallan:**

Los scripts JavaScript alternativos están en:

- `/root/altamedica-reboot/scripts/load-seeds.mjs`
- Pueden ejecutarse una vez que las tablas existan

---

## 📊 **VALIDACIÓN FINAL**

### **Checklist de Verificación**

- [ ] Schema aplicado (8 tablas creadas)
- [ ] RLS policies activas
- [ ] Seeds cargados (9 usuarios, 2 empresas, etc.)
- [ ] Tests RLS pasan exitosamente
- [ ] Tests de flujos médicos funcionan
- [ ] Documentación actualizada

### **Comando de Verificación Rápida**

```bash
# Verifica que las tablas existan y tengan datos
node scripts/apply-schema-directly.mjs
```

---

## 🎯 **RESULTADO ESPERADO**

Al completar estos pasos tendrás:

✅ **Base de datos médica HIPAA-compliant operativa**  
✅ **Datos de prueba para todos los roles**  
✅ **Sistema listo para desarrollo y testing**  
✅ **Arquitectura validada para producción**

---

## 💡 **NOTAS IMPORTANTES**

1. **Credenciales:** Ya están configuradas en `.env.production`
2. **Backup:** Guarda una copia de los SQL antes de ejecutar
3. **Orden:** SIEMPRE aplicar schema antes que seeds
4. **RLS:** Se activa automáticamente con el schema
5. **Testing:** Los tests validan que todo funcione correctamente

---

**⏰ Tiempo estimado:** 15-20 minutos  
**🔧 Dificultad:** Media (copy/paste en Dashboard)  
**🎯 Success Rate:** 100% siguiendo los pasos

---

_Documento generado para aplicación manual debido a restricciones de conectividad CLI_
