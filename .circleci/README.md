# CircleCI Free — opt-in clinical CI (no GitHub Actions)

## Scope and safety

This configuration is a **draft-only** migration until its release workflow has passed a real signed, internal-track QA run. The existing manually invoked CI jobs continue using synthetic credentials. The new tag-gated release workflow is separately defined and must receive restricted CircleCI contexts before it can build a signed AAB. It never publishes to the production Play track.

Three independent test-workflow booleans default to `false`. A normal GitHub branch push or PR event therefore runs **no test or release jobs**. Only a validated GitHub release-tag push can enter the separate internal-draft publishing workflow. This avoids repeating the historical thousands of CI runs. Remove/default-disable any all-push CircleCI
project-level trigger if one was created during onboarding. A CircleCI project
must be created/configured for this private GitHub repository before runs work.

## First verification: smoke only

1. Open https://app.circleci.com/ → **Projects** → `Autamedica` → **Pipelines**.
2. Select **Trigger Pipeline**.
3. Choose **config source** branch `main` at the current reviewed commit.
   With the GitHub App integration, choose **checkout source** branch `main` too.
   Record the exact SHA and verify that config and checkout reference the same commit.
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

## Checkout / `no SSH key` incident (7 Nov 2026)

**Observed live, no speculation about Android/Kotlin:** CircleCI
[Pipeline #37](https://app.circleci.com/pipelines/github/ecucondorSA/Autamedica/37)
on the historical CI branch at SHA `95569328defc9e55ffc34507217f18545694673a`
ran `smoke_manual` successfully. This is historical evidence, **not** a passing smoke
result for current `main` or other PR heads. A later attempt to trigger `android_manual`
was rejected **before creating any job** with
`We did not run this pipeline because the project has no SSH key.`
The UI audit showed an existing OAuth-style **All pushes** trigger and no
GitHub App **Tag pushes** trigger. The two protected signing contexts are
not present at the organization level. This is a **pipeline authorization**
blocker, not proof of a Kotlin test failure or a deficient AAB.

**Preferred free route: configure a GitHub App pipeline (HTTPS checkout).**
For a project in a legacy GitHub OAuth org:

1. Open CircleCI [Project Settings → Project Setup](https://app.circleci.com/settings/project/github/ecucondorSA/Autamedica/setup).
   Identify the existing OAuth pipeline (gray badge) and its current
   `All pushes` trigger. Do not select the OAuth pipeline when manually
   testing the Android GitHub App config.
2. An org administrator can open **Organization Settings → VCS Connections**
   and **Install GitHub App** if not already installed. Grant access to the
   existing private `ecucondorSA/Autamedica` repository only; avoid
   repository-wide scope if the UI supports selection.
3. On **Project Setup**, select **Add pipeline** and create a **GitHub App**
   pipeline (purple badge). Configure **both config source and checkout source**
   to the same private AutaMedica GitHub repository; config path
   `.circleci/config.yml`. Manual smoke tests use the same feature branch
   for both sources.
4. First test **one** manual `run_smoke=true` pipeline on the exact current
   PR SHA, with `run_android=false` and `run_web=false`.
   After it succeeds, test `run_android=true` alone with **synthetic**
   Firebase/Supabase values. These test jobs never use the production
   signing contexts.
5. After confirming GitHub App pipeline works, remove the **OAuth All pushes
   trigger** to prevent duplicate/no-workflow pipelines and Free credit waste.
   The legacy OAuth pipeline card itself may remain visible by design.
   Leave all other triggers disabled until the release is reviewed.
6. When Android tests pass, configure the **GitHub App Tag pushes** trigger,
   the two restricted contexts and the original Google Play upload key.
   Do not push `android-v1.2.22` merely to test checkout; that tag could
   launch a real signed release if contexts are ready.

**Alternate route if intentionally retaining GitHub OAuth:** CircleCI normally
creates a **read-only deploy key** in GitHub when an OAuth project is set up.
Check GitHub organization **Settings → Security → Deploy keys** for the
policy allowing repositories to create deploy keys. Check the repository's
**Settings → Deploy keys** and CircleCI **Project Settings → SSH Keys** for
a working **read-only checkout key**. Use the official CircleCI instructions
to repair the OAuth project's deployment key. Do not enable **write** access
or put a private SSH key in repository code or chat. If possible, migrate to
GitHub App instead of creating another key.

The `no SSH key` error happens **before** any `.circleci/config.yml`
job begins, so changing Gradle or Kotlin cannot resolve it.
**This PR must remain draft until the new pipeline passes.** Current GitHub
Actions are independently blocked by GitHub billing, and TinyFish browser
automation has exhausted its available wallet balance; neither is required
for the above free setup steps.

Official CircleCI references:
- https://circleci.com/docs/guides/integration/using-the-circleci-github-app-in-an-oauth-org/
- https://circleci.com/docs/guides/permissions-authentication/users-organizations-and-integrations-guide/
- https://circleci.zendesk.com/hc/en-us/articles/20302893166363-Is-my-project-setup-using-GitHub-OAuth-or-GitHub-Apps
- https://circleci.zendesk.com/hc/en-us/articles/38397680126619-How-to-Set-Up-a-New-GitHub-OAuth-App-Organization


## Android CI diagnostic update — 7 Nov 2026

CircleCI pipeline **#39**, commit `0dbb456`, checked out the repository and
passed the JDK setup, but the combined Gradle test/AndroidTest/AAB step failed
after about 10 minutes. The private Gradle exception was not accessible during
this review; **OOM remains a hypothesis, not a confirmed root cause**.

Docker `medium` provides 2 vCPU / 4 GB RAM. The repository-level Gradle
defaults reserve up to 2304 MB for Gradle and 3072 MB for Kotlin, and
`kotlin.daemon.jvmargs` takes precedence over
`kotlin.daemon.jvm.options`. To protect CircleCI, both Android jobs now
supply the explicit `-Pkotlin.daemon.jvmargs=-Xmx768m` override alongside
`GRADLE_OPTS=-Dorg.gradle.jvmargs=-Xmx2048m`,
`-Dorg.gradle.parallel=false`, and `--max-workers=1`. This does not
change the local developer defaults, the app version or production credentials.

On a non-zero Gradle failure, the two jobs execute a non-secret `on_fail`
diagnostic step displaying cgroup `memory.events`, `memory.peak` and
`memory.max` **when available**. A positive `oom_kill` counter is useful
evidence of cgroup OOM; a successful build or an absence of that counter
does not by itself prove full device/clinical readiness. The diagnostic step
is not guaranteed to execute if CircleCI cancels or kills the whole job.

Do not rerun #39 when validating the correction: rerun reuses its old commit.
Instead, manually trigger a NEW pipeline on the latest HEAD of
`ci/circleci-play-internal-draft-20261106`, set both config and checkout refs
to this branch, and set **only** `run_android=true` (leave `run_smoke`
and `run_web` false). Verify the actual SHA and capture any Gradle error.
Run a separate `run_smoke=true` job to execute the policy-regression test.
No GitHub release tag, signing secrets, internal-upload action or production
publication is authorized by these checks.

References: [CircleCI Docker sizes](https://circleci.com/docs/guides/execute/using-docker/),
[Kotlin daemon JVM options](https://kotlinlang.org/docs/gradle-compilation-and-caches.html),
[CircleCI `on_fail` behavior](https://circleci.com/docs/reference/configuration-reference/).
