# 📋 Plan de Integración Completo - App Pacientes

## AutaMedica - Portal de Pacientes con Supabase

**Fecha de creación:** 2 de Octubre, 2025
**Estado:** En progreso
**Objetivo:** Conectar todos los componentes a Supabase y proteger todas las rutas con autenticación

---

## 🔍 AUDITORÍA COMPLETADA

### ✅ Estado Actual de Autenticación

#### **Sistema de Auth Implementado:**

- ✅ `AuthContext` en `/src/contexts/AuthContext.tsx`
- ✅ `AuthProvider` en root layout
- ✅ Cliente Supabase en `/src/lib/supabase.ts`
- ✅ Variables de entorno configuradas (`.env.production`)
- ⚠️ **FALTA:** Middleware de protección de rutas
- ⚠️ **FALTA:** Redirección a login si no autenticado

#### **Comentario Crítico Encontrado (layout.tsx:21):**

```typescript
// Always allow access - no redirects
```

**PROBLEMA:** La aplicación permite acceso sin autenticación

---

## 🚨 PROBLEMAS CRÍTICOS DETECTADOS

### 1. **Rutas SIN Protección**

Todas las páginas son accesibles sin login:

- ❌ `/` (Dashboard)
- ❌ `/appointments` (Citas)
- ❌ `/anamnesis` (Historia clínica)
- ❌ `/medical-history` (Historial médico)
- ❌ `/preventive-health`
- ❌ `/profile`
- ❌ Todas las demás rutas

### 2. **Datos Hardcodeados (Mock Data)**

#### **📄 Appointments (`/appointments/page.tsx`):**

```typescript
import { mockAppointments, getAppointmentsByStatus } from "../../../../mocks/appointments";
```

- ❌ Usa datos mock en lugar de Supabase
- ❌ Botón "Agendar nueva cita" no funcional
- ❌ Stats calculadas con datos ficticios

#### **📄 Medical History (`/medical-history/page.tsx`):**

```typescript
import { mockMedicalRecords } from "../../../../mocks/medical-records";
```

- ❌ Usa datos mock de registros médicos
- ❌ Botón "Exportar historial" no funcional
- ❌ Botón "Ver detalle" no funcional

#### **📄 Anamnesis (`/anamnesis/page.tsx`):**

- ✅ **Parcialmente conectado** - Usa hook `useAnamnesis()`
- ⚠️ Guarda en `localStorage` como respaldo
- ⚠️ No valida que el usuario esté autenticado antes de crear

### 3. **Componentes con Mock Client**

**`/src/lib/supabase.ts` tiene un modo "dev bypass":**

```typescript
const isDevBypass = patientsEnv.authDevBypassEnabled;
if (isDevBypass) {
  return createMockClient() as any; // ❌ Cliente falso
}
```

---

## 📊 INVENTARIO COMPLETO DE COMPONENTES

### **Páginas Principales (22 rutas)**

| Ruta                   | Estado Auth          | Conexión DB               | Prioridad |
| ---------------------- | -------------------- | ------------------------- | --------- |
| `/` (Dashboard)        | ❌ No protegida      | ✅ Parcial (appointments) | 🔴 Alta   |
| `/appointments`        | ❌ No protegida      | ❌ Mock data              | 🔴 Alta   |
| `/anamnesis`           | ❌ No protegida      | ✅ Parcial                | 🔴 Alta   |
| `/medical-history`     | ❌ No protegida      | ❌ Mock data              | 🔴 Alta   |
| `/preventive-health`   | ❌ No protegida      | ❌ No revisada            | 🟡 Media  |
| `/profile`             | ❌ No protegida      | ❌ No revisada            | 🟡 Media  |
| `/call/[roomId]`       | ❌ No protegida      | ❌ No revisada            | 🟡 Media  |
| `/community`           | ❌ No protegida      | ❌ No revisada            | 🟢 Baja   |
| `/reproductive-health` | ❌ No protegida      | ❌ No revisada            | 🟢 Baja   |
| `/results`             | ❌ No protegida      | ❌ No revisada            | 🟢 Baja   |
| `/settings`            | ❌ No protegida      | ❌ No revisada            | 🟡 Media  |
| `/team`                | ❌ No protegida      | ❌ No revisada            | 🟢 Baja   |
| `/wallet`              | ❌ No protegida      | ❌ No revisada            | 🟢 Baja   |
| `/help`                | ✅ Puede ser pública | -                         | -         |
| `/onboarding`          | ✅ Puede ser pública | ❌ No revisada            | 🟡 Media  |

