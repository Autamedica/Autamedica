# Production audit containment — 2026-10-27
## Applied in production
Project qxjjrpksmwwrmubhvjew. Exact migration ledger IDs:
- 20261027023120: clinical conditions/symptoms service policies restricted; patient-owned read retained; anonymous table access and orphan-profile RPC revoked.
- 20261027023344: incidents, incident events and outbox backend-only. Inspected current web API/service and worker consumers use administrative clients; no patient records modified.
- 20261027023355: clinical evaluation transaction RPC restricted to service_role.
Effective privileges verified after each change. Independent review checked RLS and a synthetic unaffiliated authenticated identity: no rows visible in conditions/symptoms.
## Code changes requiring CI and release
- DebugNotificationReceiver class and manifest declaration moved to src/debug.
- Web deploy waits for successful requested DB job, accepts intentionally skipped DB job, and does not cancel an active deployment for a newer push.
- Snapshot all five canonical production deployments before publishing. Restore changed projects on deployment failure or smoke failure; continue remaining restorations if one fails.
## Verification limits
Local XML/YAML/shell syntax checked. Full local lint/build/unit preflight could not run: checkout is incomplete and pnpm dependency setup fails with ERR_PNPM_IGNORED_BUILDS. Git HTTPS has no local authentication; connector access works. Require remote CI and merged release-manifest inspection before Android release.
No real device/Play publication, patient positive-access E2E, FCM delivery, payment or Cloudflare rollback was claimed.
## Remaining blockers
Push PR #552 requires matching Edge PUSH_DISPATCH_SECRET and Vault autamedica_push_dispatch_secret plus autamedica_push_project_url. Vault contains no secrets at verification time; connected Supabase tools do not expose secret provisioning. Do not deploy only the sender authentication change and interrupt the SQL dispatch path.
BRL payments, authoritative roles and credential gates have existing integration PRs #550/#554; do not merge the whole historical batch because it includes duplicate migration versions. Review pending medical credentials by the authorized clinical operator. Community and TDAH are outside this change.
