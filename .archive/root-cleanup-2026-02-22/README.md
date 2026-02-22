# Root Cleanup Archive - 2026-02-22

This folder contains files moved out of the repository root during a conservative cleanup pass.

## Why these files were archived

- One-off operational reports (`*_REPORT.md`, `*_STATUS.md`, `RESUMEN_*`, etc.).
- Incident/fix snapshots that are historical but not runtime-critical.
- Temporary migration helpers and ad-hoc SQL/scripts used during emergency sessions.
- Generated audit logs that should not live in the repository root.

## What was intentionally NOT moved

- Runtime and repository essentials (`README.md`, `package.json`, lockfiles, config files, AGENTS docs, security/contributing docs).
- Current architecture/product docs still used as canonical references.

## Restore command (if needed)

```bash
cd /home/edu/Autamedica
# example: restore one file back to root
git mv .archive/root-cleanup-2026-02-22/STATUS.md ./STATUS.md
```

## Notes

- This archive is intentionally versioned so history is preserved.
- Additional cleanup rounds should prefer moving historical material into `docs/` or `.archive/` instead of deleting directly.
