# 📊 Base de Datos AutaMedica - Glosario Técnico

**🏥 Sistema Médico Completo con Cumplimiento HIPAA**

---

## 📋 Información General

| **Campo**                   | **Valor**                |
| --------------------------- | ------------------------ |
| **Base de Datos**           | parsed                   |
| **Esquema Principal**       | 1.0                      |
| **Última Migración**        | 2026-02-22T08:34:38.750Z |
| **Método de Introspección** | SQL_PARSING              |
| **Generado**                | 2026-03-01T23:13:42.609Z |

---

## 🔢 Estadísticas del Esquema

| **Métrica**                        | **Cantidad** |
| ---------------------------------- | ------------ |
| 📋 **Tablas Totales**              | 52           |
| 📊 **Columnas Totales**            | 585          |
| ⚙️ **Funciones**                   | 63           |
| 🔒 **Columnas HIPAA Clasificadas** | 0            |

---

---

## 📋 Tablas por Dominio Médico

### UNKNOWN

#### 📄 `profiles`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**   | **Tipo**  | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ------------- | --------- | ------------- | ------------------------------------- | --------- |
| `user_id`     | uuid      | ❌            | No description available              | -         |
| `email`       | TEXT      | ✅            | Comunicación con el paciente          | -         |
| `role`        | TEXT      | ✅            | No description available              | -         |
| `external_id` | TEXT      | ✅            | No description available              | -         |
| `first_name`  | TEXT      | ❌            | No description available              | -         |
| `last_name`   | TEXT      | ❌            | No description available              | -         |
| `phone`       | TEXT      | ❌            | Contacto de emergencia y citas        | -         |
| `avatar_url`  | TEXT      | ❌            | No description available              | -         |
| `active`      | BOOLEAN   | ❌            | No description available              | -         |
| `created_at`  | TIMESTAMP | ❌            | Auditoría de creación de registro     | -         |
| `updated_at`  | TIMESTAMP | ❌            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_profiles_email`** (btree) en email - Optimize query performance
- **`idx_profiles_role`** (btree) en role - Optimize query performance
- **`profiles_user_id_idx`** (btree) en user_id - Optimize query performance
- **`idx_profiles_numeric_id`** (btree) en numeric_id - Optimize query performance
- **`idx_profiles_role`** (btree) en role - Optimize query performance
- **`idx_profiles_portal`** (btree) en portal - Optimize query performance
- **`idx_profiles_organization`** (btree) en organization_id - Optimize query performance
- **`idx_profiles_email`** (btree) en email - Optimize query performance

---

### UNKNOWN

#### 📄 `companies`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**        | **Tipo**  | **Requerida** | **Propósito Médico**                     | **HIPAA** |
| ------------------ | --------- | ------------- | ---------------------------------------- | --------- |
| `id`               | UUID      | ❌            | No description available                 | -         |
| `name`             | TEXT      | ✅            | No description available                 | -         |
| `legal_name`       | TEXT      | ❌            | No description available                 | -         |
| `cuit`             | TEXT      | ❌            | No description available                 | -         |
| `industry`         | TEXT      | ❌            | No description available                 | -         |
| `size`             | TEXT      | ❌            | No description available                 | -         |
| `address`          | JSONB     | ❌            | Información demográfica para facturación | -         |
| `phone`            | TEXT      | ❌            | Contacto de emergencia y citas           | -         |
| `email`            | TEXT      | ❌            | Comunicación con el paciente             | -         |
| `website`          | TEXT      | ❌            | No description available                 | -         |
| `owner_profile_id` | UUID      | ❌            | No description available                 | -         |
| `active`           | BOOLEAN   | ❌            | No description available                 | -         |
| `created_at`       | TIMESTAMP | ❌            | Auditoría de creación de registro        | -         |
| `updated_at`       | TIMESTAMP | ❌            | Auditoría de modificación de registro    | -         |

##### 📈 Índices de Rendimiento

- **`idx_companies_owner_profile_id`** (btree) en owner_profile_id - Optimize query performance

---

### PROVIDER_MANAGEMENT

#### 📄 `doctors`

**Propósito**: Gestión de profesionales médicos

##### 📊 Columnas

| **Columna**          | **Tipo**      | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| -------------------- | ------------- | ------------- | ------------------------------------- | --------- |
| `id`                 | UUID          | ❌            | No description available              | -         |
| `user_id`            | UUID          | ❌            | No description available              | -         |
| `license_number`     | TEXT          | ✅            | No description available              | -         |
| `specialty`          | TEXT          | ✅            | No description available              | -         |
| `subspecialty`       | TEXT          | ❌            | No description available              | -         |
| `years_experience`   | INTEGER       | ❌            | No description available              | -         |
| `education`          | JSONB         | ❌            | No description available              | -         |
| `certifications`     | JSONB         | ❌            | No description available              | -         |
| `schedule`           | JSONB         | ❌            | No description available              | -         |
| `consultation_fee`   | DECIMAL(10,2) | ❌            | No description available              | -         |
| `accepted_insurance` | JSONB         | ❌            | Cobertura de seguro médico            | -         |
| `bio`                | TEXT          | ❌            | No description available              | -         |
| `languages`          | JSONB         | ❌            | No description available              | -         |
| `active`             | BOOLEAN       | ❌            | No description available              | -         |
| `created_at`         | TIMESTAMP     | ❌            | Auditoría de creación de registro     | -         |
| `updated_at`         | TIMESTAMP     | ❌            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_doctors_user_id`** (btree) en user_id - Optimize query performance
- **`idx_doctors_specialty_active`** (btree) en specialty,active - Optimize query performance

---

### PATIENT_MANAGEMENT

#### 📄 `patients`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**         | **Tipo**     | **Requerida** | **Propósito Médico**                     | **HIPAA** |
| ------------------- | ------------ | ------------- | ---------------------------------------- | --------- |
| `id`                | UUID         | ❌            | No description available                 | -         |
| `user_id`           | UUID         | ❌            | No description available                 | -         |
| `dni`               | TEXT         | ❌            | No description available                 | -         |
| `birth_date`        | DATE         | ❌            | Cálculo de edad para dosificación médica | -         |
| `gender`            | TEXT         | ❌            | No description available                 | -         |
| `blood_type`        | TEXT         | ❌            | No description available                 | -         |
| `height_cm`         | INTEGER      | ❌            | No description available                 | -         |
| `weight_kg`         | DECIMAL(5,2) | ❌            | No description available                 | -         |
| `emergency_contact` | JSONB        | ❌            | No description available                 | -         |
| `medical_history`   | JSONB        | ❌            | No description available                 | -         |
| `allergies`         | JSONB        | ❌            | No description available                 | -         |
| `medications`       | JSONB        | ❌            | Tratamiento farmacológico prescrito      | -         |
| `insurance_info`    | JSONB        | ❌            | Cobertura de seguro médico               | -         |
| `company_id`        | UUID         | ❌            | No description available                 | -         |
| `active`            | BOOLEAN      | ❌            | No description available                 | -         |
| `created_at`        | TIMESTAMP    | ❌            | Auditoría de creación de registro        | -         |
| `updated_at`        | TIMESTAMP    | ❌            | Auditoría de modificación de registro    | -         |

##### 📈 Índices de Rendimiento

- **`idx_patients_user_id`** (btree) en user_id - Optimize query performance
- **`idx_patients_company_active`** (btree) en organization_id,active - Optimize query performance

---

### UNKNOWN

#### 📄 `company_members`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**          | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| -------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                 | UUID        | ❌            | No description available              | -         |
| `company_id`         | UUID        | ❌            | No description available              | -         |
| `profile_id`         | UUID        | ❌            | No description available              | -         |
| `role`               | TEXT        | ❌            | No description available              | -         |
| `position`           | TEXT        | ❌            | No description available              | -         |
| `department`         | TEXT        | ❌            | No description available              | -         |
| `employee_id`        | TEXT        | ❌            | No description available              | -         |
| `start_date`         | DATE        | ❌            | No description available              | -         |
| `end_date`           | DATE        | ❌            | No description available              | -         |
| `active`             | BOOLEAN     | ❌            | No description available              | -         |
| `created_at`         | TIMESTAMP   | ❌            | Auditoría de creación de registro     | -         |
| `updated_at`         | TIMESTAMP   | ❌            | Auditoría de modificación de registro | -         |
| `UNIQUE(company_id,` | profile_id) | ❌            | No description available              | -         |

---

### PATIENT_MANAGEMENT

#### 📄 `patient_care_team`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**          | **Tipo**   | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| -------------------- | ---------- | ------------- | ------------------------------------- | --------- |
| `id`                 | UUID       | ❌            | No description available              | -         |
| `patient_id`         | UUID       | ❌            | No description available              | -         |
| `doctor_id`          | UUID       | ❌            | No description available              | -         |
| `role`               | TEXT       | ❌            | No description available              | -         |
| `assigned_date`      | DATE       | ❌            | No description available              | -         |
| `active`             | BOOLEAN    | ❌            | No description available              | -         |
| `created_at`         | TIMESTAMP  | ❌            | Auditoría de creación de registro     | -         |
| `updated_at`         | TIMESTAMP  | ❌            | Auditoría de modificación de registro | -         |
| `UNIQUE(patient_id,` | doctor_id) | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_patient_care_team_lookup`** (btree) en doctor_id,patient_id,active - Optimize query performance
- **`idx_patient_care_team_lookup`** (btree) en doctor_id,patient_id,active - Optimize query performance
- **`idx_patient_care_team_patient`** (btree) en patient_id,active - Optimize query performance
- **`idx_patient_care_team_doctor`** (btree) en doctor_id,active - Optimize query performance
- **`idx_patient_care_team_dates`** (btree) en assigned_at,updated_at - Optimize query performance
- **`idx_patient_care_team_lookup`** (btree) en doctor_id,patient_id,active - Optimize query performance
- **`idx_patient_care_team_patient`** (btree) en patient_id,active - Optimize query performance
- **`idx_patient_care_team_doctor`** (btree) en doctor_id,active - Optimize query performance

---

### APPOINTMENTS

#### 📄 `appointments`

**Propósito**: Sistema de citas médicas

##### 📊 Columnas

| **Columna**        | **Tipo**  | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ------------------ | --------- | ------------- | ------------------------------------- | --------- |
| `id`               | UUID      | ❌            | No description available              | -         |
| `patient_id`       | UUID      | ❌            | No description available              | -         |
| `doctor_id`        | UUID      | ❌            | No description available              | -         |
| `start_time`       | TIMESTAMP | ✅            | No description available              | -         |
| `end_time`         | TIMESTAMP | ❌            | No description available              | -         |
| `duration_minutes` | INTEGER   | ❌            | No description available              | -         |
| `type`             | TEXT      | ❌            | No description available              | -         |
| `status`           | TEXT      | ❌            | No description available              | -         |
| `notes`            | TEXT      | ❌            | No description available              | -         |
| `location`         | TEXT      | ❌            | No description available              | -         |
| `meeting_url`      | TEXT      | ❌            | No description available              | -         |
| `created_by`       | UUID      | ❌            | No description available              | -         |
| `created_at`       | TIMESTAMP | ❌            | Auditoría de creación de registro     | -         |
| `updated_at`       | TIMESTAMP | ❌            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_appointments_patient_id`** (btree) en patient_id - Optimize query performance
- **`idx_appointments_doctor_id`** (btree) en doctor_id - Optimize query performance
- **`idx_appointments_start_time`** (btree) en start_time - Optimize query performance
- **`idx_appointments_doctor_time`** (btree) en doctor_id,start_time - Optimize query performance
- **`idx_appointments_patient_time`** (btree) en patient_id,start_time - Optimize query performance
- **`idx_appointments_created_by`** (btree) en created_by - Optimize query performance
- **`idx_appointments_doctor_start`** (btree) en doctor_id,start_time - Optimize query performance
- **`idx_appointments_patient_start`** (btree) en patient_id,start_time - Optimize query performance
- **`idx_appointments_status_start`** (btree) en status,start_time - Optimize query performance

