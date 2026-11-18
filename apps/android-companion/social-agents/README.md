# Autamedica Social Agents — LinkedIn Investors + WhatsApp Operations

Status: architecture baseline for implementation. This document is deliberately aligned with the existing Android Companion PR #807 and the existing B2C WhatsApp CRM controls.

## Product configuration

- LinkedIn objective: investor and strategic-partner discovery.
- WhatsApp objective: all approved operational workflows (community, patient support, commercial follow-up and internal operations).
- Operating mode: autonomous execution for read, classify, summarize, route, remind and other actions exposed by an authorized integration. Outbound communication and irreversible moderation are governed by the channel-specific policy below.

## Existing foundations verified in the repository

- Android Companion in PR #807 provides an Android AccessibilityService, authenticated loopback control API, WebView/CDP proxy, Playwright Core MCP, screenshot and UI-tree tools.
- LinkedIn connector currently exposes people search; this is useful for discovery but is not evidence of permission to automate invitations, messaging or scraping.
- WhatsApp B2C CRM migration `20261106040000_b2c_whatsapp_crm_ar.sql` stores contact/event metadata only. It explicitly excludes message text and clinical content; unverified consent does not authorize outreach.
- `/api/whatsapp/b2c-webhook` verifies Meta HMAC signatures and records event metadata. It is read-only: no message sending, no unknown-contact auto-creation and no message-body persistence.
- `/admin/b2c-whatsapp` requires admin authorization and enforces consent and do-not-contact controls.

These existing protections are part of the product contract and must not be bypassed by the new agents.

## Architecture

```text
Autamedica Social Agents
  ├── Orchestrator (durable jobs, retries, idempotency, audit)
  ├── Policy Engine (channel permissions, consent, rate limits, approvals)
  ├── LinkedIn Investor Agent
  │     ├── authorized people/profile discovery
  │     ├── investor qualification and scoring
  │     ├── CRM lead records and follow-up reminders
  │     └── human-approved connection/message handoff unless an official
  │         LinkedIn product/API explicitly authorizes the action
  ├── WhatsApp Operations Agent
  │     ├── Meta webhook ingestion and delivery/status events
  │     ├── supported Business Platform conversations
  │     ├── summaries, intent classification and routing
  │     ├── opt-out/consent enforcement
  │     └── group operations only where the official account/API is eligible
  └── Autamedica Companion (Android UI/accessibility/CDP fallback for
        owner-directed, permitted workflows; not a policy bypass)
```

## LinkedIn Investor Agent

### Autonomous capabilities
1. Search investors, funds, accelerators and strategic partners using authorized search capabilities.
2. Normalize profile facts and source URLs; record retrieval time and provenance.
3. Score fit using configurable criteria: healthcare/healthtech thesis, geography, stage, ticket range (when publicly stated), portfolio relevance and strategic value.
4. Deduplicate by canonical LinkedIn URL and organization.
5. Draft a concise, context-specific outreach message and log next follow-up date.
6. Produce a daily pipeline report: discovered, qualified, researched, awaiting approval, contacted (only when supported by an authorized channel), replied and closed.

### Guardrails
- No scraping, session-cookie extraction, browser-bot invitations, bulk connection requests or automated LinkedIn messaging that violates LinkedIn terms or API permissions.
- The current LinkedIn connector's people-search action does not imply write permissions.
- The agent can autonomously research, score, draft, deduplicate and remind. Sending a connection invitation or message remains a human handoff unless an approved official LinkedIn API/product explicitly grants that action.
- Store only business-relevant professional information and provenance; do not infer sensitive traits.

## WhatsApp Operations Agent

### Autonomous capabilities
1. Ingest verified Meta webhook events and delivery/read statuses.
2. Resolve known contacts; never silently create unknown CRM contacts.
3. Apply opt-out immediately and suppress future outbound work.
4. Classify supported inbound interactions by operational intent and route to the correct queue.
5. Generate ephemeral summaries from content only in an explicitly authorized processing path; persist summary metadata/minimized output only after the data policy is reviewed. Never persist clinical message bodies in the existing B2C CRM tables.
6. Create reminders, escalation tasks and operational metrics.
7. Moderate group messages only where the official API provides access and the connected account has the required group/admin capability. Unsupported groups must be reported as unsupported, not silently handled through unofficial WhatsApp Web automation.

