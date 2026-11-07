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
    assert.match(section, /GRADLE_OPTS: "-Dorg\.gradle\.jvmargs=-Xmx2048m -Dfile\.encoding=UTF-8"/,
      `${name}: expected bounded Gradle heap`);
    assert.match(section, /-Pkotlin\.daemon\.jvmargs=-Xmx768m/,
      `${name}: Kotlin gradle.properties has a larger default; -P override is required`);
    assert.match(section, /-Dorg\.gradle\.parallel=false/, `${name}: Gradle parallelism must be disabled`);
    assert.match(section, /--no-parallel/, `${name}: CLI no-parallel flag must override project Gradle settings`);
    assert.match(section, /--max-workers=1/, `${name}: Gradle worker cap missing`);
    assert.doesNotMatch(section, /-Dkotlin\.daemon\.jvm\.options=/,
      `${name}: overridden JVM options must not be mistaken for Kotlin heap limit`);
  }
});


test('Google Play Android minimum target API and identity', () => {
  const targetSdk = Number(gradle.match(/^\\s*targetSdk\\s*=\\s*(\\d+)/m)?.[1]);
  const versionCode = Number(gradle.match(/^\\s*versionCode\\s*=\\s*(\\d+)/m)?.[1]);
  const versionName = gradle.match(/^\\s*versionName\\s*=\\s*"([^"]+)"/m)?.[1];
  assert.ok(targetSdk >= 36, 'Google Play mobile updates require targetSdk 36+ since 2026-08-31');
  assert.ok(Number.isInteger(versionCode) && versionCode > 0, 'versionCode must be positive');
  assert.match(versionName ?? '', /^\\d+\\.\\d+\\.\\d+$/, 'release name must match android-v tag format');
  assert.match(gradle, /applicationId\\s*=\\s*"com\\.autamedica\\.android"/);
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
  assert.ok(bundle.includes('test "${CIRCLE_RELEASE_CONFIG_REPO:-}" = "ecucondorSA/Autamedica"'));
  assert.ok(bundle.includes('test "${CIRCLE_RELEASE_CONFIG_SHA:-}" = "$CIRCLE_RELEASE_SHA"'));
  assert.doesNotMatch(bundle, /pipeline\.event\.github\.ref/); // push-only value breaks API-triggered smoke
  assert.ok(bundle.includes('git merge-base --is-ancestor "$CIRCLE_RELEASE_SHA" FETCH_HEAD'));
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
  assert.match(bundle, /testDebugUnitTest compileDebugAndroidTestSources bundleRelease/);
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