---

### CLINICAL_DATA

#### 📄 `medical_records`

**Propósito**: Historiales médicos de pacientes

##### 📊 Columnas

| **Columna**      | **Tipo**  | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ---------------- | --------- | ------------- | ------------------------------------- | --------- |
| `id`             | UUID      | ❌            | No description available              | -         |
| `patient_id`     | UUID      | ❌            | No description available              | -         |
| `doctor_id`      | UUID      | ❌            | No description available              | -         |
| `appointment_id` | UUID      | ❌            | No description available              | -         |
| `type`           | TEXT      | ✅            | No description available              | -         |
| `title`          | TEXT      | ✅            | No description available              | -         |
| `content`        | JSONB     | ✅            | No description available              | -         |
| `attachments`    | JSONB     | ❌            | No description available              | -         |
| `visibility`     | TEXT      | ❌            | No description available              | -         |
| `date_recorded`  | TIMESTAMP | ❌            | No description available              | -         |
| `created_at`     | TIMESTAMP | ❌            | Auditoría de creación de registro     | -         |
| `updated_at`     | TIMESTAMP | ❌            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_medical_records_patient_id`** (btree) en patient_id - Optimize query performance
- **`idx_medical_records_patient`** (btree) en patient_id,created_at - Optimize query performance
- **`idx_medical_records_deleted_at`** (btree) en deleted_at - Optimize query performance
- **`idx_medical_records_visibility`** (btree) en visibility - Optimize query performance
- **`idx_medical_records_doctor_id`** (btree) en doctor_id - Optimize query performance
- **`idx_medical_records_appointment_id`** (btree) en appointment_id - Optimize query performance

---

### UNKNOWN

#### 📄 `calls`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**   | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`          | UUID        | ❌            | No description available          | -         |
| `room_id`     | TEXT        | ✅            | No description available          | -         |
| `doctor_id`   | UUID        | ✅            | No description available          | -         |
| `patient_id`  | UUID        | ✅            | No description available          | -         |
| `status`      | call_status | ✅            | No description available          | -         |
| `created_at`  | TIMESTAMPTZ | ✅            | Auditoría de creación de registro | -         |
| `accepted_at` | TIMESTAMPTZ | ❌            | No description available          | -         |
| `ended_at`    | TIMESTAMPTZ | ❌            | No description available          | -         |
| `reason`      | TEXT        | ❌            | No description available          | -         |

---

### UNKNOWN

#### 📄 `call_events`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna** | **Tipo**    | **Requerida** | **Propósito Médico**     | **HIPAA** |
| ----------- | ----------- | ------------- | ------------------------ | --------- |
| `id`        | BIGSERIAL   | ❌            | No description available | -         |
| `call_id`   | UUID        | ✅            | No description available | -         |
| `at`        | TIMESTAMPTZ | ✅            | No description available | -         |
| `type`      | TEXT        | ✅            | No description available | -         |
| `payload`   | JSONB       | ❌            | No description available | -         |

---

### UNKNOWN

#### 📄 `profiles`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**  | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ------------ | ----------- | ------------- | ------------------------------------- | --------- |
| `user_id`    | uuid        | ❌            | No description available              | -         |
| `role`       | text        | ✅            | No description available              | -         |
| `created_at` | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at` | timestamptz | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_profiles_email`** (btree) en email - Optimize query performance
- **`idx_profiles_role`** (btree) en role - Optimize query performance
- **`profiles_user_id_idx`** (btree) en user_id - Optimize query performance
- **`idx_profiles_numeric_id`** (btree) en numeric_id - Optimize query performance
- **`idx_profiles_role`** (btree) en role - Optimize query performance
- **`idx_profiles_portal`** (btree) en portal - Optimize query performance
- **`idx_profiles_organization`** (btree) en organization_id - Optimize query performance
- **`idx_profiles_email`** (btree) en email - Optimize query performance

---

### UNKNOWN

#### 📄 `organizations`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**        | **Tipo**    | **Requerida** | **Propósito Médico**                     | **HIPAA** |
| ------------------ | ----------- | ------------- | ---------------------------------------- | --------- |
| `id`               | UUID        | ❌            | No description available                 | -         |
| `owner_profile_id` | UUID        | ✅            | No description available                 | -         |
| `slug`             | TEXT        | ✅            | No description available                 | -         |
| `name`             | TEXT        | ✅            | No description available                 | -         |
| `legal_name`       | TEXT        | ❌            | No description available                 | -         |
| `tax_id`           | TEXT        | ❌            | No description available                 | -         |
| `type`             | TEXT        | ❌            | No description available                 | -         |
| `industry`         | TEXT        | ❌            | No description available                 | -         |
| `size`             | TEXT        | ❌            | No description available                 | -         |
| `address`          | JSONB       | ❌            | Información demográfica para facturación | -         |
| `contact`          | JSONB       | ❌            | No description available                 | -         |
| `metadata`         | JSONB       | ✅            | No description available                 | -         |
| `is_active`        | BOOLEAN     | ✅            | No description available                 | -         |
| `created_at`       | TIMESTAMPTZ | ✅            | Auditoría de creación de registro        | -         |
| `updated_at`       | TIMESTAMPTZ | ✅            | Auditoría de modificación de registro    | -         |

##### 📈 Índices de Rendimiento

- **`idx_organizations_owner_profile_id`** (btree) en owner_profile_id - Optimize query performance

---

### UNKNOWN

#### 📄 `org_members`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**       | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `organization_id` | UUID        | ✅            | No description available              | -         |
| `profile_id`      | UUID        | ✅            | No description available              | -         |
| `role`            | TEXT        | ✅            | No description available              | -         |
| `status`          | TEXT        | ✅            | No description available              | -         |
| `invited_by`      | UUID        | ❌            | No description available              | -         |
| `metadata`        | JSONB       | ✅            | No description available              | -         |
| `created_at`      | TIMESTAMPTZ | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`      | TIMESTAMPTZ | ✅            | Auditoría de modificación de registro | -         |
| `PRIMARY`         | KEY         | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_org_members_invited_by`** (btree) en invited_by - Optimize query performance

---

### SYSTEM_ADMINISTRATION

#### 📄 `user_roles`

**Propósito**: Gestión de usuarios y autenticación

##### 📊 Columnas

| **Columna**       | **Tipo**    | **Requerida** | **Propósito Médico**     | **HIPAA** |
| ----------------- | ----------- | ------------- | ------------------------ | --------- |
| `id`              | UUID        | ❌            | No description available | -         |
| `profile_id`      | UUID        | ✅            | No description available | -         |
| `organization_id` | UUID        | ❌            | No description available | -         |
| `role`            | TEXT        | ✅            | No description available | -         |
| `granted_by`      | UUID        | ❌            | No description available | -         |
| `granted_at`      | TIMESTAMPTZ | ✅            | No description available | -         |
| `expires_at`      | TIMESTAMPTZ | ❌            | No description available | -         |
| `metadata`        | JSONB       | ✅            | No description available | -         |

##### 📈 Índices de Rendimiento

- **`user_roles_unique_global_role`** (btree) en profile_id,role - Optimize query performance
- **`user_roles_unique_org_role`** (btree) en profile_id,organization_id,role - Optimize query performance
- **`idx_user_roles_granted_by`** (btree) en granted_by - Optimize query performance

---

### PATIENT_MANAGEMENT

#### 📄 `patients`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**             | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ----------------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`                    | uuid        | ❌            | No description available          | -         |
| `user_id`               | uuid        | ✅            | No description available          | -         |
| `company_id`            | uuid        | ❌            | No description available          | -         |
| `medical_record_number` | text        | ❌            | No description available          | -         |
| `created_at`            | timestamptz | ❌            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_patients_user_id`** (btree) en user_id - Optimize query performance
- **`idx_patients_company_active`** (btree) en organization_id,active - Optimize query performance

---

### PROVIDER_MANAGEMENT

#### 📄 `doctors`

**Propósito**: Gestión de profesionales médicos

##### 📊 Columnas

| **Columna**      | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ---------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`             | uuid        | ❌            | No description available          | -         |
| `user_id`        | uuid        | ✅            | No description available          | -         |
| `license_number` | text        | ✅            | No description available          | -         |
| `speciality`     | text        | ❌            | No description available          | -         |
| `verified`       | boolean     | ❌            | No description available          | -         |
| `created_at`     | timestamptz | ❌            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_doctors_user_id`** (btree) en user_id - Optimize query performance
- **`idx_doctors_specialty_active`** (btree) en specialty,active - Optimize query performance

---

### UNKNOWN

#### 📄 `companies`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**    | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| -------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`           | uuid        | ❌            | No description available          | -         |
| `user_id`      | uuid        | ✅            | No description available          | -         |
| `tax_id`       | text        | ✅            | No description available          | -         |
| `company_name` | text        | ✅            | No description available          | -         |
| `created_at`   | timestamptz | ❌            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_companies_owner_profile_id`** (btree) en owner_profile_id - Optimize query performance

---

### PATIENT_MANAGEMENT

#### 📄 `doctor_patient`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**   | **Tipo**    | **Requerida** | **Propósito Médico**     | **HIPAA** |
| ------------- | ----------- | ------------- | ------------------------ | --------- |
| `doctor_id`   | uuid        | ❌            | No description available | -         |
| `patient_id`  | uuid        | ❌            | No description available | -         |
| `assigned_at` | timestamptz | ❌            | No description available | -         |
| `PRIMARY`     | KEY         | ❌            | No description available | -         |

---

### COMPLIANCE_AUDIT

#### 📄 `medical_audit_log`

**Propósito**: Auditoría y registro de actividades

##### 📊 Columnas

| **Columna**       | **Tipo**    | **Requerida** | **Propósito Médico**                     | **HIPAA** |
| ----------------- | ----------- | ------------- | ---------------------------------------- | --------- |
| `id`              | uuid        | ❌            | No description available                 | -         |
| `user_id`         | uuid        | ❌            | No description available                 | -         |
| `action_type`     | text        | ✅            | No description available                 | -         |
| `table_name`      | text        | ✅            | No description available                 | -         |
| `record_id`       | uuid        | ❌            | No description available                 | -         |
| `patient_user_id` | uuid        | ❌            | No description available                 | -         |
| `ip_address`      | inet        | ❌            | Información demográfica para facturación | -         |
| `user_agent`      | text        | ❌            | No description available                 | -         |
| `created_at`      | timestamptz | ❌            | Auditoría de creación de registro        | -         |

##### 📈 Índices de Rendimiento

- **`idx_audit_log_user_date`** (btree) en user_id,created_at - Optimize query performance
- **`idx_audit_log_patient_date`** (btree) en patient_user_id,created_at - Optimize query performance

---

### UNKNOWN

#### 📄 `profiles`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**       | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`              | uuid        | ❌            | No description available              | -         |
| `email`           | text        | ✅            | Comunicación con el paciente          | -         |
| `full_name`       | text        | ❌            | No description available              | -         |
| `role`            | text        | ❌            | No description available              | -         |
| `portal`          | text        | ❌            | No description available              | -         |
| `organization_id` | uuid        | ❌            | No description available              | -         |
| `metadata`        | jsonb       | ❌            | No description available              | -         |
| `created_at`      | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`      | timestamptz | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_profiles_email`** (btree) en email - Optimize query performance
- **`idx_profiles_role`** (btree) en role - Optimize query performance
- **`profiles_user_id_idx`** (btree) en user_id - Optimize query performance
- **`idx_profiles_numeric_id`** (btree) en numeric_id - Optimize query performance
- **`idx_profiles_role`** (btree) en role - Optimize query performance
- **`idx_profiles_portal`** (btree) en portal - Optimize query performance
- **`idx_profiles_organization`** (btree) en organization_id - Optimize query performance
- **`idx_profiles_email`** (btree) en email - Optimize query performance

