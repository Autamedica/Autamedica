#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const errors = [];

function walkFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build' || entry.name === '.git') continue;
      walkFiles(full, predicate, out);
    } else if (predicate(full, entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

// 1. Edge Functions entrypoint check
function checkEdgeFunctionEntrypoints() {
  const fnRoot = path.join(ROOT, 'supabase/functions');
  if (!fs.existsSync(fnRoot)) return;
  let checked = 0;
  for (const entry of fs.readdirSync(fnRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_shared' || entry.name === 'tests') continue;
    const indexPath = path.join(fnRoot, entry.name, 'index.ts');
    if (!fs.existsSync(indexPath)) {
      errors.push(`[edge-entrypoint] Missing index.ts for function "${entry.name}"`);
      continue;
    }
    checked++;
    const content = fs.readFileSync(indexPath, 'utf8');
    if (!/(?:Deno\.)?serve\s*\(/.test(content)) {
      errors.push(`[edge-entrypoint] ${rel(indexPath)} does not register a Deno.serve() / serve() handler`);
    }
  }
  console.log(`[boundary-check] Checked ${checked} Edge Function entrypoints`);
}

// 2. Active SECURITY DEFINER SQL guard check (avoid `current_user` inside SECURITY DEFINER)
function checkSecurityDefinerCurrentUser() {
  const migDir = path.join(ROOT, 'supabase/migrations');
  if (!fs.existsSync(migDir)) return;
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  const activeFunctions = new Map();

  for (const file of files) {
    const filePath = path.join(migDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    // Match CREATE [OR REPLACE] FUNCTION schema.name(...) ... AS $tag$ ... $tag$;
    const fnRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_."]+)\s*\(([^)]*)\)[\s\S]*?\bAS\s+(\$[a-zA-Z0-9_]*\$)([\s\S]*?)\3/gi;
    let match;
    while ((match = fnRegex.exec(sql)) !== null) {
      const fnName = match[1].replace(/"/g, '').toLowerCase();
      const rawArgs = match[2].replace(/\s+/g, ' ').trim().toLowerCase();
      // Key by function name + parameter count/signature to handle replacements cleanly
      const sigKey = `${fnName}(${rawArgs.split(',').map((a) => a.trim().split(/\s+/).pop() || '').join(',')})`;
      const header = match[0].slice(0, match[0].indexOf(match[3]));
      const isSecurityDefiner = /\bSECURITY\s+DEFINER\b/i.test(header);
      const body = match[4];
      activeFunctions.set(sigKey, {
        fnName,
        file,
        isSecurityDefiner,
        body,
      });
    }
  }

  for (const [sigKey, info] of activeFunctions.entries()) {
    if (!info.isSecurityDefiner) continue;
    const strippedBody = info.body
      .split('\n')
      .filter((line) => !line.includes('boundary-check: allow-current-user') && !line.trim().startsWith('--'))
      .join('\n');
    if (/\bcurrent_user\b/i.test(strippedBody)) {
      errors.push(
        `[sql-security-definer] Active SECURITY DEFINER function ${sigKey} (latest in ${info.file}) references current_user; inside SECURITY DEFINER current_user is the owner ('postgres'). Inspect request.jwt.claim.role or auth.uid() instead.`,
      );
    }
  }
  console.log(`[boundary-check] Checked ${activeFunctions.size} active SQL function definitions`);
}

// 3. PostgREST column existence check in apps/web/src
function loadSchemaColumns() {
  const tables = new Map();
  const addCols = (tableName, cols) => {
    const key = tableName.toLowerCase();
    if (!tables.has(key)) tables.set(key, new Set());
    const set = tables.get(key);
    for (const c of cols) set.add(c.toLowerCase());
  };

  // Parse public.Tables in packages/types/src/supabase/database.types.ts
  const typesPath = path.join(ROOT, 'packages/types/src/supabase/database.types.ts');
  if (fs.existsSync(typesPath)) {
    const src = fs.readFileSync(typesPath, 'utf8');
    const lines = src.split('\n');
    let inPublic = false;
    let inTables = false;
    let currentTable = null;
    let inRow = false;
    let braceDepth = 0;
    let rowDepth = 0;

    for (const line of lines) {
      if (!inPublic && /^\s{2}public:\s*\{/.test(line)) {
        inPublic = true;
        continue;
      }
      if (!inPublic) continue;

      if (!inTables && /^\s{4}Tables:\s*\{/.test(line)) {
        inTables = true;
        braceDepth = 1;
        continue;
      }
      if (!inTables) continue;

      for (const ch of line) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      if (braceDepth <= 0) break;

      const tableMatch = line.match(/^\s{6}([a-zA-Z0-9_]+):\s*\{/);
      if (tableMatch) {
        currentTable = tableMatch[1];
        inRow = false;
        continue;
      }
      if (currentTable && /^\s{8}Row:\s*\{/.test(line)) {
        inRow = true;
        rowDepth = braceDepth;
        continue;
      }
      if (inRow && braceDepth < rowDepth) {
        inRow = false;
        continue;
      }
      if (inRow && braceDepth === rowDepth) {
        const colMatch = line.match(/^\s{10}([a-zA-Z0-9_]+)\??:/);
        if (colMatch) addCols(currentTable, [colMatch[1]]);
      }
    }
  }

  // Augment with CREATE TABLE / ALTER TABLE ADD COLUMN from supabase/migrations/*.sql
  const migDir = path.join(ROOT, 'supabase/migrations');
  if (fs.existsSync(migDir)) {
    const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_"]+)\s*\(([\s\S]*?)\)\s*;/gi;
      let m;
      while ((m = createRegex.exec(sql)) !== null) {
        const tbl = m[1].replace(/"/g, '');
        const body = m[2];
        for (const rawLine of body.split('\n')) {
          const line = rawLine.replace(/--.*$/, '').trim();
          if (!line || /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|\))/i.test(line)) continue;
          const colMatch = line.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+[a-zA-Z]/);
          if (colMatch) addCols(tbl, [colMatch[1]]);
        }
      }

      const alterBlockRegex = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_"]+)\s+([\s\S]*?);/gi;
      while ((m = alterBlockRegex.exec(sql)) !== null) {
        const tbl = m[1].replace(/"/g, '');
        const clauses = m[2];
        const addColRegex = /\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_"]*)\s+(?!CONSTRAINT\b|PRIMARY\b|UNIQUE\b|CHECK\b|FOREIGN\b|EXCLUDE\b)[a-zA-Z"]/gi;
        let am;
        while ((am = addColRegex.exec(clauses)) !== null) {
          addCols(tbl, [am[1].replace(/"/g, '')]);
        }
      }
    }
  }

  return tables;
}

function stripEmbeddedRelations(selectExpr) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < selectExpr.length; i++) {
    const ch = selectExpr[i];
    if (ch === '(') {
      depth++;
      // Backtrack and remove relation token (e.g., `patient:patients!inner`)
      out = out.replace(/[a-zA-Z0-9_!:.\-\s]+$/, '');
    } else if (ch === ')') {
      if (depth > 0) depth--;
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}

function checkWebPostgrestColumns() {
  const schemaCols = loadSchemaColumns();
  const webSrc = path.join(ROOT, 'apps/web/src');
  if (!fs.existsSync(webSrc)) return;
  const files = walkFiles(
    webSrc,
    (full, name) => /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(full),
  );

  // Match .from('table') followed closely by .select('cols')
  const chainRegex = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)[\s\S]{0,180}?\.select\(\s*(['"`])([\s\S]*?)\2/g;
  let checkedQueries = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = chainRegex.exec(content)) !== null) {
      const table = match[1].toLowerCase();
      const rawSelect = match[3];
      if (!schemaCols.has(table)) continue; // skip views / unmapped tables
      if (rawSelect.includes('${')) continue; // skip dynamic template interpolation

      checkedQueries++;
      const colsAllowed = schemaCols.get(table);
      const topLevel = stripEmbeddedRelations(rawSelect);
      for (const rawToken of topLevel.split(',')) {
        const trimmed = rawToken.trim();
        if (!trimmed || trimmed === '*' || trimmed.endsWith('.*')) continue;
        // Handle `alias:column_name` or `column_name.agg()` or JSON path `col->foo`
        const withoutAlias = trimmed.includes(':') ? trimmed.split(':').pop().trim() : trimmed;
        const baseCol = withoutAlias.split(/[-.>(]/)[0].trim().toLowerCase();
        if (!baseCol || baseCol === '*' || baseCol === 'count') continue;
        if (!colsAllowed.has(baseCol)) {
          const lineNum = content.slice(0, match.index).split('\n').length;
          errors.push(
            `[postgrest-column] ${rel(file)}:${lineNum} selects non-existent column "${baseCol}" on table "${table}"`,
          );
        }
      }
    }
  }
  console.log(`[boundary-check] Checked ${checkedQueries} PostgREST .select() queries across ${schemaCols.size} known tables`);
}

// 4. Android string format positional placeholder parity
function checkAndroidFormatStrings() {
  const resDir = path.join(ROOT, 'apps/android/app/src/main/res/values');
  const javaDir = path.join(ROOT, 'apps/android/app/src/main/java');
  if (!fs.existsSync(resDir) || !fs.existsSync(javaDir)) return;

  const formatCounts = new Map();
  for (const file of fs.readdirSync(resDir)) {
    if (!/^strings.*\.xml$/.test(file)) continue;
    const xml = fs.readFileSync(path.join(resDir, file), 'utf8');
    const strRegex = /<string\s+[^>]*name="([a-zA-Z0-9_]+)"[^>]*>([\s\S]*?)<\/string>/g;
    let m;
    while ((m = strRegex.exec(xml)) !== null) {
      const key = m[1];
      const val = m[2];
      let maxIdx = 0;
      const phRegex = /%(\d+)\$[sdfoxegca]/gi;
      let ph;
      while ((ph = phRegex.exec(val)) !== null) {
        const idx = Number(ph[1]);
        if (idx > maxIdx) maxIdx = idx;
      }
      if (maxIdx > 0) formatCounts.set(key, maxIdx);
    }
  }

  const ktFiles = walkFiles(javaDir, (_full, name) => name.endsWith('.kt'));
  let checkedCalls = 0;
  for (const file of ktFiles) {
    const src = fs.readFileSync(file, 'utf8');
    const callRegex = /\b(?:getString|stringResource)\(\s*R\.string\.([a-zA-Z0-9_]+)\s*(,|\))/g;
    let m;
    while ((m = callRegex.exec(src)) !== null) {
      const key = m[1];
      const expected = formatCounts.get(key);
      if (!expected) continue;
      checkedCalls++;
      // Extract arguments up to matching ')'
      let depth = 1;
      let i = m.index + m[0].indexOf('(') + 1;
      let argCount = 0;
      let hasSpread = false;
      let inStr = false;
      let escape = false;
      let currentArg = '';
      for (; i < src.length && depth > 0; i++) {
        const ch = src[i];
        if (escape) {
          escape = false;
          currentArg += ch;
          continue;
        }
        if (ch === '\\' && inStr) {
          escape = true;
          currentArg += ch;
          continue;
        }
        if (ch === '"') {
          inStr = !inStr;
          currentArg += ch;
          continue;
        }
        if (inStr) {
          currentArg += ch;
          continue;
        }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') {
          depth--;
          if (depth === 0) {
            if (currentArg.trim()) argCount++;
            break;
          }
        } else if (ch === ',' && depth === 1) {
          if (currentArg.trim()) argCount++;
          currentArg = '';
          continue;
        }
        currentArg += ch;
      }
      if (currentArg.includes('*')) hasSpread = true;
      const providedFormatArgs = Math.max(0, argCount - 1); // exclude R.string.<key>
      if (!hasSpread && providedFormatArgs < expected) {
        const lineNum = src.slice(0, m.index).split('\n').length;
        errors.push(
          `[android-format-args] ${rel(file)}:${lineNum} calls R.string.${key} with ${providedFormatArgs} args, but XML expects %${expected}$`,
        );
      }
    }
  }
  console.log(`[boundary-check] Checked ${checkedCalls} formatted Android string call sites (${formatCounts.size} formatted resources)`);
}

checkEdgeFunctionEntrypoints();
checkSecurityDefinerCurrentUser();
checkWebPostgrestColumns();
checkAndroidFormatStrings();

if (errors.length > 0) {
  console.error(`\n[boundary-check] FAILED with ${errors.length} violation(s):`);
  for (const err of errors) console.error(' -', err);
  process.exit(1);
}

console.log('[boundary-check] ALL BOUNDARY CONTRACTS PASSED');
