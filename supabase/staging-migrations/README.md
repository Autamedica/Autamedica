# Staging-only database migrations

These SQL files were applied directly to the Autamedica staging project
(`qqevyncgnanpmvauehys`) during the November 11, 2026 security remediation.

They are intentionally outside `supabase/migrations/` so a normal production
`supabase db push` cannot replay staging-specific compatibility changes against
production. Apply them only to the staging project, in filename/version order,
after reviewing the target schema.

Production-safe changes applied to both environments remain in
`supabase/migrations/`.
