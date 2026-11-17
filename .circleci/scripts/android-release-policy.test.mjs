import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const config = readFileSync(resolve(root, '.circleci/config.yml'), 'utf8');
const prepare = readFileSync(resolve(root, '.circleci/scripts/prepare_android_release.py'), 'utf8');
const gradle = readFileSync(resolve(root, 'apps/android/app/build.gradle.kts'), 'utf8');

const start = config.indexOf('  android_release_bundle:');
const end = config.indexOf('\nworkflows:', start);
const workflow = config.slice(config.indexOf('  android_release_internal_draft:\n', end));


test('Android CI JVM budgets are bounded on both medium Docker jobs', () => {
  const sections = [
    ['manual', config.slice(config.indexOf('  android:\n'), config.indexOf('  # Tag-triggered release only.'))],
    ['release', config.slice(config.indexOf('  android_release_bundle:\n'), config.indexOf('  android_play_internal_draft:\n'))],
  ];
  for (const [name, section] of sections) {
    assert.ok(section.startsWith('  android'), `${name}: Android job section missing`);
    assert.match(section, /resource_class: medium/, `${name}: expected 4 GB Docker medium`);
    const gradleHeap = 1536;
    const kotlinHeap = 1280;
    assert.ok(section.includes(`GRADLE_OPTS: "-Dorg.gradle.jvmargs=-Xmx${gradleHeap}m -Dfile.encoding=UTF-8"`),
      `${name}: expected bounded Gradle heap`);
    assert.ok(section.includes(`-Pkotlin.daemon.jvmargs=-Xmx${kotlinHeap}m`),
      `${name}: Kotlin gradle.properties has a larger default; -P override is required`);
    assert.match(section, /-Dorg\.gradle\.parallel=false/, `${name}: Gradle parallelism must be disabled`);
    assert.match(section, /--no-parallel/, `${name}: CLI no-parallel flag must override project Gradle settings`);
    assert.match(section, /--max-workers=1/, `${name}: Gradle worker cap missing`);
    assert.doesNotMatch(section, /-Dkotlin\.daemon\.jvm\.options=/,
      `${name}: overridden JVM options must not be mistaken for Kotlin heap limit`);
  }
});


test('synthetic Android CI isolates Kotlin errors and never uploads Crashlytics mappings', () => {
  const manual = config.slice(config.indexOf('  android:\n'), config.indexOf('  # Tag-triggered release only.'));
  const release = config.slice(start, config.indexOf('  android_play_internal_draft:\n', start));
  assert.ok(manual.includes('name: Compile Android debug Kotlin (synthetic CI)'));
  assert.ok(manual.includes('./gradlew :app:compileDebugKotlin '));
  assert.ok(manual.includes('name: JVM tests and Android test source compilation (synthetic CI)'));
  assert.ok(manual.includes('./gradlew testDebugUnitTest compileDebugAndroidTestSources '));
  assert.ok(manual.includes('name: Unsigned release bundle (synthetic CI; no Crashlytics upload)'));
  assert.ok(manual.includes('./gradlew bundleRelease -x :app:uploadCrashlyticsMappingFileRelease '));
  assert.equal((manual.match(/-x :app:uploadCrashlyticsMappingFileRelease/g) ?? []).length, 1,
    'synthetic bundle must omit only the upload task');
  assert.doesNotMatch(release, /-x :app:uploadCrashlyticsMappingFileRelease/,
    'signed release must preserve Crashlytics mapping uploads');
  assert.ok(release.includes('./gradlew :app:compileDebugKotlin '));
  assert.ok(release.includes('./gradlew testDebugUnitTest compileDebugAndroidTestSources '));
  assert.ok(release.includes('./gradlew bundleRelease -PfirebasePerformanceInstrumentationEnabled=false '));
  assert.ok(release.includes('jarsigner -verify'));
});

