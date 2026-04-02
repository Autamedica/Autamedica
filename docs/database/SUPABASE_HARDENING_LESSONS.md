# Supabase Hardening Lessons

Fecha: `2026-04-02`
Proyecto: `qxjjrpksmwwrmubhvjew`

## Objetivo

Este documento resume:

- lo que se pudo aprender del hardening hecho sobre producción
- qué errores llevaron a los hallazgos del Advisor
- qué se debe evitar en migraciones, policies y funciones
- cómo prevenir que estos problemas vuelvan a aparecer

## Qué se aprendió

1. Los problemas más peligrosos no estaban en el código frontend, sino en la capa de autorización de base de datos.
2. Tener `RLS` habilitado no alcanza; policies mal diseñadas o demasiado abiertas anulan la protección.
3. Muchas advertencias del Advisor venían de deuda repetida, no de bugs aislados.
4. `function_search_path_mutable` suele ser deuda silenciosa: no rompe la app hoy, pero deja superficie de riesgo innecesaria.
5. `multiple_permissive_policies` suele crecer por migraciones sucesivas que agregan reglas nuevas sin consolidar las viejas.
6. El uso directo de `auth.uid()`, `auth.role()` y `auth.jwt()` en muchas policies degrada performance cuando se evalúa por fila.
7. Los índices faltantes en foreign keys se pueden corregir de forma mecánica y conviene hacerlo temprano.
8. Los índices duplicados aparecen cuando se crean migraciones nuevas sin revisar si ya existe un índice equivalente.
9. No todo warning debe atacarse ciegamente:
   - `postgis` en `public`
   - `spatial_ref_sys`
   requieren criterio de plataforma y no un fix impulsivo
10. Parte del hardening real quedó bloqueado por el plan del proyecto, no por falta de SQL:
   - `Leaked Password Protection`
   - backups gestionados / PITR

## Qué se corrigió

### Seguridad

- se eliminaron policies abiertamente peligrosas
- se activó `RLS` en tablas públicas que estaban expuestas
- se restringieron policies con `USING (true)` y `WITH CHECK (true)`
- se fijó `search_path = public, extensions` en funciones propias de aplicación

### Performance

- se agregaron índices faltantes para foreign keys
- se eliminaron índices duplicados
- se reescribieron policies para usar `(select auth.uid())`, `(select auth.role())` y `(select auth.jwt())`
- se consolidaron policies duplicadas en tablas críticas

## Errores que llevaron al problema

### 1. Agregar policies nuevas sin retirar las viejas

Esto produjo:

- `multiple_permissive_policies`
- reglas superpuestas por rol y por acción
- mayor costo por consulta
- más dificultad para razonar acceso real

Ejemplo del patrón malo:

- una policy para paciente
- otra para doctor
- otra para admin
- otra heredada antigua

cuando en muchos casos correspondía una sola policy consolidada para la misma acción

### 2. Usar `TO public` cuando la intención era `service_role`

Esto contaminó tablas como `profiles` y generó superposición artificial entre policies normales y policies de backend.

Regla:

- si una policy es para backend administrativo, usar `TO service_role`
- no usar `TO public` para políticas pensadas solo para procesos del servidor

### 3. Confiar en que `RLS enabled` equivale a seguridad

No equivale.

Casos peligrosos:

- `USING (true)`
- `WITH CHECK (true)`
- policies sin restricción por ownership, relación clínica o rol

### 4. Crear funciones sin `search_path` explícito

Esto dejó warnings repetidos y superficie innecesaria en funciones de `public`.

Regla:

- toda función propia en `public`, en especial `SECURITY DEFINER`, debe fijar `search_path`

### 5. Escribir migraciones contra un esquema que ya no existe

Varios problemas vinieron de migraciones que asumían columnas antiguas como:

- `profiles.id`
- `profiles.portal`
- `company_members.organization_id`

cuando producción ya usaba otro schema real.

Regla:

- antes de tocar migraciones viejas o crear fixes, validar siempre el schema vivo

### 6. Crear índices sin revisar equivalencias

Esto produjo índices idénticos con distinto nombre.

Regla:

- antes de crear un índice, revisar si ya existe otro con la misma definición

### 7. Tratar todos los warnings como si fueran iguales

No lo son.

Hay cuatro clases distintas:

- riesgo real de exposición
- deuda de performance
- deuda de mantenibilidad
- warnings aceptables por extensión/plataforma

## Qué se debe evitar de ahora en adelante

### En funciones SQL

Evitar:

- funciones en `public` sin `SET search_path`
- `SECURITY DEFINER` sin justificación
- referencias a columnas o tablas históricas no presentes en producción

Hacer:

- `SET search_path = public, extensions`
- validar firmas y tablas reales antes de reemplazar una función

### En RLS

Evitar:

- `USING (true)`
- `WITH CHECK (true)`
- varias policies permissive para la misma tabla/rol/acción si se pueden consolidar
- policies de backend con `TO public`

Hacer:

- policies por intención de acceso, no por parche incremental
- consolidar por acción: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- separar claramente acceso de usuario final vs backend

### En migraciones

Evitar:

- crear fixes directos en producción sin dejar migración reproducible
- modificar migraciones históricas sin validar el estado remoto y el impacto
- asumir que `supabase db push` refleja siempre el estado real si hubo fallos previos

Hacer:

- dejar cada cambio aplicado también en `supabase/migrations`
- verificar `supabase_migrations.schema_migrations`
- validar con Advisor o API después de cada ola

### En índices

Evitar:

- crear índices por intuición
- conservar duplicados con distinta convención de nombre

Hacer:

- revisar `pg_indexes`
- cubrir foreign keys sin índice
- medir luego cuáles quedan como `unused_index`

## Formas concretas de evitar estos errores

### Checklist antes de tocar Supabase

1. Confirmar el schema real en producción.
2. Clasificar el warning:
   - seguridad real
   - performance
   - warning tolerable de extensión
3. Revisar si ya existe migración previa relacionada.
4. Revisar policies actuales de la tabla afectada.
5. Revisar índices actuales de la tabla afectada.
6. Aplicar cambio reproducible vía migración.
7. Verificar por API o Advisor, no solo por inspección visual.

### Checklist para nuevas funciones

1. `LANGUAGE plpgsql`
2. `SET search_path = public, extensions`
3. evitar nombres ambiguos de variables
4. validar columnas reales del schema
5. si es `SECURITY DEFINER`, justificarlo explícitamente

### Checklist para nuevas policies

1. definir intención exacta de acceso
2. decidir si aplica a:
   - `public`
   - `authenticated`
   - `service_role`
3. evitar duplicar una policy ya existente con otro nombre
4. si usa `auth.*`, preferir `(select auth.*())`
5. revisar si puede consolidarse con otra policy del mismo comando

### Checklist para índices

1. revisar si la FK ya está cubierta
2. revisar si existe un índice equivalente con otro nombre
3. crear el índice
4. volver a medir `duplicate_index` y `unused_index`

## Qué quedó pendiente después de esta ronda

### Seguridad

Quedaron pendientes por plataforma o extensión:

- `auth_leaked_password_protection`
- `extension_in_public` para `postgis`
- `rls_disabled_in_public` para `spatial_ref_sys`

### Performance

Quedaron pendientes:

- `multiple_permissive_policies`
- `unused_index`

El mayor remanente está en:

- `medical_records`
- `companies`
- `company_members`
- `doctors`
- `lab_results`
- `medication_logs`
- `patient_alerts`
- `symptom_reports`
- `vital_signs`

## Regla final

No volver a tratar Supabase como “schema + tablas”.

Hay que tratarlo como cuatro capas distintas:

1. schema real
2. policies reales
3. funciones reales
4. estado operativo real del proyecto y su plan

Si una corrección no contempla esas cuatro capas, el problema vuelve.
