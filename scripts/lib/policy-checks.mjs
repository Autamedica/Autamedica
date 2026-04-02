import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const CODE_FILE_ARGS = [
  '--files',
  'apps',
  'packages',
  '-g', '*.ts',
  '-g', '*.tsx',
  '-g', '*.js',
  '-g', '*.jsx',
  '-g', '*.mjs',
  '-g', '*.cjs',
  '-g', '!**/.next/**',
  '-g', '!**/.open-next/**',
  '-g', '!**/.astro/**',
  '-g', '!**/.turbo/**',
  '-g', '!**/build/**',
  '-g', '!**/coverage/**',
  '-g', '!**/dist/**',
  '-g', '!**/node_modules/**',
  '-g', '!**/storybook-static/**',
];

const IGNORED_PROCESS_ENV_PATTERNS = [
  '/__tests__/',
  '/e2e/',
  '/storybook-static/',
];

const IGNORED_PROCESS_ENV_REGEXES = [
  /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/u,
  /(?:^|\/)[^/]+\.config\.[cm]?[jt]sx?$/u,
  /playwright\.config\.[cm]?[jt]s$/u,
];

const ALLOWED_PROCESS_ENV_SUBSTRINGS = [
  'packages/shared/',
  'packages/auth/',
  'packages/telemedicine/',
  'apps/clinical-ai-orchestrator/',
  'apps/signaling-server/',
  'apps/mobile/',
  '/lib/supabase',
  '/lib/env.',
  '/lib/monitoring.',
  '/middleware/',
  '/oauth-handler.',
  '/components/auth/',
  '/components/layout/VSCodeLayout.',
  'apps/web/src/components/ErrorBoundary.tsx',
];

function normalizePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function scriptKindForFile(filePath) {
  const normalized = normalizePath(filePath);
  if (normalized.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (normalized.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (normalized.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function isPropertyAccessLike(node) {
  return ts.isPropertyAccessExpression(node) || (ts.isPropertyAccessChain?.(node) ?? false);
}

function isElementAccessLike(node) {
  return ts.isElementAccessExpression(node) || (ts.isElementAccessChain?.(node) ?? false);
}

function isProcessEnvNode(node) {
  return isPropertyAccessLike(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'process'
    && node.name.text === 'env';
}

function isAllowedProcessEnvUsage(node) {
  const parent = node.parent;
  if (isPropertyAccessLike(parent) && parent.expression === node) {
    return parent.name.text === 'NODE_ENV';
  }

  if (isElementAccessLike(parent) && parent.expression === node) {
    return ts.isStringLiteral(parent.argumentExpression)
      && parent.argumentExpression.text === 'NODE_ENV';
  }

  return false;
}

function describeProcessEnvUsage(node) {
  const parent = node.parent;
  if (isPropertyAccessLike(parent) && parent.expression === node) {
    return `process.env.${parent.name.text}`;
  }

  if (isElementAccessLike(parent) && parent.expression === node && ts.isStringLiteral(parent.argumentExpression)) {
    return `process.env[${JSON.stringify(parent.argumentExpression.text)}]`;
  }

  return 'process.env';
}

function isIgnoredProcessEnvFile(filePath) {
  const normalized = normalizePath(filePath);

  if (IGNORED_PROCESS_ENV_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }

  return IGNORED_PROCESS_ENV_REGEXES.some((pattern) => pattern.test(normalized));
}

function isAllowedProcessEnvFile(filePath) {
  const normalized = normalizePath(filePath);
  return ALLOWED_PROCESS_ENV_SUBSTRINGS.some((pattern) => normalized.includes(pattern));
}

export function getProjectCodeFiles(cwd = process.cwd()) {
  const result = spawnSync('rg', CODE_FILE_ARGS, {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || 'No se pudieron listar archivos del proyecto');
  }

  return (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function findProcessEnvViolations(cwd = process.cwd()) {
  const files = getProjectCodeFiles(cwd);
  const violations = [];

  for (const file of files) {
    const normalized = normalizePath(file);
    if (isIgnoredProcessEnvFile(normalized) || isAllowedProcessEnvFile(normalized)) {
      continue;
    }

    const source = readFileSync(`${cwd}/${file}`, 'utf8');
    const sourceFile = ts.createSourceFile(
      normalized,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForFile(normalized)
    );

    const visit = (node) => {
      if (isProcessEnvNode(node) && !isAllowedProcessEnvUsage(node)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({
          file: normalized,
          line: line + 1,
          column: character + 1,
          usage: describeProcessEnvUsage(node),
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations;
}

export function formatViolations(violations) {
  return violations
    .map(({ file, line, column, usage }) => `${file}:${line}:${column} ${usage}`)
    .join('\n');
}