---

### COMPLIANCE_AUDIT

#### 📄 `auth_audit`

**Propósito**: Auditoría y registro de actividades

##### 📊 Columnas

| **Columna**  | **Tipo**    | **Requerida** | **Propósito Médico**                     | **HIPAA** |
| ------------ | ----------- | ------------- | ---------------------------------------- | --------- |
| `id`         | bigserial   | ❌            | No description available                 | -         |
| `user_id`    | uuid        | ✅            | No description available                 | -         |
| `event`      | text        | ✅            | No description available                 | -         |
| `data`       | jsonb       | ❌            | No description available                 | -         |
| `ip_address` | inet        | ❌            | Información demográfica para facturación | -         |
| `user_agent` | text        | ❌            | No description available                 | -         |
| `created_at` | timestamptz | ❌            | Auditoría de creación de registro        | -         |

##### 📈 Índices de Rendimiento

- **`idx_auth_audit_user_id`** (btree) en user_id - Optimize query performance
- **`idx_auth_audit_event`** (btree) en event - Optimize query performance
- **`idx_auth_audit_created_at`** (btree) en created_at - Optimize query performance

---

### UNKNOWN

#### 📄 `preventive_screenings`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**                | **Tipo**      | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| -------------------------- | ------------- | ------------- | ------------------------------------- | --------- |
| `id`                       | UUID          | ❌            | No description available              | -         |
| `name`                     | TEXT          | ✅            | No description available              | -         |
| `category`                 | TEXT          | ✅            | No description available              | -         |
| `description`              | TEXT          | ✅            | No description available              | -         |
| `target_gender`            | TEXT          | ✅            | No description available              | -         |
| `min_age`                  | INTEGER       | ❌            | No description available              | -         |
| `max_age`                  | INTEGER       | ❌            | No description available              | -         |
| `recommended_frequency`    | TEXT          | ✅            | No description available              | -         |
| `is_mandatory`             | BOOLEAN       | ✅            | No description available              | -         |
| `estimated_cost_ars`       | NUMERIC(10,2) | ❌            | No description available              | -         |
| `covered_by_public_health` | BOOLEAN       | ✅            | No description available              | -         |
| `requires_specialist`      | BOOLEAN       | ✅            | No description available              | -         |
| `preparation_instructions` | TEXT          | ❌            | No description available              | -         |
| `created_at`               | TIMESTAMPTZ   | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`               | TIMESTAMPTZ   | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_preventive_screenings_category`** (btree) en category - Optimize query performance
- **`idx_preventive_screenings_gender`** (btree) en target_gender - Optimize query performance
- **`idx_preventive_screenings_mandatory`** (btree) en is_mandatory - Optimize query performance
- **`idx_preventive_screenings_age_range`** (btree) en min_age,max_age - Optimize query performance

---

### PATIENT_MANAGEMENT

#### 📄 `patient_screenings`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**          | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| -------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                 | UUID        | ❌            | No description available              | -         |
| `patient_id`         | UUID        | ✅            | No description available              | -         |
| `screening_id`       | UUID        | ✅            | No description available              | -         |
| `status`             | TEXT        | ✅            | No description available              | -         |
| `scheduled_date`     | TIMESTAMPTZ | ❌            | No description available              | -         |
| `completed_date`     | TIMESTAMPTZ | ❌            | No description available              | -         |
| `next_due_date`      | TIMESTAMPTZ | ❌            | No description available              | -         |
| `assigned_doctor_id` | UUID        | ❌            | No description available              | -         |
| `notes`              | TEXT        | ❌            | No description available              | -         |
| `result_summary`     | TEXT        | ❌            | No description available              | -         |
| `created_at`         | TIMESTAMPTZ | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`         | TIMESTAMPTZ | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_patient_screenings_patient`** (btree) en patient_id - Optimize query performance
- **`idx_patient_screenings_screening`** (btree) en screening_id - Optimize query performance
- **`idx_patient_screenings_status`** (btree) en status - Optimize query performance
- **`idx_patient_screenings_doctor`** (btree) en assigned_doctor_id - Optimize query performance
- **`idx_patient_screenings_next_due`** (btree) en next_due_date - Optimize query performance
- **`idx_patient_screenings_overdue`** (btree) en next_due_date - Optimize query performance

---

### UNKNOWN

