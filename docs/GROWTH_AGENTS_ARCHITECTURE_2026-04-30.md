# Growth Agents Architecture

Owner: AutaMedica Growth/Platform
Date: 2026-04-30
Status: first slice implemented
Scope: patient acquisition, safety review, waiting-room recovery, and data-integrity sync

## Decision

Build one durable `growth-agents` worker instead of four independent apps.

The worker must not subscribe only to the in-process `domainEvents` bus. That bus is useful inside
`apps/web`, but it is not a durable trigger plane for Supabase-originated work. The production
contract should be:

```text
Supabase trigger or cron
  -> growth_os.agent_jobs
  -> growth-agents worker
  -> AI reasoning
  -> compliance gate
  -> outbound adapter
  -> growth_os.agent_runs / provider event tables
  -> visible admin/reporting result
```

This keeps every agent auditable, retryable, kill-switchable, and observable.

## Existing Pieces To Reuse

- `apps/reminder-worker`: long-running worker pattern, OpenClaw configuration, dry-run mode, and
  appointment reminder processing.
- `apps/clinical-ai-orchestrator`: staged pipeline model with `REASON`, `VALIDATE`, and `DELIVER`
  phases.
- `growth_os.killswitch_state`: existing channel kill switches for `whatsapp_openclaw`,
  `whatsapp_business_api`, `email_resend`, and social channels.
- `growth_os.medical_claims_patterns`: existing safety rules for blocked medical claims.
- `growth_os.leads` and `growth_os.growth_events`: first-party acquisition and funnel event source.
- `growth_os.email_jobs` and `growth_os.email_events`: existing precedent for queued outbound work
  plus provider observability.
- `packages/shared/src/events`: in-process domain events for app side effects. Use them to enqueue
  durable jobs from web use cases when needed; do not rely on them as the worker's only trigger.

## Database Contract

Add a migration for service-role-only agent queues:

