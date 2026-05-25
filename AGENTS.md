# AGENTS.md - AutaMedica Agent Entry Point

> Root operating guide for AI coding agents in this repo.

## Read Order

1. This file
2. `CLAUDE.md`
3. `docs/AGENTS.md`
4. `docs/AGENTS-2.md`
5. `docs/ARQUITECTURA.md` before changing cross-layer flows

## Immediate Rules

- Operate as an Integration Senior Engineer. Reuse and connect existing pieces before writing new code.
- Current phase: integration and E2E hardening. Do not add new features unless the user explicitly asks for them.
- Every change must close a full circuit: `trigger -> DB/RPC/API/hook/UI -> visible result`.
- No orphan code. If deleting the code breaks nothing, it should not exist.
- Use `pnpm` only.
- `apps/web` is the main app. If shared packages change, build them before app checks.
- In `apps/web`, use `import.meta.env.PUBLIC_*`. Never use `NEXT_PUBLIC_*` or `process.env`.
- No cross-app imports. Shared logic lives in `packages/*`.
- Email: all AutaMedica emails must use `apps/web/src/lib/email/autamedica-template.ts` or a direct extension of it. Preserve the brand GIF as table `background`, not `<img>`, and send canonically as `Eduardo Marques <contacto@autamedica.com>`.
- Email observability: Resend events are received at `/api/webhooks/resend` and stored in `growth_os.email_events`; do not bypass this for campaigns, reminders, welcome emails or newsletters.
- For DB-affecting bugs, validate both planes:
  - UI/client gating
  - DB enforcement
- For E2E work, use Patchright Streaming with the persistent profile at `/home/edu/.patchright-profile`.
- If a browser flow fails, the loop is `test -> fix -> retest`, with evidence.

## Quick Commands

| Command                               | Purpose                                      |
| ------------------------------------- | -------------------------------------------- |
| `pnpm build:packages:core`            | Build shared packages before app validation  |
| `pnpm --filter @autamedica/web dev`   | Run the Astro app locally                    |
| `pnpm --filter @autamedica/web check` | Astro type and integration checks            |
| `pnpm --filter @autamedica/web build` | Production build for the main app            |
| `pnpm lint`                           | Lint the monorepo                            |
| `pnpm typecheck`                      | TypeScript checks across the repo            |
| `pnpm test:unit`                      | Unit tests                                   |
| `pnpm db:sync`                        | Regenerate DB types and validate schema sync |

## Senior Git Standards & Traceability

- **Branching:** Use short-lived branches `<type>/<short-desc>`. Never push directly to `main`.
- **Atomic Commits:** Follow Conventional Commits. One logical change per commit.
- **Pull Requests:** Mandatory use of `pull_request_template.md`. Document Context, Solution, Two-Plane Validation, and Evidence.
- **Traceability:** Every emergency fix on `main` must be back-documented in a `CHANGELOG_EMERGENCY.md` or a traceability PR.
- **Pre-flight:** `pnpm lint`, `pnpm build`, and `pnpm test:unit` must pass before pushing.
- **Clean Working Tree:** NEVER perform a merge, pull, rebase, or manual deployment unless the working tree is completely clean (`git status` is clear). Stash or discard unwanted changes first.
- **Rebase vs Squash Merge Strategy:**
  - **Clean Branch Commits (No internal merges):** Perform a **Rebase merge** (or fast-forward).
  - **Branch with Internal Merges (e.g., `merge branch 'main' into...`):** MUST perform a **Squash merge** to prevent polluting the mainline history with internal merge nodes.
- **Standard Git Configurations:** Always configure and maintain:
  ```bash
  git config --global pull.rebase true
  git config --global rebase.autoStash true
  git config --global merge.ff only
  ```

## Repo Shape

```text
apps/
  web/
  signaling-server/
  clinical-ai-orchestrator/
  reminder-worker/
  mobile/
  android/
packages/
  @autamedica/
  auth/
  hooks/
  scheduling/
  session/
  shared/
  supabase-client/
  tailwind-config/
  telemedicine/
  types/
  typescript-config/
  ui/
supabase/
  functions/
  migrations/
```

## Source Of Truth

- `CLAUDE.md`: compact operational manual
- `docs/AGENTS.md`: extended engineering guide
- `docs/AGENTS-2.md`: advanced hardening rules
