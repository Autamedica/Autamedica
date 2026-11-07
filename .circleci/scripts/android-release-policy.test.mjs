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