test('Google Play Android minimum target API and identity', () => {
  const targetSdk = Number(gradle.match(/^\s*targetSdk\s*=\s*(\d+)/m)?.[1]);
  const versionCode = Number(gradle.match(/^\s*versionCode\s*=\s*(\d+)/m)?.[1]);
  const versionName = gradle.match(/^\s*versionName\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(targetSdk >= 36, 'Google Play mobile updates require targetSdk 36+ since 2026-08-31');
  assert.ok(Number.isInteger(versionCode) && versionCode > 0, 'versionCode must be positive');
  assert.match(versionName ?? '', /^\d+\.\d+\.\d+$/, 'release name must match android-v tag format');
  assert.match(gradle, /applicationId\s*=\s*"com\.autamedica\.android"/);
});

test('release jobs are isolated from the existing manual CI defaults', () => {
  assert.ok(start > 0 && end > start);
  for (const flag of ['run_smoke', 'run_web', 'run_android']) {
    assert.match(config, new RegExp(`  ${flag}:\\n    type: boolean\\n    default: false`));
  }
  assert.equal((config.match(/^workflows:/gm) ?? []).length, 1);
});

test('release jobs require GitHub tag event and original tagged configuration', () => {
  const bundle = config.slice(start, end);
  for (const name of [
    'CIRCLE_RELEASE_TAG', 'CIRCLE_RELEASE_CONFIG_REF',
    'CIRCLE_RELEASE_SHA', 'CIRCLE_RELEASE_CONFIG_SHA', 'CIRCLE_RELEASE_CONFIG_REPO',
    'CIRCLE_RELEASE_TRIGGER', 'CIRCLE_RELEASE_EVENT',
  ]) {
    assert.ok(bundle.includes(name), `Missing mandatory release provenance gate ${name}`);
  }
  assert.ok(bundle.includes('test "${CIRCLE_RELEASE_CONFIG_REF:-}" = "refs/tags/$tag"'));
  assert.ok(bundle.includes('test "${CIRCLE_RELEASE_TRIGGER:-}" = "github_app"'));
  assert.ok(bundle.includes('test "${CIRCLE_RELEASE_CONFIG_REPO:-}" = "Autamedica/Autamedica"'));
  assert.ok(bundle.includes('test "${CIRCLE_RELEASE_CONFIG_SHA:-}" = "$CIRCLE_RELEASE_SHA"'));
  assert.doesNotMatch(bundle, /pipeline\.event\.github\.ref/); // push-only value breaks API-triggered smoke
  assert.ok(bundle.includes('git merge-base --is-ancestor "$CIRCLE_RELEASE_SHA" FETCH_HEAD'));
  // Immutable GitHub releases permanently reserve deleted tag names; version-matched
  // rc tags are permitted but still must pass GitHub App provenance and main ancestry.
  assert.ok(bundle.includes("echo \"$tag\" | grep -Eq '^android-v[0-9]+\\.[0-9]+\\.[0-9]+(-rc[1-9][0-9]*)?$'"));
  assert.ok(bundle.includes('tag_version="${tag#android-v}"'));
  assert.ok(bundle.includes('tag_version="${tag_version%%-rc*}"'));
  assert.ok(bundle.includes('test "$tag_version" = "$version"'));
  assert.ok(config.includes("echo \"$CIRCLE_RELEASE_TAG\" | grep -Eq '^android-v[0-9]+\\.[0-9]+\\.[0-9]+(-rc[1-9][0-9]*)?$'"));
  assert.ok(workflow.includes("only: /^android-v[0-9]+\\.[0-9]+\\.[0-9]+(-rc[1-9][0-9]*)?$/"));
});

test('only a draft in the Google Play internal track is permitted', () => {
  assert.match(config, /--track "internal"/);
  assert.match(config, /--release_status "draft"/);
  assert.doesNotMatch(config, /--track "production"/);
  assert.doesNotMatch(config, /--track_promote_to/);
  assert.ok(workflow.includes('context: autamedica-android-signing'));
  assert.ok(workflow.includes('context: autamedica-google-play-internal'));
  assert.ok(workflow.includes('filters: &android_release_tag_filter'));
  assert.ok(workflow.includes('filters: *android_release_tag_filter'));
});

test('build gates signed AAB and never exports release keystore as an artifact', () => {
  const bundle = config.slice(start, end);
  assert.ok(bundle.includes('./gradlew :app:compileDebugKotlin '));
  assert.ok(bundle.includes('./gradlew testDebugUnitTest compileDebugAndroidTestSources '));
  assert.ok(bundle.includes('./gradlew bundleRelease -PfirebasePerformanceInstrumentationEnabled=false '));
  assert.match(bundle, /jarsigner -verify/);
  assert.ok(bundle.includes('apps/android/app/build/outputs/bundle/release'));
  assert.doesNotMatch(bundle, /store_artifacts:[\s\S]*keystore/);
  assert.doesNotMatch(bundle, /persist_to_workspace:[\s\S]*keystore/);
});

test('release secrets must be present but signing passwords stay in contexts', () => {
  for (const secret of [
    'AUTAMEDICA_RELEASE_KEYSTORE_BASE64',
    'AUTAMEDICA_RELEASE_STORE_PASSWORD',
    'AUTAMEDICA_RELEASE_KEY_ALIAS',
    'AUTAMEDICA_RELEASE_KEY_PASSWORD',
    'AUTAMEDICA_GOOGLE_SERVICES_JSON',
    'AUTAMEDICA_UPLOAD_CERT_SHA256',
  ]) {
    assert.ok(prepare.includes(`required("${secret}")`), `Missing required ${secret}`);
  }
  assert.doesNotMatch(prepare, /f["']RELEASE_(STORE_PASSWORD|KEY_PASSWORD|KEY_ALIAS)=/);
  assert.match(prepare, /keytool", "-exportcert"/);
  assert.match(prepare, /hashlib\.sha256\(certificate\.stdout\)\.hexdigest\(\) != upload_sha/);
  assert.match(gradle, /System\.getenv\("AUTAMEDICA_RELEASE_STORE_PASSWORD"\)/);
  assert.match(gradle, /System\.getenv\("AUTAMEDICA_RELEASE_KEY_PASSWORD"\)/);
});