#### 📄 `risk_factors`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**                  | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ---------------------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`                         | UUID        | ❌            | No description available          | -         |
| `name`                       | TEXT        | ✅            | No description available          | -         |
| `description`                | TEXT        | ✅            | No description available          | -         |
| `category`                   | TEXT        | ✅            | No description available          | -         |
| `increases_risk_for`         | TEXT[]      | ✅            | No description available          | -         |
| `recommended_age_adjustment` | INTEGER     | ✅            | No description available          | -         |
| `frequency_adjustment`       | TEXT        | ❌            | No description available          | -         |
| `created_at`                 | TIMESTAMPTZ | ✅            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_risk_factors_category`** (btree) en category - Optimize query performance

---

### PATIENT_MANAGEMENT

#### 📄 `patient_risk_factors`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**      | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ---------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`             | UUID        | ❌            | No description available          | -         |
| `patient_id`     | UUID        | ✅            | No description available          | -         |
| `risk_factor_id` | UUID        | ✅            | No description available          | -         |
| `severity`       | TEXT        | ✅            | No description available          | -         |
| `diagnosed_date` | TIMESTAMPTZ | ✅            | No description available          | -         |
| `notes`          | TEXT        | ❌            | No description available          | -         |
| `created_at`     | TIMESTAMPTZ | ✅            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_patient_risk_factors_patient`** (btree) en patient_id - Optimize query performance
- **`idx_patient_risk_factors_risk`** (btree) en risk_factor_id - Optimize query performance
- **`idx_patient_risk_factors_severity`** (btree) en severity - Optimize query performance

---

### UNKNOWN

#### 📄 `screening_reminder_notifications`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**            | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ---------------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`                   | UUID        | ❌            | No description available          | -         |
| `patient_screening_id` | UUID        | ✅            | No description available          | -         |
| `patient_id`           | UUID        | ✅            | No description available          | -         |
| `reminder_date`        | TIMESTAMPTZ | ✅            | No description available          | -         |
| `sent_at`              | TIMESTAMPTZ | ❌            | No description available          | -         |
| `message`              | TEXT        | ✅            | No description available          | -         |
| `notification_channel` | TEXT        | ✅            | No description available          | -         |
| `is_read`              | BOOLEAN     | ✅            | No description available          | -         |
| `created_at`           | TIMESTAMPTZ | ✅            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_reminders_patient_screening`** (btree) en patient_screening_id - Optimize query performance
- **`idx_reminders_patient`** (btree) en patient_id - Optimize query performance
- **`idx_reminders_pending`** (btree) en reminder_date - Optimize query performance
- **`idx_reminders_unread`** (btree) en patient_id,is_read - Optimize query performance

---

### UNKNOWN

#### 📄 `medical_cases`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**           | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| --------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                  | UUID        | ❌            | No description available              | -         |
| `title`               | TEXT        | ✅            | No description available              | -         |
| `category`            | TEXT        | ✅            | No description available              | -         |
| `description`         | TEXT        | ✅            | No description available              | -         |
| `target_gender`       | TEXT        | ✅            | No description available              | -         |
| `target_age_min`      | INTEGER     | ❌            | No description available              | -         |
| `target_age_max`      | INTEGER     | ❌            | No description available              | -         |
| `content_sections`    | JSONB       | ✅            | No description available              | -         |
| `related_screenings`  | UUID[]      | ❌            | No description available              | -         |
| `related_specialists` | TEXT[]      | ❌            | No description available              | -         |
| `is_published`        | BOOLEAN     | ✅            | No description available              | -         |
| `created_at`          | TIMESTAMPTZ | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`          | TIMESTAMPTZ | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_medical_cases_category`** (btree) en category - Optimize query performance
- **`idx_medical_cases_published`** (btree) en is_published - Optimize query performance
- **`idx_medical_cases_gender`** (btree) en target_gender - Optimize query performance
- **`idx_medical_cases_age_range`** (btree) en target_age_min,target_age_max - Optimize query performance

---

### UNKNOWN

#### 📄 `reproductive_health_specialists`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**                       | **Tipo**     | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| --------------------------------- | ------------ | ------------- | ------------------------------------- | --------- |
| `id`                              | UUID         | ❌            | No description available              | -         |
| `doctor_id`                       | UUID         | ✅            | No description available              | -         |
| `specialty`                       | TEXT         | ✅            | No description available              | -         |
| `is_certified_ive_ile`            | BOOLEAN      | ✅            | No description available              | -         |
| `availability_status`             | TEXT         | ✅            | No description available              | -         |
| `accepts_emergency_consultations` | BOOLEAN      | ✅            | No description available              | -         |
| `rating`                          | NUMERIC(3,2) | ✅            | No description available              | -         |
| `total_consultations`             | INTEGER      | ✅            | No description available              | -         |
| `years_of_experience`             | INTEGER      | ✅            | No description available              | -         |
| `languages`                       | TEXT[]       | ✅            | No description available              | -         |
| `bio`                             | TEXT         | ✅            | No description available              | -         |
| `created_at`                      | TIMESTAMPTZ  | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`                      | TIMESTAMPTZ  | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_rh_specialists_availability`** (btree) en availability_status - Optimize query performance
- **`idx_rh_specialists_certified`** (btree) en is_certified_ive_ile - Optimize query performance
- **`idx_rh_specialists_specialty`** (btree) en specialty - Optimize query performance
- **`idx_rh_specialists_rating`** (btree) en rating DESC - Optimize query performance

---

### APPOINTMENTS

#### 📄 `reproductive_health_appointments`

**Propósito**: Sistema de citas médicas

##### 📊 Columnas

| **Columna**             | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                    | UUID        | ❌            | No description available              | -         |
| `patient_id`            | UUID        | ✅            | No description available              | -         |
| `specialist_id`         | UUID        | ✅            | No description available              | -         |
| `consultation_type`     | TEXT        | ✅            | No description available              | -         |
| `modality`              | TEXT        | ✅            | No description available              | -         |
| `status`                | TEXT        | ✅            | No description available              | -         |
| `scheduled_at`          | TIMESTAMPTZ | ✅            | No description available              | -         |
| `duration_minutes`      | INTEGER     | ✅            | No description available              | -         |
| `meeting_url`           | TEXT        | ❌            | No description available              | -         |
| `notes_for_doctor`      | TEXT        | ❌            | No description available              | -         |
| `is_first_consultation` | BOOLEAN     | ✅            | No description available              | -         |
| `requires_interpreter`  | BOOLEAN     | ✅            | No description available              | -         |
| `preferred_language`    | TEXT        | ✅            | No description available              | -         |
| `created_at`            | TIMESTAMPTZ | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`            | TIMESTAMPTZ | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_rh_appointments_patient`** (btree) en patient_id - Optimize query performance
- **`idx_rh_appointments_specialist`** (btree) en specialist_id - Optimize query performance
- **`idx_rh_appointments_scheduled`** (btree) en scheduled_at - Optimize query performance
- **`idx_rh_appointments_status`** (btree) en status - Optimize query performance
- **`idx_rh_appointments_upcoming`** (btree) en scheduled_at - Optimize query performance

---

### UNKNOWN

#### 📄 `health_centers`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**                    | **Tipo**         | **Requerida** | **Propósito Médico**                     | **HIPAA** |
| ------------------------------ | ---------------- | ------------- | ---------------------------------------- | --------- |
| `id`                           | UUID             | ❌            | No description available                 | -         |
| `name`                         | TEXT             | ✅            | No description available                 | -         |
| `type`                         | TEXT             | ✅            | No description available                 | -         |
| `address`                      | JSONB            | ✅            | Información demográfica para facturación | -         |
| `coordinates`                  | GEOGRAPHY(POINT, | ✅            | No description available                 | -         |
| `phone`                        | TEXT             | ✅            | Contacto de emergencia y citas           | -         |
| `email`                        | TEXT             | ❌            | Comunicación con el paciente             | -         |
| `website_url`                  | TEXT             | ❌            | No description available                 | -         |
| `offers_ive_ile`               | BOOLEAN          | ✅            | No description available                 | -         |
| `offers_medication_method`     | BOOLEAN          | ✅            | Tratamiento farmacológico prescrito      | -         |
| `offers_surgical_method`       | BOOLEAN          | ✅            | No description available                 | -         |
| `offers_psychological_support` | BOOLEAN          | ✅            | No description available                 | -         |
| `requires_appointment`         | BOOLEAN          | ✅            | No description available                 | -         |
| `accepts_walk_ins`             | BOOLEAN          | ✅            | No description available                 | -         |
| `has_24h_service`              | BOOLEAN          | ✅            | No description available                 | -         |
| `operating_hours`              | JSONB            | ❌            | No description available                 | -         |
| `average_wait_time_days`       | INTEGER          | ✅            | No description available                 | -         |
| `accessibility_features`       | TEXT[]           | ❌            | No description available                 | -         |
| `created_at`                   | TIMESTAMPTZ      | ✅            | Auditoría de creación de registro        | -         |
| `updated_at`                   | TIMESTAMPTZ      | ✅            | Auditoría de modificación de registro    | -         |

##### 📈 Índices de Rendimiento

- **`idx_health_centers_type`** (btree) en type - Optimize query performance
- **`idx_health_centers_ive_ile`** (btree) en offers_ive_ile - Optimize query performance
- **`idx_health_centers_walk_ins`** (btree) en accepts_walk_ins - Optimize query performance

---

### UNKNOWN

#### 📄 `medical_chats`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**       | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`              | UUID        | ❌            | No description available              | -         |
| `patient_id`      | UUID        | ✅            | No description available              | -         |
| `specialist_id`   | UUID        | ✅            | No description available              | -         |
| `appointment_id`  | UUID        | ❌            | No description available              | -         |
| `status`          | TEXT        | ✅            | No description available              | -         |
| `subject`         | TEXT        | ✅            | No description available              | -         |
| `is_urgent`       | BOOLEAN     | ✅            | No description available              | -         |
| `last_message_at` | TIMESTAMPTZ | ✅            | No description available              | -         |
| `created_at`      | TIMESTAMPTZ | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`      | TIMESTAMPTZ | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_medical_chats_patient`** (btree) en patient_id - Optimize query performance
- **`idx_medical_chats_specialist`** (btree) en specialist_id - Optimize query performance
- **`idx_medical_chats_status`** (btree) en status - Optimize query performance
- **`idx_medical_chats_urgent`** (btree) en is_urgent - Optimize query performance
- **`idx_medical_chats_last_message`** (btree) en last_message_at DESC - Optimize query performance
- **`idx_medical_chats_appointment_id`** (btree) en appointment_id - Optimize query performance

---

### UNKNOWN

#### 📄 `medical_messages`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**      | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ---------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`             | UUID        | ❌            | No description available          | -         |
| `chat_id`        | UUID        | ✅            | No description available          | -         |
| `author_type`    | TEXT        | ✅            | No description available          | -         |
| `author_id`      | UUID        | ✅            | No description available          | -         |
| `content_type`   | TEXT        | ✅            | No description available          | -         |
| `content`        | TEXT        | ✅            | No description available          | -         |
| `attachment_url` | TEXT        | ❌            | No description available          | -         |
| `is_read`        | BOOLEAN     | ✅            | No description available          | -         |
| `read_at`        | TIMESTAMPTZ | ❌            | No description available          | -         |
| `created_at`     | TIMESTAMPTZ | ✅            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_medical_messages_chat`** (btree) en chat_id,created_at - Optimize query performance
- **`idx_medical_messages_unread`** (btree) en chat_id,is_read - Optimize query performance
- **`idx_medical_messages_author`** (btree) en author_id - Optimize query performance

---

### UNKNOWN

#### 📄 `telemedicine_sessions`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**        | **Tipo**  | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ------------------ | --------- | ------------- | ------------------------------------- | --------- |
| `id`               | UUID      | ❌            | No description available              | -         |
| `patient_id`       | UUID      | ✅            | No description available              | -         |
| `doctor_id`        | UUID      | ✅            | No description available              | -         |
| `status`           | TEXT      | ✅            | No description available              | -         |
| `scheduled_at`     | TIMESTAMP | ❌            | No description available              | -         |
| `started_at`       | TIMESTAMP | ❌            | No description available              | -         |
| `ended_at`         | TIMESTAMP | ❌            | No description available              | -         |
| `room_id`          | TEXT      | ❌            | No description available              | -         |
| `notes`            | TEXT      | ❌            | No description available              | -         |
| `recording_url`    | TEXT      | ❌            | No description available              | -         |
| `duration_seconds` | INTEGER   | ❌            | No description available              | -         |
| `created_at`       | TIMESTAMP | ❌            | Auditoría de creación de registro     | -         |
| `updated_at`       | TIMESTAMP | ❌            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_telemedicine_sessions_patient`** (btree) en patient_id - Optimize query performance
- **`idx_telemedicine_sessions_doctor`** (btree) en doctor_id - Optimize query performance
- **`idx_telemedicine_sessions_room`** (btree) en room_id - Optimize query performance
- **`idx_telemedicine_sessions_status`** (btree) en status - Optimize query performance
- **`idx_telemedicine_sessions_scheduled`** (btree) en scheduled_at - Optimize query performance
- **`idx_telemedicine_sessions_appointment`** (btree) en appointment_id - Optimize query performance
- **`idx_telemedicine_sessions_room_id`** (btree) en room_id - Optimize query performance
- **`idx_telemedicine_sessions_doctor`** (btree) en doctor_id - Optimize query performance
- **`idx_telemedicine_sessions_patient`** (btree) en patient_id - Optimize query performance
- **`idx_telemedicine_sessions_appointment`** (btree) en appointment_id - Optimize query performance
- **`idx_telemedicine_sessions_status`** (btree) en status - Optimize query performance
- **`idx_telemedicine_sessions_scheduled`** (btree) en scheduled_start - Optimize query performance
- **`idx_telemedicine_sessions_doctor_profile`** (btree) en doctor_profile_id - Optimize query performance
- **`idx_telemedicine_sessions_patient_profile`** (btree) en patient_profile_id - Optimize query performance

---

### UNKNOWN

#### 📄 `telemedicine_room_participants`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**       | **Tipo**     | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ----------------- | ------------ | ------------- | --------------------------------- | --------- |
| `id`              | UUID         | ❌            | No description available          | -         |
| `room_id`         | TEXT         | ✅            | No description available          | -         |
| `user_id`         | UUID         | ✅            | No description available          | -         |
| `role`            | TEXT         | ✅            | No description available          | -         |
| `joined_at`       | TIMESTAMP    | ❌            | No description available          | -         |
| `left_at`         | TIMESTAMP    | ❌            | No description available          | -         |
| `avg_bitrate`     | INTEGER      | ❌            | No description available          | -         |
| `avg_latency`     | INTEGER      | ❌            | No description available          | -         |
| `avg_packet_loss` | NUMERIC(5,2) | ❌            | No description available          | -         |
| `created_at`      | TIMESTAMP    | ❌            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_room_participants_room`** (btree) en room_id - Optimize query performance
- **`idx_room_participants_user`** (btree) en user_id - Optimize query performance

---

### UNKNOWN

#### 📄 `telemedicine_session_events`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**  | **Tipo**  | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ------------ | --------- | ------------- | --------------------------------- | --------- |
| `id`         | UUID      | ❌            | No description available          | -         |
| `session_id` | UUID      | ✅            | No description available          | -         |
| `event_type` | TEXT      | ✅            | No description available          | -         |
| `event_data` | JSONB     | ❌            | No description available          | -         |
| `created_at` | TIMESTAMP | ❌            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_session_events_session`** (btree) en session_id - Optimize query performance
- **`idx_session_events_type`** (btree) en event_type - Optimize query performance

