# CircleCI Free — opt-in clinical CI (no GitHub Actions)

## Scope and safety

This configuration is a **draft-only** migration until its release workflow has passed a real signed, internal-track QA run. The existing manually invoked CI jobs continue using synthetic credentials. The new tag-gated release workflow is separately defined and must receive restricted CircleCI contexts before it can build a signed AAB. It never publishes to the production Play track.

Three independent test-workflow booleans default to `false`. A normal GitHub branch push or PR event therefore runs **no test or release jobs**. Only a validated GitHub release-tag push can enter the separate internal-draft publishing workflow. This avoids repeating the historical thousands of CI runs. Remove/default-disable any all-push CircleCI
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

## Automatic internal-draft release from a Git tag (separate from manual test jobs)

**Status: staged code only. Not enabled for live release until the contexts and tag trigger exist.**
The `android_release_internal_draft` workflow runs only on Git tags matching
`android-vMAJOR.MINOR.PATCH`, never on every push to `main`. For example,
`android-v1.2.22` must refer to an already-merged `main` commit whose
`apps/android/app/build.gradle.kts` has `versionName = "1.2.22"`.
The tag must also be protected by GitHub rulesets. Do not create it until QA.

1. In CircleCI project settings, create a **GitHub App 'Tag pushes' trigger**
   for the existing config source (not a continuous full Android build on all pushes).
   The checkout source AND the config source MUST both resolve to `refs/tags/<tag>` on the exact same release commit. The job rejects the event if the configuration is fetched from `main`, another tag, an API-triggered run or a different repository.
2. Create **two restricted CircleCI contexts**. Restrict both to the AutaMedica
   project and a **single expression restriction**: `pipeline.git.repo_owner == "ecucondorSA" and pipeline.git.repo_name == "Autamedica" and pipeline.config.repository.name == "ecucondorSA/Autamedica" and pipeline.config.sha == pipeline.git.revision and pipeline.git.tag starts-with "android-v" and pipeline.trigger.type == "github_app" and pipeline.event.name == "push" and pipeline.config.ref starts-with "refs/tags/android-v" and not job.ssh.enabled`. Confirm the expression is accepted by CircleCI before adding any secrets. Do NOT use `pipeline.parameters.*` in a context restriction. The job independently checks the exact tag/version, repository, config ref, checkout SHA and main-branch ancestry.
   Do not store signing or service-account secrets in code, GitHub comments,
   project-wide environment variables or a screen recording.
3. Set `autamedica-android-signing` context variables, using the **original
   Google Play upload keystore** (NOT a newly generated key):
   `AUTAMEDICA_RELEASE_KEYSTORE_BASE64`,
   `AUTAMEDICA_RELEASE_STORE_PASSWORD`,
   `AUTAMEDICA_RELEASE_KEY_ALIAS`,
   `AUTAMEDICA_RELEASE_KEY_PASSWORD`,
   `AUTAMEDICA_SUPABASE_URL`,
   `AUTAMEDICA_SUPABASE_ANON_KEY`,
   `AUTAMEDICA_GOOGLE_WEB_CLIENT_ID`,
   `AUTAMEDICA_GOOGLE_SERVICES_JSON`,
   `AUTAMEDICA_UPLOAD_CERT_SHA256` (the SHA-256 fingerprint of the **upload** certificate in Google Play Console → App integrity, not the Google Play app-signing certificate; colons optional).
   Provide only real application configuration; the release job fails closed
   on missing required values instead of silently using placeholders. Before
   Gradle runs, the release script reads the upload certificate from the original
   keystore using `keytool` and refuses any SHA-256 mismatch with Google Play
   (without printing passwords or key bytes). The configuration repository
   must also equal the checkout repository, and its SHA must equal the release
   commit (not merely a similarly named tag). The original keystore is written temporarily inside the build container (never to git or artifacts). Signing PASSWORDS are read directly by Gradle from the CircleCI context environment and are NOT written to `local.properties`. Use single-line/minified JSON and base64 for the context values.
4. Set `autamedica-google-play-internal` context variable
   `AUTAMEDICA_GOOGLE_PLAY_SERVICE_ACCOUNT` to the Google Play Developer API
   service-account JSON; grant the account narrowly scoped internal-track
   release rights in Play Console, not administrative access.
5. Validate that the new `versionCode` has not previously been used on ANY
   Play testing/production track. Do not launch a new version while the
   previous production review is unresolved without understanding its impact.
6. After reviewed merge, sandbox clinical QA and sign-off, push **one
   protected tag** on the intended `main` commit. CircleCI will automatically:
   test Kotlin; check tag/main ancestry and version; generate a signed release
   AAB with production endpoints; verify the JAR signature; pass only the AAB
   through a short-lived workspace; and use pinned Fastlane to upload an
   **internal-track DRAFT**. The upload is NOT a production release and does
   not make the new version available to patients.
7. Verify Play Console → Internal testing → Releases / Publishing overview.
   Complete internal-device clinical QA, then explicitly approve any
   rollout to production in Play Console. No automatic production promotion
   exists in this workflow.

**Safeguards:** the offline `node --test .circleci/scripts/android-release-policy.test.mjs` guard runs in the manual `smoke` workflow. Missing credentials abort the release job; source tag must match the
Android versionName and be reachable from `main`; full signing keys and Google
service-account credentials are never written to repository or CircleCI
artifacts; only the signed AAB passes through a CircleCI workspace; matching
tag filters on both jobs prevent ordinary push builds. The existing
`run_smoke`, `run_web`, `run_android` manual jobs remain unchanged and
use synthetic values. Budget: each release tag runs one Android medium job
and one Ruby small job, using CircleCI Free credits (subject to account limits).
Review CircleCI workspace retention limits and Google Play API permissions.

References: CircleCI [GitHub tag triggers](https://circleci.com/docs/guides/orchestrate/github-trigger-event-options/),
[Android deployment](https://circleci.com/docs/guides/deploy/deploy-android-applications/),
[restricted contexts](https://circleci.com/docs/guides/security/contexts/),
and [Fastlane supply](https://docs.fastlane.tools/actions/supply/).