### Existing CRM invariants
- `consent_status` defaults to `pending`; only verified consent with evidence can authorize B2C outreach.
- `withdrawn` and `do_not_contact` contacts remain blocked.
- Existing `b2c_whatsapp_events` records metadata, not message text.
- The current webhook is ingestion-only. Do not add send behavior to it.
- Do not mix clinical content into B2C marketing/CRM records.
- Any new message-sending integration must use the official Meta Business Platform, approved templates where required, explicit opt-in, idempotency keys and auditable delivery outcomes.

### Group moderation policy
- Detect/classify: spam, harassment, threats, scams, off-topic content and urgent operational issues.
- Auto-label and summarize when the API exposes the message and the group/account is eligible.
- Auto-delete only categories explicitly configured by the group owner/admin and only where the official API exposes a supported delete operation. Keep a metadata-only moderation audit (message/provider ID, category, rule, action, timestamp); do not retain message text in the existing CRM tables.
- Ambiguous cases are escalated to the administrator. Preserve emergency, clinical and patient-safety messages for human review; never delete them as off-topic.

## Shared execution model

Every job must have:
- `job_id`, `agent`, `channel`, `action`, `target_ref`, `created_at`, `started_at`, `completed_at`
- `status`: queued | running | succeeded | retryable_failure | terminal_failure | awaiting_approval
- `idempotency_key`, `attempt_count`, `last_error_code`
- `policy_decision` and a redacted audit record.

Retries must be bounded, exponential and idempotent. Secrets belong in server-side secret storage or Android Keystore; never in logs, source control, prompt text or client-visible JSON. Each connector must have explicit capability discovery and health checks.

## Implementation sequence

### Phase 0 — Companion stability gate
- Fix/verify the black screenshot and foreground-window transition on the Xiaomi.
- Verify the active package/window before and after every UI action.
- Keep screenshot, accessibility tree and CDP evidence separate.
- A browser DOM success must not be reported as native-app control success.

### Phase 1 — Shared agent core
- Define typed job/event contracts and policy decisions.
- Add durable queue, idempotency, bounded retries and metadata-only audit.
- Add admin visibility for agent status, failures and approval handoffs.

### Phase 2 — LinkedIn investor discovery
- Use the available authorized LinkedIn search integration.
- Add investor qualification, deduplication, CRM handoff, message drafts and reminders.
- Do not implement unauthorized invitation/message automation.

### Phase 3 — WhatsApp Business operations
- Complete Meta Embedded Signup/Coexistence or Cloud API onboarding as applicable.
- Configure webhook verification and subscriptions.
- Add authorized send/reply workflows as a separate service, with consent and opt-out enforcement.
- Validate actual group API eligibility and supported group operations before implementing moderation actions.

### Phase 4 — Verification
- Unit: scoring, deduplication, consent, opt-out, idempotency and policy decisions.
- Integration: signed Meta webhook fixtures, retries, status events and authorized API responses.
- E2E: staging accounts only; prove actual authenticated flows and outcomes.
- Android: prove the Companion itself opened the target app, read the expected UI tree and performed a benign interaction. Manual foregrounding is not evidence of automation.
- Report each capability as verified, failed or not available; never infer success from an open port or successful build.

## Acceptance criteria

- LinkedIn: investor discovery and qualification work end-to-end; CRM records include provenance; outreach drafts and reminders are durable; no unauthorized automated invitation or messaging.
- WhatsApp: verified webhook ingestion; opt-out suppression; supported authorized conversations; summaries and routing; auditable, idempotent sends only through approved Meta APIs; group moderation limited to documented capabilities and admin rules.
- Companion: foreground/package verification, screenshot and accessibility tree agree, UI actions return observable postconditions, and session recovery is tested.
- All agent actions are observable in an admin activity log with redacted sensitive values.