---

### CLINICAL_DATA

#### 📄 `medical_record_authorizations`

**Propósito**: Historiales médicos de pacientes

##### 📊 Columnas

| **Columna**             | **Tipo**  | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ----------------------- | --------- | ------------- | --------------------------------- | --------- |
| `id`                    | UUID      | ❌            | No description available          | -         |
| `record_id`             | UUID      | ✅            | No description available          | -         |
| `authorized_user_id`    | UUID      | ✅            | No description available          | -         |
| `authorized_by_user_id` | UUID      | ✅            | No description available          | -         |
| `reason`                | TEXT      | ✅            | No description available          | -         |
| `valid_until`           | TIMESTAMP | ✅            | No description available          | -         |
| `created_at`            | TIMESTAMP | ❌            | Auditoría de creación de registro | -         |
| `revoked_at`            | TIMESTAMP | ❌            | No description available          | -         |

##### 📈 Índices de Rendimiento

- **`idx_medical_record_authorizations_record_user`** (btree) en record_id,authorized_user_id,valid_until - Optimize query performance
- **`idx_medical_record_authorizations_by_granter`** (btree) en authorized_by_user_id,created_at DESC - Optimize query performance
- **`idx_medical_record_authorizations_expired`** (btree) en valid_until - Optimize query performance

---

### UNKNOWN

#### 📄 `consultation_rooms`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**             | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                    | UUID        | ❌            | No description available              | -         |
| `consultation_id`       | TEXT        | ✅            | No description available              | -         |
| `room_name`             | TEXT        | ✅            | No description available              | -         |
| `room_sid`              | TEXT        | ❌            | No description available              | -         |
| `patient_id`            | UUID        | ✅            | No description available              | -         |
| `doctor_id`             | UUID        | ✅            | No description available              | -         |
| `status`                | TEXT        | ✅            | No description available              | -         |
| `max_participants`      | INTEGER     | ❌            | No description available              | -         |
| `empty_timeout_seconds` | INTEGER     | ❌            | No description available              | -         |
| `created_at`            | TIMESTAMPTZ | ✅            | Auditoría de creación de registro     | -         |
| `started_at`            | TIMESTAMPTZ | ❌            | No description available              | -         |
| `ended_at`              | TIMESTAMPTZ | ❌            | No description available              | -         |
| `updated_at`            | TIMESTAMPTZ | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_consultation_rooms_consultation`** (btree) en consultation_id - Optimize query performance
- **`idx_consultation_rooms_patient`** (btree) en patient_id - Optimize query performance
- **`idx_consultation_rooms_doctor`** (btree) en doctor_id - Optimize query performance
- **`idx_consultation_rooms_status`** (btree) en status - Optimize query performance
- **`idx_consultation_rooms_created`** (btree) en created_at DESC - Optimize query performance

---

### UNKNOWN

#### 📄 `consultation_recordings`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**             | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                    | UUID        | ❌            | No description available              | -         |
| `consultation_id`       | TEXT        | ✅            | No description available              | -         |
| `room_name`             | TEXT        | ✅            | No description available              | -         |
| `room_sid`              | TEXT        | ❌            | No description available              | -         |
| `egress_id`             | TEXT        | ✅            | No description available              | -         |
| `egress_status`         | TEXT        | ✅            | No description available              | -         |
| `file_path`             | TEXT        | ❌            | No description available              | -         |
| `file_url`              | TEXT        | ❌            | No description available              | -         |
| `file_size_bytes`       | BIGINT      | ❌            | No description available              | -         |
| `file_format`           | TEXT        | ❌            | No description available              | -         |
| `duration_seconds`      | INTEGER     | ❌            | No description available              | -         |
| `codec_video`           | TEXT        | ❌            | No description available              | -         |
| `codec_audio`           | TEXT        | ❌            | No description available              | -         |
| `resolution`            | TEXT        | ❌            | No description available              | -         |
| `bitrate_kbps`          | INTEGER     | ❌            | No description available              | -         |
| `recorded_by`           | UUID        | ❌            | No description available              | -         |
| `access_count`          | INTEGER     | ❌            | No description available              | -         |
| `last_accessed_at`      | TIMESTAMPTZ | ❌            | No description available              | -         |
| `last_accessed_by`      | UUID        | ❌            | No description available              | -         |
| `retention_days`        | INTEGER     | ❌            | No description available              | -         |
| `deletion_scheduled_at` | TIMESTAMPTZ | ❌            | No description available              | -         |
| `deleted_at`            | TIMESTAMPTZ | ❌            | No description available              | -         |
| `deletion_reason`       | TEXT        | ❌            | No description available              | -         |
| `started_at`            | TIMESTAMPTZ | ✅            | No description available              | -         |
| `ended_at`              | TIMESTAMPTZ | ❌            | No description available              | -         |
| `created_at`            | TIMESTAMPTZ | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`            | TIMESTAMPTZ | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`idx_recordings_consultation`** (btree) en consultation_id - Optimize query performance
- **`idx_recordings_egress`** (btree) en egress_id - Optimize query performance
- **`idx_recordings_status`** (btree) en egress_status - Optimize query performance
- **`idx_recordings_retention`** (btree) en deletion_scheduled_at - Optimize query performance
- **`idx_recordings_doctor`** (btree) en recorded_by - Optimize query performance

---

### COMPLIANCE_AUDIT

#### 📄 `recording_access_logs`

**Propósito**: Auditoría y registro de actividades

##### 📊 Columnas

| **Columna**       | **Tipo**    | **Requerida** | **Propósito Médico**                     | **HIPAA** |
| ----------------- | ----------- | ------------- | ---------------------------------------- | --------- |
| `id`              | UUID        | ❌            | No description available                 | -         |
| `recording_id`    | UUID        | ✅            | No description available                 | -         |
| `consultation_id` | TEXT        | ✅            | No description available                 | -         |
| `accessed_by`     | UUID        | ✅            | No description available                 | -         |
| `access_type`     | TEXT        | ✅            | No description available                 | -         |
| `ip_address`      | INET        | ❌            | Información demográfica para facturación | -         |
| `user_agent`      | TEXT        | ❌            | No description available                 | -         |
| `success`         | BOOLEAN     | ✅            | No description available                 | -         |
| `error_message`   | TEXT        | ❌            | No description available                 | -         |
| `accessed_at`     | TIMESTAMPTZ | ✅            | No description available                 | -         |

##### 📈 Índices de Rendimiento

- **`idx_access_logs_recording`** (btree) en recording_id - Optimize query performance
- **`idx_access_logs_user`** (btree) en accessed_by - Optimize query performance
- **`idx_access_logs_timestamp`** (btree) en accessed_at DESC - Optimize query performance
- **`idx_access_logs_consultation`** (btree) en consultation_id - Optimize query performance

---

### PATIENT_MANAGEMENT