```sql
create table if not exists growth_os.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in (
    'concierge',
    'compliance_auditor',
    'waiting_room_guardian',
    'data_integrity_sync'
  )),
  trigger_type text not null,
  source_table text,
  source_id text,
  lead_id uuid references growth_os.leads(id) on delete set null,
  appointment_id uuid,
  channel text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in (
    'pending',
    'reasoning',
    'blocked',
    'ready',
    'sent',
    'failed',
    'cancelled'
  )),
  scheduled_for timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_jobs_due
  on growth_os.agent_jobs (status, scheduled_for, created_at);

create table if not exists growth_os.agent_runs (
  id bigserial primary key,
  job_id uuid not null references growth_os.agent_jobs(id) on delete cascade,
  stage text not null check (stage in ('reason', 'validate', 'deliver', 'report')),
  model_name text,
  prompt_version text,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  compliance_result jsonb not null default '{}'::jsonb,
  provider_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

RLS must stay service-role-only, matching the existing `growth_os` worker tables.

## Agent Circuits

### 1. Concierge

Trigger:

- Insert/update on `growth_os.leads`.
- Optional cron that finds leads with incomplete anamnesis, completed anamnesis without booking, or
  booked without payment.

Reasoning:

- Read `vertical`, `intent`, consent, phone availability, funnel state, and recent `growth_events`.
- Produce one next-best action, not a generic campaign blast.

Action:

- Prefer WhatsApp only when phone and consent are valid.
- Fallback to `growth_os.email_jobs` if email is the permitted channel.
- Log the selected reasoning and message variant in `agent_runs`.

Visible result:

- Lead status/event changes in `growth_os.growth_events`.
- Admin growth dashboard can show pending/sent/blocked agent outcomes.

### 2. Compliance Auditor

Trigger:

- Before any growth agent sends a patient-facing message.
- Later: outbound chat/WhatsApp events from clinical/session messaging.

Reasoning:

- First pass: deterministic regex from `growth_os.medical_claims_patterns`.
- Second pass: AI classification only for ambiguous text.

Action:

- If severity is `block`, mark `agent_jobs.status = 'blocked'` and do not send.
- Store matched patterns and AI explanation in `agent_runs.compliance_result`.
- Create an admin alert only after the block is persisted.

Visible result:

- Blocked messages are reviewable with exact source job, text, matched rule, and model decision.

### 3. Waiting-Room Guardian

Trigger:

- Appointment status becomes `patient_waiting`.
- Cron every minute selects waiting appointments older than five minutes that have not been handled.

Reasoning:

- Verify call/appointment is still active, patient is still waiting, and doctor has not joined.
- Decide whether to message patient, notify doctor, or suppress because the state already changed.

Action:

- Patient: wait-status WhatsApp/email notification.
- Doctor: portal notification first; WhatsApp only if enabled for doctor operations.

Visible result:

- Appointment timeline or `growth_events` records `waiting_room_guardian.notified`.

### 4. Data Integrity Sync

Trigger:

- Cron hourly.

Reasoning:

- Compare `public.profiles`, `growth_os.leads`, and the configured email audience state.
- Compute missing leads, stale statuses, consent conflicts, and audience gaps.

Action:

- Apply idempotent syncs when the source of truth is clear.
- Report ambiguous conflicts without mutation.

Visible result:

- `agent_runs` stores counts and samples.
- Admin/report channel receives: synced count, skipped count, conflicts, and next action.

## Worker Shape

Create `apps/growth-agents` only if the implementation grows beyond `apps/reminder-worker`.
For the first slice, adding a `growth-agent-worker` entrypoint under `apps/reminder-worker` is lower
risk because it reuses existing OpenClaw environment handling and dry-run behavior.

Required modules:

- `agent-job.repository.ts`: claim due jobs with `for update skip locked` semantics through RPC.
- `reasoners/*.ts`: one reasoner per agent type, returning a structured decision.
- `compliance.ts`: deterministic claims scan plus optional AI review.
- `outbound/*.ts`: OpenClaw, WhatsApp Business API, email job, and admin notification adapters.
- `reporting.ts`: persist `agent_runs` and final job status.

## First Implementation Slice

Implement the Concierge first, but keep the compliance gate in the same slice.

Implemented files:

- `supabase/migrations/20260430120000_growth_agents_jobs.sql`
- `supabase/migrations/20260430123000_growth_agent_capabilities.sql`
- `apps/reminder-worker/src/growth-agent-worker.ts`
- `apps/reminder-worker/package.json`

The second slice adds deny-by-default capabilities:

- `dry_run_outbound` is enabled for Concierge on `whatsapp_openclaw` and `email_resend`.
- `write_growth_events` is enabled for Concierge.
- `send_whatsapp` and `enqueue_email` are created disabled until production sends are explicitly
  approved.
- Every delivery-stage `agent_runs` row records the capability authorization used or the reason it
  was denied.

Minimum production circuit:

```text
growth_os.leads insert/update
  -> enqueue concierge agent_job
  -> worker claims job
  -> reasoner builds one message
  -> compliance gate blocks unsafe language
  -> dry-run or OpenClaw delivery
  -> agent_runs + growth_events record outcome
  -> admin dashboard/report can see result
```

Do not start with the data-integrity sync as a mutating agent. Make it report-only first.

## Safety Requirements

- `killswitch_state` must be checked immediately before delivery.
- `consent_marketing` and unsubscribe state must be checked immediately before delivery.
- No agent may send clinical diagnosis, guaranteed outcomes, or prescription promises.
- All messages need idempotency keys so retries cannot double-send.
- All provider sends need a dry-run mode.
- Every blocked message must be persisted before any alert is sent.
- WhatsApp Business API templates should be used for official production outbound. OpenClaw can
  remain a controlled internal/low-cost channel while `whatsapp_openclaw` is explicitly enabled.

## Validation Plan

1. SQL migration idempotency check against a local or linked Supabase project.
2. Unit tests for each reasoner with consent, missing phone, completed anamnesis, booked, and paid
   states.
3. Unit tests for compliance regex matches from `medical_claims_patterns`.
4. Worker dry-run test with one synthetic lead and one blocked message.
5. Dashboard/API read test that proves agent outcomes are visible to admins.
6. One end-to-end Patchright/browser evidence run only after the admin visibility path exists.

## Open Questions

- Which channel is approved for first production send: `whatsapp_business_api`,
  `whatsapp_openclaw`, or email fallback only?
- Which table is the canonical anamnesis progress source for growth leads in this repo version?
- Should admin alerts land in portal notifications, Telegram/Slack, or email first?
- Should `growth_os.leads.phone` be treated as WhatsApp-valid by default, or should a separate
  verification field be required before outbound messaging?
