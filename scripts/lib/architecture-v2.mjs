import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';

function uniq(values) {
  return [...new Set(values)];
}

function normalizeRelativePath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\/+/u, '').replace(/\/$/u, '');
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.*]/gu, '\\$&');
}

function globPatternToRegex(pattern) {
  const normalized = normalizeRelativePath(pattern);

  if (
    normalized.endsWith('/**') &&
    !normalized.slice(0, -3).includes('*') &&
    !normalized.slice(0, -3).includes('?')
  ) {
    const prefix = escapeRegExp(normalized.slice(0, -3));
    return new RegExp(`^${prefix}(?:/.*)?$`, 'u');
  }

  let regex = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (char === '*') {
      if (normalized[index + 1] === '*') {
        regex += '.*';
        index += 1;
        continue;
      }

      regex += '[^/]*';
      continue;
    }

    if (char === '?') {
      regex += '[^/]';
      continue;
    }

    regex += escapeRegExp(char);
  }

  regex += '$';
  return new RegExp(regex, 'u');
}

function compilePatternMatchers(patterns) {
  return (patterns ?? []).map((pattern) => {
    const normalized = normalizeRelativePath(pattern);
    return {
      pattern: normalized,
      regex: globPatternToRegex(normalized),
    };
  });
}

function matchesPatternMatchers(relativePath, matchers) {
  return matchers.some((matcher) => matcher.regex.test(relativePath));
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveRepoRoot(importMetaUrl) {
  const filename = fileURLToPath(importMetaUrl);
  return path.resolve(path.dirname(filename), '../..');
}

export function loadArchitectureManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, 'config', 'architecture-v2.manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return {
    manifest,
    manifestPath,
  };
}

function compileEntry(repoRoot, entry, ignorePatterns) {
  const matches = new Set();
  const compiledPatterns = compilePatternMatchers(entry.patterns);

  for (const pattern of entry.patterns) {
    const resolved = globSync(pattern, {
      cwd: repoRoot,
      dot: true,
      ignore: ignorePatterns,
      windowsPathsNoEscape: true,
    })
      .map(normalizeRelativePath)
      .filter(Boolean);

    for (const match of resolved) {
      matches.add(match);
    }
  }

  return {
    ...entry,
    compiledPatterns,
    patterns: (entry.patterns ?? []).map(normalizeRelativePath),
    matches,
  };
}

export function compileArchitectureManifest(repoRoot, manifest) {
  const ignorePatterns = manifest.ignore ?? [];
  const ignoreMatchers = compilePatternMatchers(ignorePatterns);
  const groups = {
    domains: (manifest.domains ?? []).map((entry) => compileEntry(repoRoot, entry, ignorePatterns)),
    crossCuttingSurfaces: (manifest.crossCuttingSurfaces ?? []).map((entry) =>
      compileEntry(repoRoot, entry, ignorePatterns),
    ),
    workstreams: (manifest.workstreams ?? []).map((entry) => compileEntry(repoRoot, entry, ignorePatterns)),
  };
  const contracts = (manifest.contracts ?? []).map((entry) => compileEntry(repoRoot, entry, ignorePatterns));
  const domainMap = new Map(groups.domains.map((entry) => [entry.id, entry]));
  const contractMap = new Map(contracts.map((entry) => [entry.id, entry]));
  const importPolicies = manifest.importPolicies ?? [];
  const importPolicyMap = new Map(importPolicies.map((entry) => [entry.fromDomain, entry]));

  const governedPaths = new Set();
  for (const entry of [...groups.domains, ...groups.crossCuttingSurfaces, ...groups.workstreams]) {
    for (const match of entry.matches) governedPaths.add(match);
  }

  return {
    ignorePatterns,
    ignoreMatchers,
    groups,
    contracts,
    domainMap,
    contractMap,
    importPolicies,
    importPolicyMap,
    governedPaths,
  };
}

function isIgnoredPath(relativePath, compiledManifest) {
  return matchesPatternMatchers(relativePath, compiledManifest.ignoreMatchers ?? []);
}

function entryMatchesPath(entry, relativePath) {
  return entry.matches.has(relativePath) || matchesPatternMatchers(relativePath, entry.compiledPatterns ?? []);
}

function findMatches(entries, relativePath) {
  return entries.filter((entry) => entryMatchesPath(entry, relativePath));
}

export function classifyArchitecturePath(relativePath, compiledManifest) {
  const filePath = normalizeRelativePath(relativePath);
  const ignored = isIgnoredPath(filePath, compiledManifest);
  return {
    filePath,
    ignored,
    governed: !ignored && compiledManifest.governedPaths.has(filePath),
    domains: ignored ? [] : findMatches(compiledManifest.groups.domains, filePath),
    crossCuttingSurfaces: ignored ? [] : findMatches(compiledManifest.groups.crossCuttingSurfaces, filePath),
    workstreams: ignored ? [] : findMatches(compiledManifest.groups.workstreams, filePath),
    contracts: ignored ? [] : findMatches(compiledManifest.contracts ?? [], filePath),
  };
}

