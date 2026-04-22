-- PostgREST upsert needs a real unique constraint, not only a partial unique index.
-- Null provider_event_id values remain allowed multiple times by PostgreSQL unique semantics.

do $$
begin
  alter table growth_os.email_events
    add constraint email_events_provider_event_id_key unique (provider, provider_event_id);
exception
  when duplicate_object then null;
end $$;

