# Supabase Schema & Policies

Este directorio contiene el esquema de base de datos y las políticas RLS (Row Level Security) para el proyecto AltaMedica.

## Estructura

- `migrations/` - Migraciones de base de datos SQL
- `seed.sql` - Datos iniciales para desarrollo
- `README.md` - Este archivo

## Exportar esquema actual

Para exportar el esquema desde la instancia de producción:

```bash
# Exportar esquema completo
supabase db dump --project-ref knywotiidsydsaveqkjs --schema public > supabase/migrations/$(date +%Y%m%d%H%M%S)_initial_schema.sql

# O usando URL directa
pg_dump "postgresql://postgres:R00tP@ssw0rd!@db.knywotiidsydsaveqkjs.supabase.co:5432/postgres" \
  --schema=public \
  --no-owner \
  --no-privileges \
  > supabase/migrations/$(date +%Y%m%d%H%M%S)_production_schema.sql
```

## Aplicar migraciones

```bash
# Aplicar a instancia local
supabase db reset

# Aplicar a instancia remota (producción)
supabase db push --project-ref knywotiidsydsaveqkjs
```

## Políticas RLS

Las políticas de Row Level Security deben estar versionadas aquí para mantener sincronización entre el código y la base de datos.

## Sincronización

Cuando se modifiquen políticas en el dashboard de Supabase, asegúrate de:

1. Exportar los cambios usando `supabase db dump`
2. Commitear los archivos actualizados en este directorio
3. Documentar los cambios en este README