### **Componentes con Hooks de Supabase**

Archivos que YA tienen integración parcial:

- ✅ `useAnamnesis.ts` - Hook para anamnesis
- ✅ `useMedicalHistory.ts` - Hook para historial
- ✅ `useTelemedicine.ts` - Hook para telemedicina
- ✅ `useCommunity.ts` - Hook para comunidad
- ✅ `usePreventiveScreenings.ts` - Hook para screenings
- ✅ `useReproductiveHealthAppointments.ts` - Hook para citas
- ✅ `useReproductiveHealthSpecialists.ts` - Hook para especialistas
- ✅ `useHealthCentersGeolocation.ts` - Hook para geolocalización
- ✅ `useMedicalChat.ts` - Hook para chat médico

**✅ BUENA NOTICIA:** Ya existen hooks personalizados. Solo falta conectarlos a los componentes.

---

## 🎯 PLAN DE INTEGRACIÓN (6 FASES)

### **FASE 1: Protección de Rutas** 🔴 CRÍTICO

**Objetivo:** Ninguna página debe ser accesible sin login

#### Tareas:

1. ✅ Crear `middleware.ts` en la raíz de `/src`
2. ✅ Configurar matcher para proteger todas las rutas excepto públicas
3. ✅ Verificar sesión de Supabase en middleware
4. ✅ Redirigir a login si no hay sesión válida
5. ✅ Remover comentario "Always allow access" de layout.tsx

**Archivos a modificar:**

- `src/middleware.ts` (crear)
- `src/app/layout.tsx` (modificar línea 21)
- `next.config.mjs` (agregar experimental middleware)

**Rutas públicas permitidas:**

- `/auth/*` (login, registro, callback)
- `/help` (ayuda)
- `/_next/*` (assets)
- `/api/*` (endpoints públicos si existen)

---

### **FASE 2: Integración de Appointments** 🔴 CRÍTICO

**Objetivo:** Reemplazar mock data con datos reales de Supabase

#### Tabla Supabase: `appointments`

