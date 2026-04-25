-- Growth OS schema
-- Aplicar: supabase db push  (o psql directo en staging primero)

create schema if not exists growth_os;

-- ──────────────────────────────────────────────────────────────
-- killswitch_state: apagar un canal sin redeploy
-- ──────────────────────────────────────────────────────────────
create table if not exists growth_os.killswitch_state (
  channel        text primary key check (channel in (
    'whatsapp_openclaw','whatsapp_business_api','email_resend','email_brevo',
    'linkedin','youtube','instagram','facebook','tiktok'
  )),
  enabled        boolean not null default true,
  reason         text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

insert into growth_os.killswitch_state (channel, enabled) values
  ('whatsapp_openclaw', true),
  ('whatsapp_business_api', false),
  ('email_resend', true),
  ('email_brevo', false),
  ('linkedin', true),
  ('youtube', true),
  ('instagram', true),
  ('facebook', true),
  ('tiktok', false)
on conflict (channel) do nothing;

-- ──────────────────────────────────────────────────────────────
-- content_pieces: output del swarm, input de los publishers
-- ──────────────────────────────────────────────────────────────
do $$
begin
  create type growth_os.content_status as enum (
    'draft','compliance_review','approved','scheduled','published','failed','killed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists growth_os.content_pieces (
  id                 uuid primary key default gen_random_uuid(),
  topic              text not null,
  source_ref         text,  -- release notes, blog post, internal trigger
  target_channels    text[] not null,
  variants           jsonb not null default '{}'::jsonb,  -- {linkedin: {...}, email: {...}, wa: {...}}
  status             growth_os.content_status not null default 'draft',
  compliance_flags   jsonb,
  compliance_review_by text,
  scheduled_at       timestamptz,
  published_at       timestamptz,
  human_approved_by  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_growth_content_pieces_status_scheduled
  on growth_os.content_pieces (status, scheduled_at);
create index if not exists idx_growth_content_pieces_target_channels
  on growth_os.content_pieces using gin (target_channels);

-- ──────────────────────────────────────────────────────────────
-- publish_log: auditoria inmutable de que se publico y donde
-- ──────────────────────────────────────────────────────────────
create table if not exists growth_os.publish_log (
  id                 bigserial primary key,
  content_piece_id   uuid references growth_os.content_pieces(id) on delete set null,
  channel            text not null,
  external_id        text,          -- post id / message id en el canal
  payload            jsonb,
  status             text not null check (status in ('success','error','rate_limited','killed')),
  error_message      text,
  published_at       timestamptz not null default now()
);

create index if not exists idx_growth_publish_log_channel_published
  on growth_os.publish_log (channel, published_at desc);
create index if not exists idx_growth_publish_log_content_piece
  on growth_os.publish_log (content_piece_id);

-- ──────────────────────────────────────────────────────────────
-- engagement_metrics: medicion por pieza + canal (48h, 7d, 30d)
-- ──────────────────────────────────────────────────────────────
create table if not exists growth_os.engagement_metrics (
  id                 bigserial primary key,
  publish_log_id     bigint references growth_os.publish_log(id) on delete cascade,
  channel            text not null,
  window_period      text not null check (window_period in ('48h','7d','30d')),
  impressions        bigint,
  reactions          bigint,
  comments           bigint,
  shares             bigint,
  clicks             bigint,
  replies            bigint,
  sentiment          float,
  raw                jsonb,
  sampled_at         timestamptz not null default now(),
  unique (publish_log_id, window_period)
);

-- ──────────────────────────────────────────────────────────────
-- compliance_reviews: auditoria para ANMAT / legal
-- ──────────────────────────────────────────────────────────────
create table if not exists growth_os.compliance_reviews (
  id                 bigserial primary key,
  content_piece_id   uuid references growth_os.content_pieces(id) on delete cascade,
  agent_verdict      text not null check (agent_verdict in ('pass','flag','block')),
  agent_rationale    text,
  matched_patterns   text[],
  human_verdict      text check (human_verdict in ('approve','reject','amend')),
  human_reviewer     text,
  human_notes        text,
  reviewed_at        timestamptz not null default now()
);

-- Regex patterns prohibidos (claims medicos no autorizados)
create table if not exists growth_os.medical_claims_patterns (
  id            serial primary key,
  pattern       text not null,      -- regex ilike / ~*
  severity      text not null check (severity in ('block','flag')),
  category      text,
  note          text,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_growth_claims_patterns_pattern
  on growth_os.medical_claims_patterns (pattern);

insert into growth_os.medical_claims_patterns (pattern, severity, category, note) values
  ('(?i)\b(cura|cure|curar)\b',                 'block', 'efficacy', 'Promesa de cura no permitida'),
  ('(?i)\b(garantiz[ao])\b',                    'block', 'guarantee', 'Garantia de resultado'),
  ('(?i)\b(100\s*%\s*efectiv)',                 'block', 'guarantee', 'Efectividad absoluta'),
  ('(?i)\b(reemplaza(?:\s+)al\s+m[ée]dico)\b',  'block', 'scope', 'No reemplaza atencion medica'),
  ('(?i)\b(sin\s+efectos\s+secundarios)\b',     'block', 'safety', 'Claim de seguridad absoluta'),
  ('(?i)\b(aprobad[oa]\s+por\s+anmat)\b',       'flag',  'regulatory', 'Verificar status real'),
  ('(?i)\b(tratamiento|terapia)\b',             'flag',  'scope', 'Revisar contexto'),
  ('(?i)\b(diagn[oó]stic)',                     'flag',  'scope', 'Revisar contexto')
on conflict (pattern) do nothing;

-- ──────────────────────────────────────────────────────────────
-- brand_voice_examples: RAG para writer agent
-- ──────────────────────────────────────────────────────────────
create extension if not exists vector;

create table if not exists growth_os.brand_voice_examples (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null,  -- linkedin, email, wa, reel_script
  language      text not null default 'es-AR',
  content       text not null,
  embedding     vector(1536),   -- OpenAI ada-002 o Claude embeddings (ajustar dim)
  performance_score float,       -- llenado por analyst agent
  tags          text[],
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_growth_brand_voice_seed_key
  on growth_os.brand_voice_examples (channel, language, md5(content));

create index if not exists idx_growth_brand_voice_embedding
  on growth_os.brand_voice_examples using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ──────────────────────────────────────────────────────────────
-- geo_citations: cuantas veces LLMs citan AutaMedica
-- ──────────────────────────────────────────────────────────────
create table if not exists growth_os.geo_citations (
  id            bigserial primary key,
  llm           text not null check (llm in ('claude','chatgpt','perplexity','gemini')),
  query         text not null,
  cited         boolean not null,
  position      int,
  response_excerpt text,
  sampled_at    timestamptz not null default now()
);

create index if not exists idx_growth_geo_citations_llm_sampled
  on growth_os.geo_citations (llm, sampled_at desc);

-- ──────────────────────────────────────────────────────────────
-- RLS — todo a service_role only (n8n usa service key)
-- ──────────────────────────────────────────────────────────────
alter table growth_os.killswitch_state         enable row level security;
alter table growth_os.content_pieces           enable row level security;
alter table growth_os.publish_log              enable row level security;
alter table growth_os.engagement_metrics       enable row level security;
alter table growth_os.compliance_reviews       enable row level security;
alter table growth_os.medical_claims_patterns  enable row level security;
alter table growth_os.brand_voice_examples     enable row level security;
alter table growth_os.geo_citations            enable row level security;

-- Sin policies = solo service_role puede acceder. Explicito:
drop policy if exists service_role_all on growth_os.killswitch_state;
create policy service_role_all on growth_os.killswitch_state
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all on growth_os.content_pieces;
create policy service_role_all on growth_os.content_pieces
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all on growth_os.publish_log;
create policy service_role_all on growth_os.publish_log
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all on growth_os.engagement_metrics;
create policy service_role_all on growth_os.engagement_metrics
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all on growth_os.compliance_reviews;
create policy service_role_all on growth_os.compliance_reviews
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all on growth_os.medical_claims_patterns;
create policy service_role_all on growth_os.medical_claims_patterns
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all on growth_os.brand_voice_examples;
create policy service_role_all on growth_os.brand_voice_examples
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all on growth_os.geo_citations;
create policy service_role_all on growth_os.geo_citations
  for all to service_role using (true) with check (true);

-- Helper: check killswitch rapido desde cualquier adapter
create or replace function growth_os.is_channel_enabled(ch text)
returns boolean language sql stable as $$
  select coalesce((select enabled from growth_os.killswitch_state where channel = ch), false);
$$;
