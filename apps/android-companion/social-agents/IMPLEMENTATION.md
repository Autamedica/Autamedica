# Social Agents — Investor Workspace

## Delivered in this increment
- Owner-scoped investor CRM persistence: social_agent_investors.
- Durable job ledger with idempotency: social_agent_jobs.
- RLS ownership enforcement and constrained status/priority vocabularies.
- Provenance fields so each investor lead is traceable to its source.
- Invitation status is recorded only; this schema does not send invitations.

## Product workflow
1. Discover funds and decision-makers through authorized data providers.
2. Normalize and deduplicate by LinkedIn URL and organization.
3. Score healthcare thesis, geography, stage, ticket and portfolio relevance.
4. Persist leads and provenance in the owner-scoped CRM.
5. Export filtered CRM records to XLSX with stable columns.
6. Prepare personalized connection notes and open profiles for owner-directed handoff.
7. Update invitation status only after a confirmed user action or provider event.

## Job contract
Every asynchronous operation is represented in social_agent_jobs. The unique
(owner_profile_id, idempotency_key) constraint prevents duplicate submissions.
Retries preserve the same idempotency key. Redact metadata; never store session
cookies, access tokens, clinical content, or raw WhatsApp message bodies here.

## LinkedIn
The installed capability supports people search only. No browser automation,
cookie extraction, bulk invitations, or messaging is implemented. Discovery,
qualification, drafts and explicit handoff are supported. Write actions require
an official LinkedIn permission covering the exact action.

## WhatsApp
The existing B2C CRM remains authoritative for consent and do-not-contact.
Do not add sending to the read-only webhook. Outbound operations require Meta
Business Platform onboarding, approved templates where required, consent,
idempotency and auditable delivery outcomes.

## Remaining production work
- Apply migration to linked Supabase.
- Generate DB types and add repository/service/API/UI layers.
- Add XLSX export and authenticated browser tests.
- Verify Companion runtime on the target Android device.
- Complete Meta onboarding and LinkedIn official write-capability assessment.
