#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { spawnSync } from 'node:child_process';
import { globSync } from 'glob';
import * as ts from 'typescript';
import {
  classifyArchitecturePath,
  compileArchitectureManifest,
  loadArchitectureManifest,
  resolveRepoRoot,
  validateArchitectureManifest,
} from '../lib/architecture-v2.mjs';

const CODE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/u;
const BUILTIN_MODULES = new Set([...builtinModules, ...builtinModules.map((entry) => `node:${entry}`)]);

function parseArgs(argv) {
  const args = {
    base: null,
    cached: false,
    changed: false,
    files: null,
    head: null,
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

function normalizePath(inputPath) {
  return String(inputPath).replaceAll('\\', '/').replace(/^\.\/+/u, '').replace(/\/$/u, '');
}

function unique(values) {
  return [...new Set(values)];
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
  if (envBase && envHead) {
    return unique(
      git(repoRoot, ['diff', '--name-only', '--diff-filter=ACMR', envBase, envHead]).map((filePath) =>
        toRepoRelativePath(repoRoot, filePath),
      ),
    );
  }

  try {
    return unique(
      git(repoRoot, ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD~1', 'HEAD']).map((filePath) =>
        toRepoRelativePath(repoRoot, filePath),
      ),
    );
  } catch {
    return [];
  }
}

function extractModuleSpecifiers(sourceCode, filePath) {
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const specifiers = new Set();

  function collect(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.add(node.arguments[0].text);
    }

    ts.forEachChild(node, collect);
  }

  collect(sourceFile);
  return [...specifiers];
}

function loadPackageNameMap(repoRoot) {
  const packageJsonFiles = [
    ...globSync('apps/*/package.json', { cwd: repoRoot, dot: true, windowsPathsNoEscape: true }),
    ...globSync('packages/*/package.json', { cwd: repoRoot, dot: true, windowsPathsNoEscape: true }),
    ...globSync('packages/@*/*/package.json', { cwd: repoRoot, dot: true, windowsPathsNoEscape: true }),
  ];
  const map = new Map();

  for (const relativePackageJson of packageJsonFiles) {
    const packageJsonPath = path.join(repoRoot, relativePackageJson);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (!packageJson.name) continue;

    const packageRoot = normalizePath(path.dirname(relativePackageJson));
    const current = map.get(packageJson.name) ?? [];
    current.push(packageRoot);
    map.set(packageJson.name, unique(current));
  }

  return map;
}

function findNearestTsconfig(repoRoot, absoluteFilePath) {
  let currentDir = path.dirname(absoluteFilePath);

  while (currentDir.startsWith(repoRoot)) {
    const candidate = path.join(currentDir, 'tsconfig.json');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return path.join(repoRoot, 'tsconfig.base.json');
}

function createCompilerOptionsResolver(repoRoot) {
  const cache = new Map();

  return function getCompilerOptions(sourceFilePath) {
    const tsconfigPath = findNearestTsconfig(repoRoot, sourceFilePath);
    if (cache.has(tsconfigPath)) {
      return cache.get(tsconfigPath);
    }

    const rawConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (rawConfig.error) {
      throw new Error(ts.formatDiagnosticsWithColorAndContext([rawConfig.error], {
        getCanonicalFileName: (value) => value,
        getCurrentDirectory: () => repoRoot,
        getNewLine: () => '\n',
      }));
    }

    const parsed = ts.parseJsonConfigFileContent(rawConfig.config, ts.sys, path.dirname(tsconfigPath));
    cache.set(tsconfigPath, parsed.options);
    return parsed.options;
  };
}

function resolveImportTarget(repoRoot, sourceRelativePath, specifier, packageNameMap, getCompilerOptions) {
  if (!specifier || BUILTIN_MODULES.has(specifier) || specifier.startsWith('node:')) {
    return { kind: 'builtin', targets: [] };
  }

  if (specifier.startsWith('@autamedica/')) {
    const [scope, name] = specifier.split('/');
    const packageName = `${scope}/${name}`;
    const targets = packageNameMap.get(packageName) ?? [];
    return {
      kind: targets.length > 0 ? 'workspace-package' : 'external',
      targets,
    };
  }

  const sourceAbsolutePath = path.join(repoRoot, sourceRelativePath);
  const compilerOptions = getCompilerOptions(sourceAbsolutePath);
  const resolved = ts.resolveModuleName(specifier, sourceAbsolutePath, compilerOptions, ts.sys).resolvedModule;

  if (!resolved?.resolvedFileName) {
    return { kind: 'unresolved', targets: [] };
  }

  const resolvedFilePath = resolved.resolvedFileName;
  if (!path.isAbsolute(resolvedFilePath)) {
    return { kind: 'unresolved', targets: [] };
  }

  if (!resolvedFilePath.startsWith(repoRoot)) {
    return { kind: 'external', targets: [] };
  }

  const targets = [toRepoRelativePath(repoRoot, resolvedFilePath)];
  return {
    kind: 'local',
    targets,
  };
}

function mergeEntries(entries) {
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

function classifyImportTargets(targetPaths, compiledManifest) {
  const classifications = targetPaths.map((targetPath) => classifyArchitecturePath(targetPath, compiledManifest));
  return {
    paths: targetPaths,
    domains: mergeEntries(classifications.flatMap((classification) => classification.domains)),
    contracts: mergeEntries(classifications.flatMap((classification) => classification.contracts)),
  };
}

function isImportAllowed(sourceDomainId, targetClassification, compiledManifest) {
  if (targetClassification.domains.length === 0) {
    return true;
  }

  if (targetClassification.domains.some((domain) => domain.id === sourceDomainId)) {
    return true;
  }

  const policy = compiledManifest.importPolicyMap?.get(sourceDomainId);
  if (!policy) {
    return false;
  }

  if ((policy.allowDomains ?? []).some((domainId) => targetClassification.domains.some((domain) => domain.id === domainId))) {
    return true;
  }

  const allowedContracts = new Set(policy.allowContracts ?? []);
  return targetClassification.contracts.some(
    (contract) =>
      allowedContracts.has(contract.id) &&
      targetClassification.domains.some((domain) => domain.id === contract.providerDomain),
  );
}

function formatList(entries) {
  return entries.length > 0 ? entries.map((entry) => entry.label || entry.id).join(', ') : 'none';
}

function printViolations(violations) {
  if (violations.length === 0) return;

  console.error('\nImport boundary violations');
  console.error('-------------------------');

  for (const violation of violations) {
    console.error(`- ${violation.filePath}`);
    console.error(`  import: ${violation.specifier}`);
    console.error(`  reason: ${violation.reason}`);
    console.error(`  source domain: ${violation.sourceDomain}`);
    console.error(`  target domains: ${violation.targetDomains}`);
    if (violation.targetContracts !== 'none') {
      console.error(`  target contracts: ${violation.targetContracts}`);
    }
    if (violation.targetPaths.length > 0) {
      console.error(`  targets: ${violation.targetPaths.join(', ')}`);
    }
  }
}

const repoRoot = realpathSync(resolveRepoRoot(import.meta.url));
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    'Usage: check-architecture-v2-imports.mjs [options]',
    '',
    'Options:',
    '  --changed             Analyze changed files (working tree, staged, or CI diff)',
    '  --cached              Analyze the staged diff',
    '  --base <ref>          Analyze git diff from <ref> to <head>',
    '  --head <ref>          Analyze git diff from <base> to <ref>',
    '  --files a,b,c         Analyze an explicit comma-separated file list',
    '  --manifest <path>     Load an alternate manifest file',
    '  --json                Emit a machine-readable JSON report',
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

const changedFiles = resolveChangedFiles(repoRoot, args);
const analyzableFiles = changedFiles.filter(
  (filePath) => CODE_FILE_PATTERN.test(filePath) && existsSync(path.join(repoRoot, filePath)),
);
const packageNameMap = loadPackageNameMap(repoRoot);
const getCompilerOptions = createCompilerOptionsResolver(repoRoot);
const violations = [];
const inspectedFiles = [];

for (const filePath of analyzableFiles) {
  const sourceClassification = classifyArchitecturePath(filePath, compiled);

  if (sourceClassification.ignored || sourceClassification.domains.length !== 1) {
    continue;
  }

  const sourceDomain = sourceClassification.domains[0];
  const absoluteFilePath = path.join(repoRoot, filePath);
  const sourceCode = readFileSync(absoluteFilePath, 'utf8');
  const specifiers = extractModuleSpecifiers(sourceCode, absoluteFilePath);
  inspectedFiles.push(filePath);

  for (const specifier of specifiers) {
    const resolution = resolveImportTarget(repoRoot, filePath, specifier, packageNameMap, getCompilerOptions);

    if (resolution.kind === 'builtin' || resolution.kind === 'external' || resolution.kind === 'unresolved') {
      continue;
    }

    const targetClassification = classifyImportTargets(resolution.targets, compiled);
    if (targetClassification.domains.length === 0) {
      continue;
    }

    if (isImportAllowed(sourceDomain.id, targetClassification, compiled)) {
      continue;
    }

    violations.push({
      filePath,
      specifier,
      reason: 'cross-domain import without an explicit v2 contract',
      sourceDomain: sourceDomain.label,
      targetDomains: formatList(targetClassification.domains),
      targetContracts: formatList(targetClassification.contracts),
      targetPaths: resolution.targets,
    });
  }
}

const payload = {
  manifestPath,
  mode: 'changed-imports',
  changedFiles,
  analyzableFiles,
  inspectedFiles,
  manifestIssues,
  violations,
};

if (args.json) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(manifestIssues.length > 0 || violations.length > 0 ? 1 : 0);
}

console.log('Architecture v2 import check');
console.log('============================');
console.log(`Repo root: ${repoRoot}`);
console.log(`Manifest: ${manifestPath}`);
console.log('Mode: changed');
console.log(`Changed files detected: ${changedFiles.length}`);
console.log(`Analyzable code files: ${analyzableFiles.length}`);
console.log(`Domain-owned files inspected: ${inspectedFiles.length}`);

if (manifestIssues.length > 0) {
  console.error('\nManifest issues');
  console.error('---------------');
  for (const issue of manifestIssues) {
    console.error(`- [${issue.code || 'issue'}] ${issue.message}`);
  }
}

if (violations.length > 0) {
  printViolations(violations);
}

if (manifestIssues.length > 0 || violations.length > 0) {
  process.exit(1);
}

console.log('\nArchitecture v2 import check OK');
