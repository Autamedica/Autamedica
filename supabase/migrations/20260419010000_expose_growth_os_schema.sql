-- Exponer el schema growth_os en PostgREST para que los workflows n8n / workers puedan
-- leer y escribir via REST API usando Accept-Profile: growth_os.
--
-- Nota: esto es estandar en Supabase; el rol authenticator maneja la lista.

do $$
declare
  existing text;
begin
  select current_setting('pgrst.db_schemas', true) into existing;
  if existing is null or existing = '' then
    execute format('alter role authenticator set pgrst.db_schemas = %L', 'public, graphql_public, growth_os');
  elsif position('growth_os' in existing) = 0 then
    execute format('alter role authenticator set pgrst.db_schemas = %L', existing || ', growth_os');
  end if;
end $$;

-- Reload PostgREST config
notify pgrst, 'reload config';

-- Grants explícitos: el schema queda accesible solo para service_role.
-- Los clientes anon/authenticated deben usar RPCs públicas específicas si alguna se habilita.
revoke all on schema growth_os from anon, authenticated;
grant usage on schema growth_os to service_role;
grant all on all tables in schema growth_os to service_role;
grant all on all sequences in schema growth_os to service_role;
grant all on all functions in schema growth_os to service_role;
alter default privileges in schema growth_os grant all on tables to service_role;
alter default privileges in schema growth_os grant all on sequences to service_role;
alter default privileges in schema growth_os grant all on functions to service_role;
