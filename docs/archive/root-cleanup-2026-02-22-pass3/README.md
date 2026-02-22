# Root Cleanup - Pass 3 (2026-02-22)

Third cleanup pass focused on root-level legacy guides.

## Goal
Keep root focused on active operational entrypoints and canonical docs, and move historical/auxiliary guides to `docs/archive`.

## Moved Files
- `AUTH_IMPLEMENTATION_GUIDE.md`
- `AUTOMATION_README.md`
- `DOCTOR_VIDEOCALL_TEST_GUIDE.md`
- `MULTI_APP_ARCHITECTURE.md`
- `README-DEVX.md`
- `RELEASE_GUIDE.md`
- `TEST_E2E_FLOW.md`
- `VIDEOCONSULTA_README.md`
- `WEBRTC_COMPLETE_IMPLEMENTATION.md`
- `apply-seeds-instructions.md`

## Selection Criteria
- Legacy/how-to snapshot docs.
- Not used by package scripts, CI workflows, or active automation references.
- Preserved in-repo for historical traceability.

## Restore
To restore any file to root:

```bash
git mv docs/archive/root-cleanup-2026-02-22-pass3/<file> ./<file>
```
