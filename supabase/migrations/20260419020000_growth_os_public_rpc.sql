-- Growth OS · RPC wrappers en public schema
-- PostgREST en Supabase Cloud solo expone 'public' y 'graphql_public' por default.
-- En lugar de pelear la config, creamos funciones publicas que delegan a growth_os.

-- ──────────────────────────────────────────────────────────────
-- READ: is_channel_enabled (duplica la que vive en growth_os)
-- ──────────────────────────────────────────────────────────────
create or replace function public.is_channel_enabled(ch text)
returns boolean
language sql
stable
security definer
set search_path = growth_os, public
as $$
  select coalesce((select enabled from growth_os.killswitch_state where channel = ch), false);
$$;

revoke all on function public.is_channel_enabled(text) from public, anon, authenticated;
grant execute on function public.is_channel_enabled(text) to service_role;

-- ──────────────────────────────────────────────────────────────
-- WRITE: log_publish → inserta en growth_os.publish_log
-- ──────────────────────────────────────────────────────────────
create or replace function public.log_publish(
  p_content_piece_id uuid,
  p_channel           text,
  p_external_id       text default null,
  p_payload           jsonb default '{}'::jsonb,
  p_status            text default 'success',
  p_error_message     text default null
)
returns bigint
language sql
security definer
set search_path = growth_os, public
as $$
  insert into growth_os.publish_log
    (content_piece_id, channel, external_id, payload, status, error_message)
  values
    (p_content_piece_id, p_channel, p_external_id, p_payload, p_status, p_error_message)
  returning id;
$$;

revoke all on function public.log_publish(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.log_publish(uuid, text, text, jsonb, text, text) to service_role;

-- ──────────────────────────────────────────────────────────────
-- WRITE: insert_geo_citation
-- ──────────────────────────────────────────────────────────────
create or replace function public.insert_geo_citation(
  p_llm              text,
  p_query            text,
  p_cited            boolean,
  p_response_excerpt text default null
)
returns bigint
language sql
security definer
set search_path = growth_os, public
as $$
  insert into growth_os.geo_citations (llm, query, cited, response_excerpt)
  values (p_llm, p_query, p_cited, p_response_excerpt)
  returning id;
$$;

revoke all on function public.insert_geo_citation(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.insert_geo_citation(text, text, boolean, text) to service_role;

-- ──────────────────────────────────────────────────────────────
-- WRITE: upsert_content_piece (swarm publisher lo llama)
-- ──────────────────────────────────────────────────────────────
create or replace function public.create_content_piece(
  p_topic           text,
  p_source_ref      text,
  p_target_channels text[],
  p_variants        jsonb,
  p_status          text default 'draft'
)
returns uuid
language sql
security definer
set search_path = growth_os, public
as $$
  insert into growth_os.content_pieces
    (topic, source_ref, target_channels, variants, status)
  values
    (p_topic, p_source_ref, p_target_channels, p_variants, p_status::growth_os.content_status)
  returning id;
$$;

revoke all on function public.create_content_piece(text, text, text[], jsonb, text) from public, anon, authenticated;
grant execute on function public.create_content_piece(text, text, text[], jsonb, text) to service_role;

-- ──────────────────────────────────────────────────────────────
-- READ: get_content_pieces_due (publisher poll)
-- ──────────────────────────────────────────────────────────────
create or replace function public.get_content_pieces_due()
returns table (
  id              uuid,
  topic           text,
  target_channels text[],
  variants        jsonb,
  status          text
)
language sql
stable
security definer
set search_path = growth_os, public
as $$
  select id, topic, target_channels, variants, status::text
    from growth_os.content_pieces
   where status in ('approved','scheduled')
     and (scheduled_at is null or scheduled_at <= now())
   order by created_at
   limit 100;
$$;

revoke all on function public.get_content_pieces_due() from public, anon, authenticated;
grant execute on function public.get_content_pieces_due() to service_role;

-- ──────────────────────────────────────────────────────────────
-- SET: update_content_piece_status
-- ──────────────────────────────────────────────────────────────
create or replace function public.set_content_piece_status(
  p_id      uuid,
  p_status  text
)
returns void
language sql
security definer
set search_path = growth_os, public
as $$
  update growth_os.content_pieces
     set status = p_status::growth_os.content_status,
         updated_at = now(),
         published_at = case when p_status = 'published' then now() else published_at end
   where id = p_id;
$$;

revoke all on function public.set_content_piece_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_content_piece_status(uuid, text) to service_role;

-- Refresh PostgREST schema cache
notify pgrst, 'reload schema';
