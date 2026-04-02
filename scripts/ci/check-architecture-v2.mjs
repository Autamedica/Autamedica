#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  classifyArchitecturePath,
  compileArchitectureManifest,
  loadArchitectureManifest,
  resolveRepoRoot,
  summarizeClassifications,
  validateArchitectureManifest,
} from '../lib/architecture-v2.mjs';

function parseArgs(argv) {
  const args = {
    base: null,
    head: null,
    cached: false,
    changed: false,
    files: null,
    full: false,
    help: false,
    json: false,
    manifest: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (token === '--full') {
      args.full = true;
      continue;
    }

    if (token === '--changed') {
      args.changed = true;
      continue;
    }

    if (token === '--json') {
      args.json = true;
      continue;
    }

    if (token === '--cached') {
      args.cached = true;
      continue;
    }

    if (token === '--base') {
      args.base = argv[++index] ?? null;
      continue;
    }

    if (token === '--head') {
      args.head = argv[++index] ?? null;
      continue;
    }

    if (token === '--manifest') {
      args.manifest = argv[++index] ?? null;
      continue;
    }

    if (token === '--files') {
      args.files = (argv[++index] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }

    if (token.startsWith('--files=')) {
      args.files = token
        .slice('--files='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  return args;
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || `git ${args.join(' ')} failed`;
    throw new Error(message);
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizePath(inputPath) {
  return String(inputPath).replaceAll('\\', '/').replace(/^\.\/+/u, '').replace(/\/$/u, '');
}

function unique(values) {
  return [...new Set(values)];
}

function toRepoRelativePath(repoRoot, filePath) {
  const normalized = normalizePath(filePath);

  if (!path.isAbsolute(normalized)) {
    return normalized;
  }

  try {
    return normalizePath(path.relative(repoRoot, realpathSync(normalized)));
  } catch {
    return normalizePath(path.relative(repoRoot, normalized));
  }
}

function resolveChangedFiles(repoRoot, args) {
  if (args.files?.length > 0) {
    return unique(args.files.map((filePath) => toRepoRelativePath(repoRoot, filePath)));
  }

  if (args.cached) {
    return git(repoRoot, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']).map(normalizePath);
  }

  if (args.base && args.head) {
    return git(repoRoot, ['diff', '--name-only', '--diff-filter=ACMR', args.base, args.head]).map(normalizePath);
  }

  const workingTree = git(repoRoot, ['diff', '--name-only', '--diff-filter=ACMR']);
  const staged = git(repoRoot, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  const untracked = git(repoRoot, ['ls-files', '--others', '--exclude-standard']);
  const localFiles = unique([...workingTree, ...staged, ...untracked].map((filePath) => toRepoRelativePath(repoRoot, filePath)));

  if (localFiles.length > 0) {
    return localFiles;
  }

  const envBase = process.env.GITHUB_BASE_SHA || process.env.CI_GIT_BASE || null;
  const envHead = process.env.GITHUB_SHA || process.env.CI_GIT_HEAD || null;
  const envDiff =
    envBase && envHead
      ? git(repoRoot, ['diff', '--name-only', '--diff-filter=ACMR', envBase, envHead])
      : [];

  return unique(envDiff.map((filePath) => toRepoRelativePath(repoRoot, filePath)));
}

function formatMatchList(matches) {
  return matches.length > 0 ? matches.map((entry) => entry.label || entry.id).join(', ') : 'none';
}

function printIssueList(title, issues) {
  if (issues.length === 0) return;

  console.error(`\n${title}`);
  console.error('-'.repeat(title.length));
  for (const issue of issues) {
    if (issue.filePath) {
      console.error(`- ${issue.filePath}: ${issue.reason}`);
      if (issue.domains?.length) console.error(`  domains: ${formatMatchList(issue.domains)}`);
      if (issue.workstreams?.length) console.error(`  workstreams: ${formatMatchList(issue.workstreams)}`);
      if (issue.crossCuttingSurfaces?.length) {
        console.error(`  cross-cutting: ${formatMatchList(issue.crossCuttingSurfaces)}`);
      }
      continue;
    }

    console.error(`- [${issue.code || 'issue'}] ${issue.message}`);
    if (issue.files?.length) {
      for (const filePath of issue.files) {
        console.error(`  ${filePath}`);
      }
    }
  }
}

function printGroupStats(title, entries) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  for (const entry of entries) {
    console.log(`${entry.id.padEnd(24)} ${String(entry.matches.size).padStart(4)} files`);
  }
}

const repoRoot = realpathSync(resolveRepoRoot(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const changedMode = args.changed || args.cached || Boolean(args.base && args.head) || (args.files?.length ?? 0) > 0;

if (args.help) {
  console.log([
    'Usage: check-architecture-v2.mjs [options]',
    '',
    'Options:',
    '  --changed             Analyze changed files (working tree, staged, or CI diff)',
    '  --full                Print manifest coverage summary and validate the manifest',
    '  --json                Emit a machine-readable JSON report',
    '  --cached              Analyze the staged diff',
    '  --base <ref>          Analyze git diff from <ref> to <head>',
    '  --head <ref>          Analyze git diff from <base> to <ref>',
    '  --files a,b,c         Analyze an explicit comma-separated file list',
    '  --manifest <path>     Load an alternate manifest file',
    '  -h, --help            Show this help',
  ].join('\n'));
  process.exit(0);
}

const manifestPath = args.manifest
  ? realpathSync(path.resolve(repoRoot, args.manifest))
  : realpathSync(loadArchitectureManifest(repoRoot).manifestPath);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const compiled = compileArchitectureManifest(repoRoot, manifest);
const manifestIssues = validateArchitectureManifest(compiled);

if (args.full) {
  console.log('Architecture v2 check');
  console.log('=====================');
  console.log(`Repo root: ${repoRoot}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log('Mode: full');

  printGroupStats('Domains', compiled.groups.domains);
  printGroupStats('Cross-cutting surfaces', compiled.groups.crossCuttingSurfaces);
  printGroupStats('Workstreams', compiled.groups.workstreams);
  console.log(`\nGoverned files in manifest: ${compiled.governedPaths.size}`);

  if (manifestIssues.length > 0) {
    printIssueList('Manifest issues', manifestIssues);
    process.exit(1);
  }

  console.log('\nArchitecture v2 manifest OK');
  process.exit(0);
}

if (!changedMode) {
  console.log('Architecture v2 check');
  console.log('=====================');
  console.log(`Repo root: ${repoRoot}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log('Mode: full');

  printGroupStats('Domains', compiled.groups.domains);
  printGroupStats('Cross-cutting surfaces', compiled.groups.crossCuttingSurfaces);
  printGroupStats('Workstreams', compiled.groups.workstreams);
  console.log(`\nGoverned files in manifest: ${compiled.governedPaths.size}`);

  if (manifestIssues.length > 0) {
    printIssueList('Manifest issues', manifestIssues);
    process.exit(1);
  }

  console.log('\nArchitecture v2 manifest OK');
  process.exit(0);
}

const files = resolveChangedFiles(repoRoot, args);
const classifications = files.map((filePath) => classifyArchitecturePath(filePath, compiled));
const governed = classifications.filter((classification) => classification.governed);
const outsideScope = classifications.filter((classification) => !classification.governed);
const ambiguous = governed.filter(
  (classification) =>
    classification.domains.length > 1 ||
    classification.workstreams.length > 1 ||
    classification.crossCuttingSurfaces.length > 1,
);
const unmapped = governed.filter(
  (classification) =>
    classification.domains.length === 0 &&
    classification.workstreams.length === 0 &&
    classification.crossCuttingSurfaces.length === 0,
);
const changedIssues = [
  ...unmapped.map((classification) => ({
    filePath: classification.filePath,
    reason: 'governed path without a manifest owner',
    domains: classification.domains,
    workstreams: classification.workstreams,
    crossCuttingSurfaces: classification.crossCuttingSurfaces,
  })),
  ...ambiguous.map((classification) => ({
    filePath: classification.filePath,
    reason: 'ambiguous mapping within at least one scope',
    domains: classification.domains,
    workstreams: classification.workstreams,
    crossCuttingSurfaces: classification.crossCuttingSurfaces,
  })),
];
const summary = summarizeClassifications(governed);

if (args.json) {
  const payload = {
    manifestPath,
    mode: 'changed',
    files,
    counts: {
      total: classifications.length,
      governed: governed.length,
      outsideScope: outsideScope.length,
      unmapped: unmapped.length,
      ambiguous: ambiguous.length,
    },
    summary,
    manifestIssues,
    changedIssues,
    classifications: classifications.map((classification) => ({
      filePath: classification.filePath,
      governed: classification.governed,
      domains: classification.domains.map((entry) => entry.label),
      workstreams: classification.workstreams.map((entry) => entry.label),
      crossCuttingSurfaces: classification.crossCuttingSurfaces.map((entry) => entry.label),
    })),
  };

  console.log(JSON.stringify(payload, null, 2));
  process.exit(manifestIssues.length > 0 || changedIssues.length > 0 ? 1 : 0);
}

console.log('Architecture v2 check');
console.log('=====================');
console.log(`Repo root: ${repoRoot}`);
console.log(`Manifest: ${manifestPath}`);
console.log('Mode: changed');
console.log(`Changed files detected: ${files.length}`);
console.log(`Governed changed files: ${governed.length}`);
console.log(`Outside scope or ignored: ${outsideScope.length}`);

if (summary.domains.length > 0) {
  console.log('\nDomains hit');
  console.log('-----------');
  for (const [label, count] of summary.domains) {
    console.log(`${label}: ${count}`);
  }
}

if (summary.workstreams.length > 0) {
  console.log('\nWorkstreams hit');
  console.log('---------------');
  for (const [label, count] of summary.workstreams) {
    console.log(`${label}: ${count}`);
  }
}

if (summary.crossCuttingSurfaces.length > 0) {
  console.log('\nCross-cutting surfaces hit');
  console.log('--------------------------');
  for (const [label, count] of summary.crossCuttingSurfaces) {
    console.log(`${label}: ${count}`);
  }
}

if (outsideScope.length > 0) {
  console.log('\nOutside scope or ignored');
  console.log('------------------------');
  for (const classification of outsideScope.slice(0, 20)) {
    console.log(classification.filePath);
  }

  if (outsideScope.length > 20) {
    console.log(`... ${outsideScope.length - 20} more`);
  }
}

if (manifestIssues.length > 0) {
  printIssueList('Manifest issues', manifestIssues);
}

if (changedIssues.length > 0) {
  printIssueList('Changed-file issues', changedIssues);
}

if (manifestIssues.length > 0 || changedIssues.length > 0) {
  process.exit(1);
}

console.log('\nArchitecture v2 changed-file check OK');
