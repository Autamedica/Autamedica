import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Node's built-in JUnit reporter omits testcase.file. Smarter Testing needs
// that attribute to map each discovered test atom to its JUnit test results.
const [junitPath, ...atoms] = process.argv.slice(2);
if (!junitPath || atoms.length === 0) {
  console.error('Usage: node run-node-testsuite.mjs <junit.xml> <test-file>...');
  process.exit(2);
}

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let failed = false;
const suites = [];
for (const atom of atoms) {
  if (!/^(?:scripts\/|\.circleci\/)[\w./-]+\.test\.mjs$/.test(atom) || atom.split('/').includes('..')) {
    console.error('Invalid test atom: ' + atom);
    failed = true;
    suites.push('<testsuite name="' + escapeXml(atom) + '" tests="1" failures="1"><testcase name="invalid-test-atom" file="' + escapeXml(atom) + '"><failure message="Invalid test atom"/></testcase></testsuite>');
    continue;
  }

  const result = spawnSync(process.execPath, ['--test', '--test-reporter=junit', atom], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  const raw = result.stdout ?? '';
  const validReport = raw.includes('<testsuites>') && raw.includes('</testsuites>') && raw.includes('<testcase');
  let cases;
  if (validReport) {
    cases = raw.replace(/^\s*<\?xml[^>]*\?>\s*/, '')
      .replace(/^\s*<testsuites>\s*/, '')
      .replace(/\s*<\/testsuites>\s*$/, '')
      .replace(/<testcase\b/g, '<testcase file="' + escapeXml(atom) + '"');
  } else {
    cases = '<testcase name="runner-error" file="' + escapeXml(atom) + '"><failure message="Node test runner did not produce JUnit XML"/></testcase>';
  }
  const count = (cases.match(/<testcase\b/g) ?? []).length;
  const failures = (cases.match(/<failure\b/g) ?? []).length + (cases.match(/<error\b/g) ?? []).length;
  suites.push('<testsuite name="' + escapeXml(atom) + '" tests="' + count + '" failures="' + failures + '">' + cases + '</testsuite>');
  if (result.error || result.status !== 0 || !validReport || failures > 0) {
    failed = true;
    console.error('FAIL ' + atom + ' (exit ' + (result.status ?? 'unavailable') + ')');
    if (result.error) console.error(result.error.message);
  } else {
    console.log('PASS ' + atom + ' (' + count + ' cases)');
  }
}
mkdirSync(dirname(junitPath), { recursive: true });
writeFileSync(junitPath, '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n' + suites.join('\n') + '\n</testsuites>\n');
process.exitCode = failed ? 1 : 0;
