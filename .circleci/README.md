# CircleCI Free — opt-in clinical CI (no GitHub Actions)

## Scope and safety

This is a **draft-only** migration. CircleCI is not yet an approved production gate.
The repository remains private. No production credentials, patient records,
signed medical documents, release signing keys, deploy or database writes are used.

Three independent pipeline booleans default to `false`. A normal GitHub push or
PR event therefore runs **no jobs**, avoiding an accidental repeat of the
historical thousands of CI runs. Remove/default-disable any all-push CircleCI
project-level trigger if one was created during onboarding. A CircleCI project
must be created/configured for this private GitHub repository before runs work.

## First verification: smoke only

1. Open https://app.circleci.com/ → **Projects** → `Autamedica` → **Pipelines**.
2. Select **Trigger Pipeline**.
3. Choose **config source** branch `ci/circleci-manual-gates-20261106`.
   With the GitHub App integration, choose the **checkout source** branch
   `ci/circleci-manual-gates-20261106` too.
4. Add one **boolean** parameter `run_smoke=true`; leave `run_web` and
   `run_android` **false**.
5. Confirm the single `smoke` job is scheduled, starts, reports steps, and
   exits **success**. Capture the pipeline URL and exact SHA for the PR review.
6. If CircleCI shows **No workflows for this pipeline**, check that you added
   the boolean parameter to the correct configuration branch.
7. After smoke is green, explicitly request `run_web=true` on the matching
   branch, then `run_android=true`. Each invocation costs Free plan credits;
   do not turn on all three for every push.

### What each switch proves

| Parameter | Job | Tests | Does **not** prove |
|---|---|---|---|
| `run_smoke` | `smoke` | Node 22 service worker privacy; mocked Memed config | Med prescriptions are legally issued |
| `run_web` | `web` | TypeScript Vitest for dispatch/BR-AR referral; QR tests **only if present on this branch** | QR provider signature, every other PR branch, production E2E |
| `run_android` | `android` | JDK 17 JVM unit tests + Android instrumentation **source compilation** | On-device instrumentation, signed release APK, Play Store readiness |

The Android job uses synthetic Firebase and Supabase placeholders. It neither
signs an APK nor sends clinical traffic. The web job uses locked `pnpm@9.15.2`
workspace dependencies; it does not call a live clinical provider.

**Important:** CI on this branch is not CI on other PR HEADs. Before merging
#715, #716, #712 or #709, get fresh green results for each exact candidate SHA
or create a reviewed integration branch based on `main` with the relevant PR
patches applied, and validate merge conflicts and isolated SQL/RLS tests.

## Costs and limitations

CircleCI Free currently includes 30,000 credits/month. Docker resources use
different credit rates; this is not 30,000 minutes for all classes. Confirm
billing and usage in CircleCI before adding extra triggers or machines. When
Free personal credits are exhausted, builds stop until credits refill.

**No SQL replay or Supabase migration gates are included in this first PR.**
Those require a disposable database, a reviewed Docker strategy and additional
credits; the existing GitHub Actions SQL tests have not been magically replaced.
**No Cloudflare deploy automation** is configured in this PoC.

If no CircleCI project/pipeline is visible after connecting GitHub, confirm
that this private repository was explicitly selected for the CircleCI GitHub
App and that a project and pipeline definition were created.

## Sources

- https://circleci.com/docs/guides/orchestrate/triggers-overview/
- https://circleci.com/docs/guides/orchestrate/pipeline-variables/
- https://circleci.com/docs/guides/plans-pricing/credits/
- https://circleci.com/developer/images/image/cimg/android