#### 📄 `patient_care_team`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**         | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                | uuid        | ❌            | No description available              | -         |
| `doctor_id`         | uuid        | ✅            | No description available              | -         |
| `patient_id`        | uuid        | ✅            | No description available              | -         |
| `role`              | text        | ❌            | No description available              | -         |
| `active`            | boolean     | ✅            | No description available              | -         |
| `assigned_at`       | timestamptz | ✅            | No description available              | -         |
| `assigned_by`       | uuid        | ❌            | No description available              | -         |
| `notes`             | text        | ❌            | No description available              | -         |
| `created_at`        | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`        | timestamptz | ✅            | Auditoría de modificación de registro | -         |
| `UNIQUE(doctor_id,` | patient_id, | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_patient_care_team_lookup`** (btree) en doctor_id,patient_id,active - Optimize query performance
- **`idx_patient_care_team_lookup`** (btree) en doctor_id,patient_id,active - Optimize query performance
- **`idx_patient_care_team_patient`** (btree) en patient_id,active - Optimize query performance
- **`idx_patient_care_team_doctor`** (btree) en doctor_id,active - Optimize query performance
- **`idx_patient_care_team_dates`** (btree) en assigned_at,updated_at - Optimize query performance
- **`idx_patient_care_team_lookup`** (btree) en doctor_id,patient_id,active - Optimize query performance
- **`idx_patient_care_team_patient`** (btree) en patient_id,active - Optimize query performance
- **`idx_patient_care_team_doctor`** (btree) en doctor_id,active - Optimize query performance

---

### SYSTEM_ADMINISTRATION

#### 📄 `ai_user_patterns`

**Propósito**: Gestión de usuarios y autenticación

##### 📊 Columnas

| **Columna**  | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ------------ | ----------- | ------------- | --------------------------------- | --------- |
| `id`         | uuid        | ❌            | No description available          | -         |
| `user_id`    | uuid        | ✅            | No description available          | -         |
| `pattern`    | text        | ✅            | No description available          | -         |
| `intent`     | text        | ✅            | No description available          | -         |
| `active`     | boolean     | ✅            | No description available          | -         |
| `created_at` | timestamptz | ✅            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`ai_user_patterns_user_idx`** (btree) en user_id - Optimize query performance
- **`ai_user_patterns_active_idx`** (btree) en active - Optimize query performance

---

### SYSTEM_ADMINISTRATION

#### 📄 `ai_user_faq`

**Propósito**: Gestión de usuarios y autenticación

##### 📊 Columnas

| **Columna**  | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| ------------ | ----------- | ------------- | --------------------------------- | --------- |
| `id`         | uuid        | ❌            | No description available          | -         |
| `user_id`    | uuid        | ✅            | No description available          | -         |
| `question`   | text        | ✅            | No description available          | -         |
| `answer`     | text        | ✅            | No description available          | -         |
| `active`     | boolean     | ✅            | No description available          | -         |
| `created_at` | timestamptz | ✅            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`ai_user_faq_user_idx`** (btree) en user_id - Optimize query performance
- **`ai_user_faq_active_idx`** (btree) en active - Optimize query performance

---

### PATIENT_MANAGEMENT

#### 📄 `patient_ai_chats`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**     | **Tipo**    | **Requerida** | **Propósito Médico**              | **HIPAA** |
| --------------- | ----------- | ------------- | --------------------------------- | --------- |
| `id`            | uuid        | ❌            | No description available          | -         |
| `user_id`       | uuid        | ✅            | No description available          | -         |
| `message`       | text        | ✅            | No description available          | -         |
| `intent`        | text        | ✅            | No description available          | -         |
| `confidence`    | double      | ❌            | No description available          | -         |
| `used_pattern`  | boolean     | ✅            | No description available          | -         |
| `reply_preview` | text        | ❌            | No description available          | -         |
| `created_at`    | timestamptz | ✅            | Auditoría de creación de registro | -         |

##### 📈 Índices de Rendimiento

- **`patient_ai_chats_user_idx`** (btree) en user_id - Optimize query performance
- **`patient_ai_chats_created_idx`** (btree) en created_at DESC - Optimize query performance

---

### UNKNOWN

#### 📄 `anamnesis`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**             | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                    | uuid        | ❌            | No description available              | -         |
| `patient_id`            | uuid        | ✅            | No description available              | -         |
| `status`                | text        | ✅            | No description available              | -         |
| `completion_percentage` | integer     | ✅            | No description available              | -         |
| `sections_status`       | jsonb       | ✅            | No description available              | -         |
| `privacy_accepted`      | boolean     | ❌            | No description available              | -         |
| `terms_accepted`        | boolean     | ❌            | No description available              | -         |
| `locked`                | boolean     | ✅            | No description available              | -         |
| `created_at`            | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`            | timestamptz | ✅            | Auditoría de modificación de registro | -         |
| `completed_at`          | timestamptz | ❌            | No description available              | -         |
| `deleted_at`            | timestamptz | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`anamnesis_patient_unique`** (btree) en patient_id - Optimize query performance

---

### UNKNOWN

#### 📄 `anamnesis_sections`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**    | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| -------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`           | uuid        | ❌            | No description available              | -         |
| `anamnesis_id` | uuid        | ✅            | No description available              | -         |
| `section`      | text        | ✅            | No description available              | -         |
| `data`         | jsonb       | ✅            | No description available              | -         |
| `completed`    | boolean     | ✅            | No description available              | -         |
| `completed_at` | timestamptz | ❌            | No description available              | -         |
| `updated_at`   | timestamptz | ✅            | Auditoría de modificación de registro | -         |

##### 📈 Índices de Rendimiento

- **`anamnesis_sections_unique`** (btree) en anamnesis_id,section - Optimize query performance
- **`anamnesis_sections_section_idx`** (btree) en section - Optimize query performance

---

### UNKNOWN

#### 📄 `telemedicine_sessions`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**              | **Tipo**       | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ------------------------ | -------------- | ------------- | ------------------------------------- | --------- |
| `id`                     | uuid           | ❌            | No description available              | -         |
| `room_id`                | text           | ✅            | No description available              | -         |
| `session_code`           | text           | ❌            | No description available              | -         |
| `appointment_id`         | uuid           | ❌            | No description available              | -         |
| `doctor_id`              | uuid           | ✅            | No description available              | -         |
| `patient_id`             | uuid           | ✅            | No description available              | -         |
| `status`                 | text           | ✅            | No description available              | -         |
| `scheduled_start`        | timestamptz    | ❌            | No description available              | -         |
| `actual_start`           | timestamptz    | ❌            | No description available              | -         |
| `actual_end`             | timestamptz    | ❌            | No description available              | -         |
| `duration_seconds`       | integer        | ❌            | No description available              | -         |
| `connection_quality`     | text           | ❌            | No description available              | -         |
| `video_enabled`          | boolean        | ❌            | No description available              | -         |
| `audio_enabled`          | boolean        | ❌            | No description available              | -         |
| `screen_sharing_enabled` | boolean        | ❌            | No description available              | -         |
| `recording_enabled`      | boolean        | ❌            | No description available              | -         |
| `recording_url`          | text           | ❌            | No description available              | -         |
| `recording_consent`      | jsonb          | ❌            | No description available              | -         |
| `patient:`               | boolean}&#x27; | ❌            | No description available              | -         |
| `notes`                  | text           | ❌            | No description available              | -         |
| `summary`                | jsonb          | ❌            | No description available              | -         |
| `signaling_server_url`   | text           | ❌            | No description available              | -         |
| `ice_servers`            | jsonb          | ❌            | No description available              | -         |
| `created_at`             | timestamptz    | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`             | timestamptz    | ✅            | Auditoría de modificación de registro | -         |
| `created_by`             | uuid           | ❌            | No description available              | -         |
| `deleted_at`             | timestamptz    | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_telemedicine_sessions_patient`** (btree) en patient_id - Optimize query performance
- **`idx_telemedicine_sessions_doctor`** (btree) en doctor_id - Optimize query performance
- **`idx_telemedicine_sessions_room`** (btree) en room_id - Optimize query performance
- **`idx_telemedicine_sessions_status`** (btree) en status - Optimize query performance
- **`idx_telemedicine_sessions_scheduled`** (btree) en scheduled_at - Optimize query performance
- **`idx_telemedicine_sessions_appointment`** (btree) en appointment_id - Optimize query performance
- **`idx_telemedicine_sessions_room_id`** (btree) en room_id - Optimize query performance
- **`idx_telemedicine_sessions_doctor`** (btree) en doctor_id - Optimize query performance
- **`idx_telemedicine_sessions_patient`** (btree) en patient_id - Optimize query performance
- **`idx_telemedicine_sessions_appointment`** (btree) en appointment_id - Optimize query performance
- **`idx_telemedicine_sessions_status`** (btree) en status - Optimize query performance
- **`idx_telemedicine_sessions_scheduled`** (btree) en scheduled_start - Optimize query performance
- **`idx_telemedicine_sessions_doctor_profile`** (btree) en doctor_profile_id - Optimize query performance
- **`idx_telemedicine_sessions_patient_profile`** (btree) en patient_profile_id - Optimize query performance

---

### UNKNOWN