```sql
appointments (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES auth.users(id),
  doctor_id UUID REFERENCES auth.users(id),
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT, -- 'pending', 'confirmed', 'completed', 'cancelled'
  type TEXT, -- 'in_person', 'telemedicine'
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

#### Tareas:

1. ✅ Verificar/crear tabla `appointments` en Supabase
2. ✅ Actualizar `/appointments/page.tsx` para usar hook real
3. ✅ Implementar función "Agendar nueva cita"
4. ✅ Conectar botones de acción (ver, cancelar, reagendar)
5. ✅ Remover imports de mock data

**Archivos a modificar:**

- `src/app/(dashboard)/appointments/page.tsx`
- Crear hook `useAppointments.ts` si no existe
- Crear componente `AppointmentModal.tsx` para crear/editar

---

### **FASE 3: Integración de Medical History** 🔴 CRÍTICO

**Objetivo:** Historial médico real desde Supabase

#### Tabla Supabase: `medical_records`

```sql
medical_records (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES auth.users(id),
  doctor_id UUID,
  appointment_id UUID REFERENCES appointments(id),
  record_type TEXT, -- 'diagnosis', 'prescription', 'lab_result', 'note'
  title TEXT,
  description TEXT,
  diagnosis TEXT,
  treatment TEXT,
  attachments JSONB, -- URLs de archivos
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

#### Tareas:

1. ✅ Verificar/crear tabla `medical_records`
2. ✅ Actualizar `/medical-history/page.tsx`
3. ✅ Implementar función "Exportar historial" (PDF)
4. ✅ Implementar modal "Ver detalle"
5. ✅ Conectar filtros por tipo de registro
6. ✅ Remover mock data

**Archivos a modificar:**

- `src/app/(dashboard)/medical-history/page.tsx`
- `src/hooks/useMedicalHistory.ts` (ya existe, revisar)
- Crear `MedicalRecordDetailModal.tsx`
- Crear utilidad `exportToPDF.ts`

---

### **FASE 4: Completar Anamnesis** 🟡 PRIORIDAD MEDIA

**Objetivo:** Anamnesis 100% funcional con Supabase

#### Tabla Supabase: `anamnesis`

```sql
anamnesis (
  id UUID PRIMARY KEY,
  patient_id UUID REFERENCES auth.users(id),
  status TEXT, -- 'draft', 'in_progress', 'completed'
  completion_percentage INTEGER,
  personal_info JSONB,
  medical_background JSONB,
  family_history JSONB,
  lifestyle JSONB,
  allergies JSONB,
  medications JSONB,
  reproductive_health JSONB,
  locked BOOLEAN DEFAULT false,
  privacy_accepted BOOLEAN,
  terms_accepted BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

#### Tareas:

1. ✅ Hook `useAnamnesis` ya existe, verificar funcionalidad completa
2. ✅ Agregar método `updateAnamnesis` al hook (falta en línea 144)
3. ✅ Implementar sincronización con `localStorage` como backup
4. ✅ Agregar validación de sesión antes de crear/actualizar
5. ✅ Implementar notificaciones de guardado exitoso/error

**Archivos a modificar:**

- `src/hooks/useAnamnesis.ts` (agregar método faltante)
- `src/app/(dashboard)/anamnesis/page.tsx` (línea 144)

---

### **FASE 5: Profile, Settings y Rutas Secundarias** 🟡 PRIORIDAD MEDIA

#### **5.1 Profile (`/profile`)**

Tabla: `user_profiles`

```sql
user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  date_of_birth DATE,
  gender TEXT,
  phone TEXT,
  address JSONB,
  emergency_contact JSONB,
  insurance_info JSONB,
  avatar_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

#### **5.2 Settings (`/settings`)**

- Preferencias de notificaciones
- Configuración de privacidad
- Cambio de contraseña
- Eliminación de cuenta

#### **5.3 Reproductive Health (`/reproductive-health`)**

- Ya tiene hook `useReproductiveHealthAppointments`
- Conectar componente `ReproductiveHealthHub.tsx`

#### **5.4 Preventive Health (`/preventive-health`)**

- Ya tiene hook `usePreventiveScreenings`
- Crear tabla `preventive_screenings` si no existe

---

### **FASE 6: Telemedicina y Rutas Avanzadas** 🟢 PRIORIDAD BAJA

#### **6.1 Video Calls (`/call/[roomId]`)**

- Integrar con WebRTC
- Verificar que solo usuarios autenticados puedan unirse
- Guardar grabaciones en `storage.buckets`

#### **6.2 Community (`/community`)**

- Hook `useCommunity` ya existe
- Conectar con tabla `community_posts`

#### **6.3 Wallet (`/wallet`)**

- Sistema de pagos y saldo
- Integración con Stripe/MercadoPago

---

## 🗂️ ESTRUCTURA DE BASE DE DATOS COMPLETA

### Tablas Principales Necesarias:

```sql
-- 1. Usuarios (gestionado por Supabase Auth)
auth.users

-- 2. Perfiles de pacientes
user_profiles

-- 3. Citas médicas
appointments

-- 4. Historial médico
medical_records

-- 5. Anamnesis
anamnesis

-- 6. Prescripciones
prescriptions

-- 7. Resultados de laboratorio
lab_results

-- 8. Screenings preventivos
preventive_screenings

-- 9. Citas de salud reproductiva
reproductive_health_appointments

-- 10. Especialistas
specialists

-- 11. Centros de salud
health_centers

-- 12. Posts de comunidad
community_posts

-- 13. Comentarios
community_comments

-- 14. Chats médicos
medical_chats

-- 15. Mensajes de chat
chat_messages
```

### RLS Policies (Row Level Security):

**Regla fundamental:** Los pacientes solo pueden ver SUS propios datos

```sql
-- Ejemplo para appointments
CREATE POLICY "Patients can view own appointments"
ON appointments FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Patients can create own appointments"
ON appointments FOR INSERT
WITH CHECK (auth.uid() = patient_id);

-- Ejemplo para medical_records
CREATE POLICY "Patients can view own medical records"
ON medical_records FOR SELECT
USING (auth.uid() = patient_id);

-- Los médicos pueden ver registros de sus pacientes
CREATE POLICY "Doctors can view patient medical records"
ON medical_records FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.doctor_id = auth.uid()
    AND appointments.patient_id = medical_records.patient_id
  )
);
```

---

## 📝 CHECKLIST DE IMPLEMENTACIÓN

### **Paso 1: Protección de Rutas** (1-2 horas)

- [ ] Crear `middleware.ts`
- [ ] Configurar rutas públicas/privadas
- [ ] Probar redirección a login
- [ ] Probar acceso después de login
- [ ] Deploy y verificación en producción

### **Paso 2: Crear/Verificar Tablas** (2-3 horas)

- [ ] Revisar esquema actual en Supabase
- [ ] Crear tablas faltantes
- [ ] Configurar RLS policies
- [ ] Crear índices para performance
- [ ] Probar queries básicas

### **Paso 3: Integración Appointments** (3-4 horas)

- [ ] Actualizar página appointments
- [ ] Crear modal de nueva cita
- [ ] Implementar CRUD completo
- [ ] Testing de funcionalidad
- [ ] Deploy

### **Paso 4: Integración Medical History** (3-4 horas)

- [ ] Actualizar página medical-history
- [ ] Crear modal de detalle
- [ ] Implementar exportación PDF
- [ ] Implementar filtros
- [ ] Testing y deploy

### **Paso 5: Completar Anamnesis** (2-3 horas)

- [ ] Agregar método updateAnamnesis
- [ ] Mejorar sincronización
- [ ] Agregar validaciones
- [ ] Testing completo
- [ ] Deploy

### **Paso 6: Profile y Settings** (4-5 horas)

- [ ] Crear página de perfil
- [ ] Implementar edición de datos
- [ ] Crear página settings
- [ ] Implementar cambio de contraseña
- [ ] Deploy

### **Paso 7: Rutas Secundarias** (6-8 horas)

- [ ] Reproductive health
- [ ] Preventive health
- [ ] Community
- [ ] Wallet
- [ ] Deploy

### **Paso 8: Testing Final** (2-3 horas)

- [ ] Testing de autenticación
- [ ] Testing de cada página
- [ ] Testing de integración
- [ ] Performance testing
- [ ] Security audit

---

## ⚠️ CONSIDERACIONES DE SEGURIDAD

### **1. Variables de Entorno**

```bash
# NUNCA commit estas variables
NEXT_PUBLIC_SUPABASE_URL=https://knywotiidsydsaveqkjs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=***REDACTED***
```

### **2. RLS Obligatorio**

- ✅ Todas las tablas deben tener RLS habilitado
- ✅ Políticas restrictivas por defecto (deny all)
- ✅ Solo permitir acceso explícito

### **3. Validación Client + Server**

- ✅ Validar en componentes (UX)
- ✅ Validar en Supabase Functions (seguridad)
- ✅ NUNCA confiar en datos del cliente

### **4. HIPAA Compliance**

- ✅ Logs de auditoría para acceso a datos médicos
- ✅ Encriptación de datos sensibles
- ✅ Políticas de retención de datos
- ✅ Consentimiento explícito del paciente

---

## 🚀 ORDEN DE EJECUCIÓN RECOMENDADO

### **Sprint 1: Seguridad Básica** (1 semana)

1. Protección de rutas (middleware)
2. Crear/verificar tablas principales
3. Configurar RLS policies

### **Sprint 2: Funcionalidad Core** (2 semanas)

1. Appointments completamente funcional
2. Medical History completamente funcional
3. Anamnesis 100% integrada
4. Profile y Settings

### **Sprint 3: Funcionalidades Avanzadas** (2 semanas)

1. Reproductive Health
2. Preventive Health
3. Community
4. Telemedicina

### **Sprint 4: Polish y Testing** (1 semana)

1. Testing exhaustivo
2. Performance optimization
3. Security audit
4. Documentation

---

## 📊 MÉTRICAS DE ÉXITO

- ✅ **100% de rutas protegidas** - Login obligatorio para acceder
- ✅ **0 mock data** - Todos los datos desde Supabase
- ✅ **0 errores de autenticación** - Sesiones persistentes
- ✅ **< 2s tiempo de carga** - Performance optimizada
- ✅ **100% cobertura RLS** - Todas las tablas protegidas
- ✅ **0 vulnerabilidades** - Security audit pasado

---

## 📞 PRÓXIMOS PASOS INMEDIATOS

**¿Qué hacer ahora?**

1. **Revisar este plan** - ¿Falta algo? ¿Prioridades correctas?
2. **Decidir orden** - ¿Empezamos con Fase 1 (protección de rutas)?
3. **Revisar esquema DB** - ¿Las tablas propuestas son correctas?
4. **Asignar tiempos** - ¿Cuánto tiempo tenemos?

**Comando para empezar:**

```bash
# Iniciar Fase 1: Protección de Rutas
# 1. Crear middleware
# 2. Probar localmente
# 3. Deploy
```

---

**Documento creado el 2 de Octubre, 2025**
**Última actualización:** 2 de Octubre, 2025
**Próxima revisión:** Después de completar Fase 1
