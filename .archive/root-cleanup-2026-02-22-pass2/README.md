# Root Cleanup - Pass 2 (2026-02-22)

Second conservative cleanup pass for repository root (`/home/edu/Autamedica`).

## Goal
Reduce root-level noise by archiving snapshot-style docs and one-off PR/test reports,
without touching operational scripts, CI workflows, or runtime config.

## Moved Files
- `CLOUDFLARE_DEPLOYMENT.md`
- `INDEX.md`
- `PATIENTS_APP_E2E_TEST_RESULTS.md`
- `PATIENTS_APP_INSPECTION.md`
- `PATIENTS_CRITICAL_ERRORS.md`
- `PR_DESCRIPTION.md`
- `PR_TEMPLATE.md`
- `TEST_EXECUTION_RESULTS.md`
- `TEST_GITOPS_AUTOMATION.md`

## Why these files
- Point-in-time reports or drafts, not source-of-truth operational docs.
- Not referenced by package scripts or GitHub workflows.
- Keeping them archived preserves history and auditability.

## Restore
Move any file back to root if needed:

```bash
git mv .archive/root-cleanup-2026-02-22-pass2/<file> ./<file>
```