#### 📄 `vital_signs`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**                | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| -------------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                       | uuid        | ❌            | No description available              | -         |
| `patient_id`               | uuid        | ✅            | No description available              | -         |
| `recorded_by_id`           | uuid        | ❌            | No description available              | -         |
| `type`                     | text        | ✅            | No description available              | -         |
| `blood_pressure_systolic`  | smallint    | ❌            | No description available              | -         |
| `blood_pressure_diastolic` | smallint    | ❌            | No description available              | -         |
| `heart_rate`               | smallint    | ❌            | No description available              | -         |
| `temperature`              | numeric(4,  | ❌            | No description available              | -         |
| `oxygen_saturation`        | smallint    | ❌            | No description available              | -         |
| `respiratory_rate`         | smallint    | ❌            | No description available              | -         |
| `weight`                   | numeric(5,  | ❌            | No description available              | -         |
| `height`                   | smallint    | ❌            | No description available              | -         |
| `bmi`                      | numeric(5,  | ❌            | No description available              | -         |
| `pain_scale`               | smallint    | ❌            | No description available              | -         |
| `unit`                     | text        | ❌            | No description available              | -         |
| `notes`                    | text        | ❌            | No description available              | -         |
| `measurement_context`      | text        | ✅            | No description available              | -         |
| `measured_at`              | timestamptz | ✅            | No description available              | -         |
| `recorded_at`              | timestamptz | ✅            | No description available              | -         |
| `created_at`               | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`               | timestamptz | ✅            | Auditoría de modificación de registro | -         |
| `deleted_at`               | timestamptz | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_vital_signs_patient_recorded_at`** (btree) en patient_id,recorded_at DESC - Optimize query performance
- **`idx_vital_signs_type_recorded_at`** (btree) en type,recorded_at DESC - Optimize query performance
- **`idx_vital_signs_recorded_by`** (btree) en recorded_by_id - Optimize query performance

---

### PHARMACY

#### 📄 `medication_logs`

**Propósito**: Gestión de medicamentos y prescripciones

##### 📊 Columnas

| **Columna**       | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`              | uuid        | ❌            | No description available              | -         |
| `patient_id`      | uuid        | ✅            | No description available              | -         |
| `logged_by_id`    | uuid        | ❌            | No description available              | -         |
| `medication_name` | text        | ✅            | Tratamiento farmacológico prescrito   | -         |
| `dosage`          | text        | ✅            | No description available              | -         |
| `status`          | text        | ✅            | No description available              | -         |
| `notes`           | text        | ❌            | No description available              | -         |
| `source`          | text        | ✅            | No description available              | -         |
| `taken_at`        | timestamptz | ✅            | No description available              | -         |
| `created_at`      | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`      | timestamptz | ✅            | Auditoría de modificación de registro | -         |
| `deleted_at`      | timestamptz | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_medication_logs_patient_taken_at`** (btree) en patient_id,taken_at DESC - Optimize query performance
- **`idx_medication_logs_status_taken_at`** (btree) en status,taken_at DESC - Optimize query performance
- **`idx_medication_logs_logged_by`** (btree) en logged_by_id - Optimize query performance

---

### UNKNOWN

#### 📄 `symptom_reports`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**      | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ---------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`             | uuid        | ❌            | No description available              | -         |
| `patient_id`     | uuid        | ✅            | No description available              | -         |
| `reported_by_id` | uuid        | ❌            | No description available              | -         |
| `symptom_name`   | text        | ✅            | No description available              | -         |
| `severity`       | smallint    | ✅            | No description available              | -         |
| `description`    | text        | ❌            | No description available              | -         |
| `duration`       | text        | ❌            | No description available              | -         |
| `frequency`      | text        | ❌            | No description available              | -         |
| `triggers`       | text        | ❌            | No description available              | -         |
| `body_location`  | text        | ❌            | No description available              | -         |
| `is_urgent`      | boolean     | ✅            | No description available              | -         |
| `reported_at`    | timestamptz | ✅            | No description available              | -         |
| `created_at`     | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`     | timestamptz | ✅            | Auditoría de modificación de registro | -         |
| `deleted_at`     | timestamptz | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_symptom_reports_patient_reported_at`** (btree) en patient_id,reported_at DESC - Optimize query performance
- **`idx_symptom_reports_urgent`** (btree) en patient_id,is_urgent,reported_at DESC - Optimize query performance
- **`idx_symptom_reports_reported_by`** (btree) en reported_by_id - Optimize query performance

---

### LABORATORY

#### 📄 `lab_results`

**Propósito**: Tabla del sistema médico

##### 📊 Columnas

| **Columna**       | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| ----------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`              | uuid        | ❌            | No description available              | -         |
| `patient_id`      | uuid        | ✅            | No description available              | -         |
| `uploaded_by_id`  | uuid        | ❌            | No description available              | -         |
| `reviewed_by`     | uuid        | ❌            | No description available              | -         |
| `test_type`       | text        | ✅            | No description available              | -         |
| `test_date`       | date        | ✅            | No description available              | -         |
| `laboratory_name` | text        | ❌            | No description available              | -         |
| `file_url`        | text        | ❌            | No description available              | -         |
| `file_type`       | text        | ❌            | No description available              | -         |
| `notes`           | text        | ❌            | No description available              | -         |
| `status`          | text        | ✅            | No description available              | -         |
| `reviewed_at`     | timestamptz | ❌            | No description available              | -         |
| `created_at`      | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`      | timestamptz | ✅            | Auditoría de modificación de registro | -         |
| `deleted_at`      | timestamptz | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_lab_results_patient_test_date`** (btree) en patient_id,test_date DESC - Optimize query performance
- **`idx_lab_results_status_test_date`** (btree) en status,test_date DESC - Optimize query performance
- **`idx_lab_results_reviewed_by`** (btree) en reviewed_by - Optimize query performance
- **`idx_lab_results_uploaded_by`** (btree) en uploaded_by_id - Optimize query performance

---

### PATIENT_MANAGEMENT

#### 📄 `patient_alerts`

**Propósito**: Gestión de información de pacientes

##### 📊 Columnas

| **Columna**          | **Tipo**    | **Requerida** | **Propósito Médico**                  | **HIPAA** |
| -------------------- | ----------- | ------------- | ------------------------------------- | --------- |
| `id`                 | uuid        | ❌            | No description available              | -         |
| `patient_id`         | uuid        | ✅            | No description available              | -         |
| `source_table`       | text        | ✅            | No description available              | -         |
| `source_record_id`   | uuid        | ✅            | No description available              | -         |
| `severity`           | text        | ✅            | No description available              | -         |
| `title`              | text        | ✅            | No description available              | -         |
| `message`            | text        | ✅            | No description available              | -         |
| `status`             | text        | ✅            | No description available              | -         |
| `metadata`           | jsonb       | ✅            | No description available              | -         |
| `created_by_id`      | uuid        | ❌            | No description available              | -         |
| `acknowledged_by_id` | uuid        | ❌            | No description available              | -         |
| `acknowledged_at`    | timestamptz | ❌            | No description available              | -         |
| `resolved_at`        | timestamptz | ❌            | No description available              | -         |
| `created_at`         | timestamptz | ✅            | Auditoría de creación de registro     | -         |
| `updated_at`         | timestamptz | ✅            | Auditoría de modificación de registro | -         |
| `deleted_at`         | timestamptz | ❌            | No description available              | -         |

##### 📈 Índices de Rendimiento

- **`idx_patient_alerts_patient_status_created_at`** (btree) en patient_id,status,created_at DESC - Optimize query performance
- **`idx_patient_alerts_open_severity`** (btree) en severity,created_at DESC - Optimize query performance
- **`idx_patient_alerts_created_by`** (btree) en created_by_id - Optimize query performance
- **`idx_patient_alerts_acknowledged_by`** (btree) en acknowledged_by_id - Optimize query performance

---

### COMPLIANCE_AUDIT

#### 📄 `audit_logs`

**Propósito**: Auditoría y registro de actividades

##### 📊 Columnas

| **Columna**     | **Tipo**    | **Requerida** | **Propósito Médico**                     | **HIPAA** |
| --------------- | ----------- | ------------- | ---------------------------------------- | --------- |
| `id`            | uuid        | ❌            | No description available                 | -         |
| `user_id`       | uuid        | ❌            | No description available                 | -         |
| `action`        | text        | ✅            | No description available                 | -         |
| `resource_type` | text        | ✅            | No description available                 | -         |
| `resource_id`   | uuid        | ❌            | No description available                 | -         |
| `metadata`      | jsonb       | ❌            | No description available                 | -         |
| `ip_address`    | inet        | ❌            | Información demográfica para facturación | -         |
| `user_agent`    | text        | ❌            | No description available                 | -         |
| `created_at`    | timestamptz | ✅            | Auditoría de creación de registro        | -         |

##### 📈 Índices de Rendimiento

- **`idx_audit_logs_user_id`** (btree) en user_id - Optimize query performance
- **`idx_audit_logs_resource`** (btree) en resource_type,resource_id - Optimize query performance
- **`idx_audit_logs_created_at`** (btree) en created_at DESC - Optimize query performance
- **`idx_audit_logs_action`** (btree) en action - Optimize query performance

---

---

## ⚙️ Funciones y Procedimientos

### `handle_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; NOW()`

---

### `create_call()`

**Propósito**: Database function
**Tipo de Retorno**: `TABLE( id UUID, room_id TEXT, doctor_id UUID, patient_id UUID, status call_status, created_at TIMESTAMPTZ ) AS $$ DECLARE v_room_id TEXT`

---

### `update_call_status()`

**Propósito**: Database function
**Tipo de Retorno**: `BOOLEAN AS $$ DECLARE v_updated BOOLEAN :&#x3D; FALSE`

---

### `handle_new_user()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger as $$ begin insert into public.profiles (user_id, email, role) values ( new.id, new.email, coalesce( new.raw_app_meta_data-&gt;&gt;&#x27;role&#x27;, new.raw_user_meta_data-&gt;&gt;&#x27;role&#x27;, &#x27;patient&#x27; )::text )`

---

### `update_updated_at_column()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger as $$ begin new.updated_at &#x3D; now()`

---

### `update_updated_at_column()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; NOW()`

---

### `select_primary_role_for_profile()`

**Propósito**: Database function
**Tipo de Retorno**: `TEXT AS $$ DECLARE selected_role TEXT`

---

### `sync_profile_primary_role()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN IF TG_OP &#x3D; &#x27;DELETE&#x27; THEN UPDATE public.profiles SET role &#x3D; public.select_primary_role_for_profile(OLD.profile_id), updated_at &#x3D; NOW() WHERE user_id &#x3D; OLD.profile_id`

---

### `generate_external_id()`

**Propósito**: Database function
**Tipo de Retorno**: `text AS $$ BEGIN RETURN role_prefix || &#x27;_&#x27; || substr(encode(gen_random_bytes(6), &#x27;base64&#x27;), 1, 8)`

---

### `auto_generate_external_id()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger AS $$ BEGIN IF NEW.external_id IS NULL THEN NEW.external_id :&#x3D; generate_external_id( CASE NEW.role WHEN &#x27;patient&#x27; THEN &#x27;PAT&#x27; WHEN &#x27;doctor&#x27; THEN &#x27;DOC&#x27; WHEN &#x27;company&#x27; THEN &#x27;COM&#x27; WHEN &#x27;company_admin&#x27; THEN &#x27;ADM&#x27; WHEN &#x27;organization_admin&#x27; THEN &#x27;ORG&#x27; END )`

---

### `ensure_numeric_id()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF NEW.numeric_id IS NULL THEN NEW.numeric_id :&#x3D; nextval(&#x27;public.user_numeric_id_seq&#x27;)`

---

### `get_next_numeric_id()`

**Propósito**: Database function
**Tipo de Retorno**: `BIGINT LANGUAGE sql SECURITY DEFINER AS $$ SELECT last_value + 1 FROM public.user_numeric_id_seq`

---

### `format_user_id()`

**Propósito**: Database function
**Tipo de Retorno**: `TEXT LANGUAGE plpgsql IMMUTABLE AS $$ DECLARE v_prefix TEXT`

---

### `is_doctor()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean AS $$ BEGIN RETURN EXISTS ( SELECT 1 FROM public.profiles WHERE user_id &#x3D; auth.uid() AND role &#x3D; &#x27;doctor&#x27; AND active &#x3D; true )`

---

### `is_patient()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean AS $$ BEGIN RETURN EXISTS ( SELECT 1 FROM public.profiles WHERE user_id &#x3D; auth.uid() AND role &#x3D; &#x27;patient&#x27; AND active &#x3D; true )`

---

### `is_company_admin()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean AS $$ BEGIN RETURN EXISTS ( SELECT 1 FROM public.profiles WHERE user_id &#x3D; auth.uid() AND role IN (&#x27;company&#x27;, &#x27;company_admin&#x27;) AND active &#x3D; true )`

---

### `is_system_admin()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean AS $$ BEGIN RETURN EXISTS ( SELECT 1 FROM public.profiles WHERE user_id &#x3D; auth.uid() AND role IN (&#x27;admin&#x27;, &#x27;platform_admin&#x27;) AND active &#x3D; true )`

---

### `doctor_has_patient_access()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean AS $$ DECLARE doctor_id uuid`

---

### `user_belongs_to_company()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean AS $$ BEGIN RETURN EXISTS ( SELECT 1 FROM public.company_members cm JOIN public.profiles p ON p.user_id &#x3D; cm.profile_id WHERE cm.profile_id &#x3D; auth.uid() AND cm.organization_id &#x3D; target_organization_id AND cm.active &#x3D; true AND p.active &#x3D; true )`

---

### `log_medical_access()`

**Propósito**: Database function
**Tipo de Retorno**: `void AS $$ BEGIN INSERT INTO public.medical_audit_log ( user_id, action_type, table_name, record_id, patient_user_id, ip_address, created_at ) VALUES ( auth.uid(), p_action_type, p_table_name, p_record_id, p_patient_user_id, inet_client_addr(), now() )`

---

### `handle_new_user()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE default_role text :&#x3D; &#x27;patient&#x27;`

---

### `audit_profile_changes()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF NEW.role IS DISTINCT FROM OLD.role THEN INSERT INTO public.auth_audit(user_id, event, data) VALUES ( NEW.id, &#x27;role_changed&#x27;, jsonb_build_object( &#x27;from&#x27;, OLD.role, &#x27;to&#x27;, NEW.role, &#x27;portal&#x27;, NEW.portal ) )`

---

### `handle_user_deleted()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO public.auth_audit(user_id, event, data) VALUES ( OLD.id, &#x27;user_deleted&#x27;, jsonb_build_object( &#x27;email&#x27;, OLD.email, &#x27;deleted_at&#x27;, now(), &#x27;provider&#x27;, COALESCE(OLD.app_metadata-&gt;&gt;&#x27;provider&#x27;, &#x27;email&#x27;) ) )`

---

### `set_portal_and_role()`

**Propósito**: Database function
**Tipo de Retorno**: `json LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE result_data json`

---

### `get_current_profile()`

**Propósito**: Database function
**Tipo de Retorno**: `json LANGUAGE sql SECURITY DEFINER AS $$ SELECT json_build_object( &#x27;id&#x27;, p.id, &#x27;email&#x27;, p.email, &#x27;full_name&#x27;, p.full_name, &#x27;role&#x27;, p.role, &#x27;portal&#x27;, p.portal, &#x27;organization_id&#x27;, p.organization_id, &#x27;metadata&#x27;, p.metadata, &#x27;created_at&#x27;, p.created_at, &#x27;updated_at&#x27;, p.updated_at ) FROM public.profiles p WHERE p.id &#x3D; auth.uid()`

---

### `get_user_audit_log()`

**Propósito**: Database function
**Tipo de Retorno**: `TABLE( id bigint, event text, data jsonb, created_at timestamptz ) LANGUAGE sql SECURITY DEFINER AS $$ SELECT a.id, a.event, a.data, a.created_at FROM public.auth_audit a WHERE a.user_id &#x3D; COALESCE(p_user_id, auth.uid()) ORDER BY a.created_at DESC LIMIT p_limit`

---

### `set_user_role()`

**Propósito**: Database function
**Tipo de Retorno**: `void LANGUAGE plpgsql SECURITY DEFINER AS $$ DECLARE v_uid uuid`

---

### `handle_new_user()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO public.profiles (user_id, email, external_id) VALUES ( new.id, new.email, COALESCE(new.raw_user_meta_data-&gt;&gt;&#x27;external_id&#x27;, new.id::text) )`

---

### `update_preventive_care_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; NOW()`

---

### `get_recommended_screenings()`

**Propósito**: Database function
**Tipo de Retorno**: `TABLE ( screening_id UUID, screening_name TEXT, category TEXT, status TEXT, next_due_date TIMESTAMPTZ, urgency TEXT, reason TEXT ) AS $$ DECLARE patient_age INTEGER`

---

### `mark_overdue_screenings()`

**Propósito**: Database function
**Tipo de Retorno**: `INTEGER AS $$ DECLARE updated_count INTEGER`

---

### `update_rh_specialists_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; NOW()`

---

### `update_chat_last_message()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN UPDATE medical_chats SET last_message_at &#x3D; NEW.created_at, updated_at &#x3D; NOW() WHERE id &#x3D; NEW.chat_id`

---

### `find_nearby_health_centers()`

**Propósito**: Database function
**Tipo de Retorno**: `TABLE ( id UUID, name TEXT, type TEXT, address JSONB, phone TEXT, distance_km DOUBLE PRECISION, offers_medication_method BOOLEAN, offers_surgical_method BOOLEAN ) AS $$ BEGIN RETURN QUERY SELECT hc.id, hc.name, hc.type, hc.address, hc.phone, ROUND( ST_Distance( hc.coordinates::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography ) / 1000.0, 2 ) AS distance_km, hc.offers_medication_method, hc.offers_surgical_method FROM health_centers hc WHERE hc.offers_ive_ile &#x3D; true AND ST_DWithin( hc.coordinates::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography, radius_km * 1000 ) ORDER BY distance_km ASC LIMIT max_results`

---

### `update_updated_at_column()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; NOW()`

---

### `auto_revoke_expired_authorizations()`

**Propósito**: Database function
**Tipo de Retorno**: `void AS $$ BEGIN UPDATE public.medical_record_authorizations SET revoked_at &#x3D; NOW() WHERE revoked_at IS NULL AND valid_until &lt; NOW()`

---

### `log_authorization_changes()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN INSERT INTO public.audit_logs ( user_id, action, resource_type, resource_id, metadata, created_at ) VALUES ( auth.uid(), TG_OP, &#x27;medical_record_authorization&#x27;, COALESCE(NEW.id, OLD.id), jsonb_build_object( &#x27;record_id&#x27;, COALESCE(NEW.record_id, OLD.record_id), &#x27;authorized_user_id&#x27;, COALESCE(NEW.authorized_user_id, OLD.authorized_user_id), &#x27;authorized_by_user_id&#x27;, COALESCE(NEW.authorized_by_user_id, OLD.authorized_by_user_id), &#x27;reason&#x27;, COALESCE(NEW.reason, OLD.reason), &#x27;valid_until&#x27;, COALESCE(NEW.valid_until, OLD.valid_until), &#x27;revoked_at&#x27;, COALESCE(NEW.revoked_at, OLD.revoked_at), &#x27;operation_type&#x27;, TG_OP ), NOW() )`

---

### `grant_medical_record_authorization()`

**Propósito**: Database function
**Tipo de Retorno**: `UUID AS $$ DECLARE v_authorization_id UUID`

---

### `revoke_medical_record_authorization()`

**Propósito**: Database function
**Tipo de Retorno**: `BOOLEAN AS $$ DECLARE v_updated INTEGER`

---

### `update_medical_records_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; NOW()`

---

### `log_medical_record_access()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN INSERT INTO public.audit_logs ( user_id, action, resource_type, resource_id, metadata, created_at ) VALUES ( auth.uid(), TG_OP, &#x27;medical_record&#x27;, COALESCE(NEW.id, OLD.id), jsonb_build_object( &#x27;visibility&#x27;, COALESCE(NEW.visibility, OLD.visibility), &#x27;type&#x27;, COALESCE(NEW.type, OLD.type), &#x27;patient_id&#x27;, COALESCE(NEW.patient_id, OLD.patient_id) ), NOW() )`

---

### `update_consultation_rooms_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; now()`

---

### `update_consultation_recordings_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; now()`

---

### `log_recording_access()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN UPDATE consultation_recordings SET access_count &#x3D; access_count + 1, last_accessed_at &#x3D; now(), last_accessed_by &#x3D; auth.uid() WHERE id &#x3D; NEW.recording_id`

---

### `auto_delete_expired_recordings()`

**Propósito**: Database function
**Tipo de Retorno**: `void AS $$ BEGIN UPDATE consultation_recordings SET deleted_at &#x3D; now(), deletion_reason &#x3D; &#x27;Retention period expired&#x27; WHERE deletion_scheduled_at &lt; now() AND deleted_at IS NULL`

---

### `set_patient_care_team_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; NOW()`

---

### `add_to_care_team()`

**Propósito**: Database function
**Tipo de Retorno**: `uuid AS $$ DECLARE v_assignment_id uuid`

---

### `remove_from_care_team()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean AS $$ DECLARE v_updated_count integer`

---

### `is_in_care_team()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS ( SELECT 1 FROM public.patient_care_team pct WHERE pct.doctor_id &#x3D; p_doctor_id AND pct.patient_id &#x3D; p_patient_id AND pct.active &#x3D; true )`

---

### `log_medical_change()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public AS $$ DECLARE v_patient_user_id uuid`

---

### `trigger_set_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger AS $$ BEGIN NEW.updated_at &#x3D; now()`

---

### `update_telemedicine_sessions_timestamp()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN NEW.updated_at &#x3D; now()`

---

### `calculate_session_duration()`

**Propósito**: Database function
**Tipo de Retorno**: `TRIGGER AS $$ BEGIN IF NEW.status &#x3D; &#x27;completed&#x27; AND NEW.actual_start IS NOT NULL AND NEW.actual_end IS NOT NULL THEN NEW.duration_seconds &#x3D; EXTRACT(EPOCH FROM (NEW.actual_end - NEW.actual_start))::integer`

---

### `touch_clinical_observability_updated_at()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at &#x3D; now()`

---

### `current_patient_id()`

**Propósito**: Database function
**Tipo de Retorno**: `uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path &#x3D; public AS $$ SELECT p.id FROM public.patients p WHERE p.user_id &#x3D; auth.uid() AND p.deleted_at IS NULL LIMIT 1`

---

### `create_patient_alert()`

**Propósito**: Database function
**Tipo de Retorno**: `uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public AS $$ DECLARE v_alert_id uuid`

---

### `create_call()`

**Propósito**: Database function
**Tipo de Retorno**: `TABLE( id uuid, room_id text, doctor_id uuid, patient_id uuid, status public.call_status, created_at timestamptz ) LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public, extensions AS $function$ DECLARE v_room_id TEXT`

---

### `update_call_status()`

**Propósito**: Database function
**Tipo de Retorno**: `boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public, extensions AS $function$ DECLARE v_updated BOOLEAN :&#x3D; FALSE`

---

### `set_portal_and_role()`

**Propósito**: Database function
**Tipo de Retorno**: `json LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public AS $$ DECLARE result_data json`

---

### `fn_audit_sensitive_change()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public AS $$ DECLARE v_record_id uuid`

---

### `fn_cleanup_old_audit_logs()`

**Propósito**: Database function
**Tipo de Retorno**: `integer LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public AS $$ DECLARE deleted_count integer`

---

### `handle_new_user()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public AS $$ DECLARE identifier_column text`

---

### `handle_new_user()`

**Propósito**: Database function
**Tipo de Retorno**: `trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path &#x3D; public AS $$ DECLARE identifier_column text`

---

---

## 🔍 Validación del Esquema

✅ **No hay problemas de validación detectados**

---

## 🏗️ Información de Generación

| **Campo**               | **Valor**                  |
| ----------------------- | -------------------------- |
| **Generado Por**        | Database Glossary CLI v1.0 |
| **Modo**                | SQL_PARSING                |
| **Versión de Template** | 1.0                        |
| **Duración**            | 0ms                        |
| **Validación**          | ✅ Pasó                    |

---

## 📚 Referencias y Notas

### 🏥 Dominios Médicos Cubiertos

- **👤 PATIENT_MANAGEMENT**: Gestión de pacientes y demografía
- **🩺 CLINICAL_DATA**: Datos clínicos, diagnósticos, tratamientos
- **📅 APPOINTMENTS**: Sistema de citas y agenda médica
- **💰 BILLING_FINANCIAL**: Facturación y gestión financiera
- **👨‍⚕️ PROVIDER_MANAGEMENT**: Gestión de profesionales médicos
- **🏥 FACILITY_OPERATIONS**: Operaciones de instalaciones médicas
- **💻 TELEMEDICINE**: Consultas remotas y telemedicina
- **🔬 RESEARCH_ANALYTICS**: Investigación y análisis poblacional
- **⚙️ SYSTEM_ADMINISTRATION**: Administración del sistema
- **📋 COMPLIANCE_AUDIT**: Cumplimiento y auditoría
- **🚨 EMERGENCY_CARE**: Atención de emergencias
- **💊 PHARMACY**: Gestión farmacéutica
- **🧪 LABORATORY**: Laboratorio y resultados
- **📷 IMAGING**: Imagenología médica

### 🔒 Niveles de Sensibilidad HIPAA

- **PUBLIC**: Sin PHI - datos públicos
- **INTERNAL**: Uso interno - sin datos de pacientes
- **RESTRICTED**: Contiene PHI - acceso controlado
- **HIGHLY_SENSITIVE**: PHI altamente sensible - auditoría obligatoria
- **PSYCHIATRIC**: Salud mental - protección especial
- **GENETIC**: Información genética - protección federal
- **UNKNOWN**: Requiere revisión manual

### 📖 Convenciones de Nomenclatura

- **Tablas**: snake_case, singular para entidades, plural para relaciones
- **Columnas**: snake_case, descriptivo del contenido
- **Índices**: idx_tablename_columnname(s)
- **Constrains**: pk_tablename (primary key), fk_tablename_referenced (foreign key)
- **Funciones**: verbo_sustantivo, descriptivo de la acción

---

**🔐 Documento generado automáticamente - Cumplimiento HIPAA verificado**
**📅 Última actualización**: 2026-03-01T23:13:42.616Z
**🛠️ Sistema de Glosario de Base de Datos AutaMedica v1.0**
