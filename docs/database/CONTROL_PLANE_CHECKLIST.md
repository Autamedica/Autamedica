# Control Plane Checklist

Usar este checklist para cualquier cambio que toque:

- tablas nuevas
- policies
- roles
- grants
- funciones SQL
- Edge Functions con `service_role`
- flujos clínicos con acceso a datos sensibles

## Antes de implementar

1. Definir si el cambio pertenece a:
   - `Clinical Core`
   - `Platform Core`
   - `Adjacent Products`
2. Identificar quién puede leer.
3. Identificar quién puede crear.
4. Identificar quién puede actualizar.
5. Identificar quién puede borrar.
6. Identificar si existe acceso por:
   - ownership
   - relación clínica
   - pertenencia organizacional
   - backend administrativo

## Al diseñar tablas

1. La tabla tiene owner funcional definido.
2. La tabla tiene estrategia RLS definida antes del deploy.
3. La tabla tiene índices mínimos para FKs y lecturas críticas.
4. La tabla evita mezclar responsabilidades clínicas y accesorias.

## Al diseñar policies

1. No usar `USING (true)`.
2. No usar `WITH CHECK (true)`.
3. No usar `TO public` si la intención real es `service_role`.
4. Si usa `auth.*`, preferir `(select auth.*())`.
5. Revisar si ya existe una policy equivalente.
6. Consolidar políticas duplicadas por acción cuando sea posible.

## Al diseñar funciones SQL

1. Toda función propia en `public` debe fijar `search_path`.
2. Toda `SECURITY DEFINER` debe tener justificación explícita.
3. Validar contra schema real de producción, no solo contra memoria del equipo.

## Antes de cerrar el cambio

1. Verificar policies en `pg_policies`.
2. Verificar grants.
3. Verificar Advisor de seguridad.
4. Verificar que no aparezcan nuevos `multiple_permissive_policies`.
5. Verificar que el cambio quedó también en migración versionada.
