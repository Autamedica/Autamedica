#!/usr/bin/env node

import { execSync } from 'node:child_process';

const debtPattern = /\b(TODO|FIXME|XXX)\b/i;
const referencePattern =
  /(#\d+|[A-Z]{2,12}-\d+|https?:\/\/\S+|ticket[:\s]+[A-Za-z0-9-]+)/i;

function isCommentLine(content, filePath) {
  const trimmed = content.trimStart();
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) {
    return /^#/.test(trimmed);
  }

  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return /^(\/\/|\/\*|\*)/.test(trimmed);
  }

  if (lower.endsWith('.sql')) {
    return /^--/.test(trimmed);
  }

  if (lower.endsWith('.md') || lower.endsWith('.mdx')) {
    return true;
  }

  return /^(#|\/\/|\/\*|\*|<!--)/.test(trimmed);
}

function getStagedAddedLines() {
  const output = execSync('git diff --cached --no-color -U0', { encoding: 'utf8' });
  const lines = output.split('\n');

  const issues = [];
  let currentFile = '';
  let currentNewLine = 0;

  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice('+++ b/'.length).trim();
      continue;
    }

    if (line.startsWith('@@')) {
      // Example: @@ -10,0 +11,3 @@
      const match = line.match(/\+(\d+)(?:,(\d+))?/);
      currentNewLine = match ? Number(match[1]) : 0;
      continue;
    }

    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }

    const content = line.slice(1);
    const hasDebt = debtPattern.test(content);
    if (!hasDebt || !isCommentLine(content, currentFile)) {
      currentNewLine += 1;
      continue;
    }

    const hasReference = referencePattern.test(content);
    if (!hasReference) {
      issues.push({
        file: currentFile,
        line: currentNewLine,
        content: content.trim(),
      });
    }
    currentNewLine += 1;
  }

  return issues;
}

try {
  const issues = getStagedAddedLines();

  if (issues.length === 0) {
    console.log('✅ Staged debt tags: OK');
    process.exit(0);
  }

  console.error('❌ TODO/FIXME/XXX sin referencia detectados en staged:');
  for (const issue of issues) {
    console.error(`   - ${issue.file}:${issue.line} -> ${issue.content}`);
  }
  console.error('');
  console.error(
    'Agrega referencia de ticket/issue (ej: AUT-123, #456, ticket:AUTH-1 o URL) en la misma línea.'
  );
  process.exit(1);
} catch (error) {
  console.error('❌ Error ejecutando check-staged-debt:', error.message);
  process.exit(1);
}