export function validateArchitectureManifest(compiledManifest) {
  const issues = [];

  for (const [groupName, entries] of Object.entries(compiledManifest.groups)) {
    for (const entry of entries) {
      if (entry.matches.size === 0) {
        issues.push({
          level: 'error',
          code: 'empty-pattern-group',
          message: `${groupName}:${entry.id} no matchea ningun archivo del repo actual`,
        });
      }
    }

    for (let index = 0; index < entries.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex += 1) {
        const current = entries[index];
        const next = entries[nextIndex];
        const overlap = [...current.matches].filter((match) => next.matches.has(match));

        if (overlap.length > 0) {
          issues.push({
            level: 'error',
            code: 'overlap',
            message: `${groupName}:${current.id} y ${groupName}:${next.id} se superponen`,
            files: overlap.slice(0, 20),
          });
        }
      }
    }
  }

  for (const contract of compiledManifest.contracts ?? []) {
    if (contract.matches.size === 0) {
      issues.push({
        level: 'error',
        code: 'empty-contract-group',
        message: `contracts:${contract.id} no matchea ningun archivo del repo actual`,
      });
    }

    const providerDomain = compiledManifest.domainMap?.get(contract.providerDomain);
    if (!providerDomain) {
      issues.push({
        level: 'error',
        code: 'unknown-contract-provider',
        message: `contracts:${contract.id} referencia providerDomain desconocido: ${contract.providerDomain}`,
      });
      continue;
    }

    const outsideProvider = [...contract.matches].filter((match) => !entryMatchesPath(providerDomain, match));
    if (outsideProvider.length > 0) {
      issues.push({
        level: 'error',
        code: 'contract-outside-provider-domain',
        message: `contracts:${contract.id} expone archivos fuera de ${providerDomain.label}`,
        files: outsideProvider.slice(0, 20),
      });
    }
  }

  for (const policy of compiledManifest.importPolicies ?? []) {
    if (!compiledManifest.domainMap?.has(policy.fromDomain)) {
      issues.push({
        level: 'error',
        code: 'unknown-import-policy-domain',
        message: `importPolicies:${policy.id ?? policy.fromDomain} referencia fromDomain desconocido: ${policy.fromDomain}`,
      });
    }

    for (const contractId of policy.allowContracts ?? []) {
      if (!compiledManifest.contractMap?.has(contractId)) {
        issues.push({
          level: 'error',
          code: 'unknown-import-policy-contract',
          message: `importPolicies:${policy.id ?? policy.fromDomain} referencia contrato desconocido: ${contractId}`,
        });
      }
    }
  }

  return issues;
}

function changedFilesFromGithubEvent(repoRoot) {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return [];

  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    const baseSha = event.pull_request?.base?.sha;
    const headSha = event.pull_request?.head?.sha ?? process.env.GITHUB_SHA;

    if (!baseSha || !headSha) return [];

    return (
      git(['diff', '--name-only', '--diff-filter=ACMRTUXB', baseSha, headSha], repoRoot) ?? []
    ).map(normalizeRelativePath);
  } catch {
    return [];
  }
}

function changedFilesFromHead(repoRoot) {
  const diffTree = git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], repoRoot);
  if (diffTree && diffTree.length > 0) return diffTree.map(normalizeRelativePath);

  const headRange = git(['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD~1', 'HEAD'], repoRoot);
  if (headRange && headRange.length > 0) return headRange.map(normalizeRelativePath);

  return [];
}

export function getChangedFiles(repoRoot) {
  const workingTree = git(['diff', '--name-only', '--diff-filter=ACMRTUXB'], repoRoot) ?? [];
  const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMRTUXB'], repoRoot) ?? [];
  const untracked = git(['ls-files', '--others', '--exclude-standard'], repoRoot) ?? [];
  const localFiles = uniq([
    ...workingTree.map(normalizeRelativePath),
    ...staged.map(normalizeRelativePath),
    ...untracked.map(normalizeRelativePath),
  ]);

  if (localFiles.length > 0) return localFiles;

  const files = uniq([
    ...changedFilesFromGithubEvent(repoRoot),
    ...changedFilesFromHead(repoRoot),
  ]);

  if (files.length > 0) return files;

  return (git(['ls-files'], repoRoot) ?? []).map(normalizeRelativePath);
}

export function summarizeClassifications(classifications) {
  const domains = new Map();
  const workstreams = new Map();
  const surfaces = new Map();

  for (const classification of classifications) {
    for (const domain of classification.domains) {
      domains.set(domain.label, (domains.get(domain.label) ?? 0) + 1);
    }

    for (const workstream of classification.workstreams) {
      workstreams.set(workstream.label, (workstreams.get(workstream.label) ?? 0) + 1);
    }

    for (const surface of classification.crossCuttingSurfaces) {
      surfaces.set(surface.label, (surfaces.get(surface.label) ?? 0) + 1);
    }
  }

  return {
    domains: [...domains.entries()].sort((left, right) => right[1] - left[1]),
    workstreams: [...workstreams.entries()].sort((left, right) => right[1] - left[1]),
    crossCuttingSurfaces: [...surfaces.entries()].sort((left, right) => right[1] - left[1]),
  };
}
