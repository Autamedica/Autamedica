import fs from 'fs';

// Leer glosarios
const glossaryDir = 'docs/glossary';
let glosario = '';
const glossaryFiles = fs.readdirSync(glossaryDir).filter(f => f.endsWith('.md'));
console.log(`📚 Leyendo ${glossaryFiles.length} glosarios modulares...`);

for (const file of glossaryFiles) {
  const content = fs.readFileSync(`${glossaryDir}/${file}`, 'utf8');
  glosario += content + '\n\n';
}

// Simular extracción
const fullSectionRegex = /## @autamedica\/([^\n]+)\n([\s\S]*?)(?=## @autamedica\/|## [🎯📚]|---\n\n##|$)/gu;
let fullMatch;
const packages = {};
let matchCount = 0;

while ((fullMatch = fullSectionRegex.exec(glosario)) !== null) {
  matchCount++;
  const packageName = fullMatch[1].trim();
  const sectionContent = fullMatch[2] || '';

  // Count code blocks
  const codeBlocks = (sectionContent.match(/```typescript/g) || []).length;

  packages[packageName] = {
    contentLength: sectionContent.length,
    codeBlocks
  };
}

console.log(`\n🔍 Encontradas ${matchCount} secciones de packages:\n`);
Object.keys(packages).forEach(pkg => {
  const info = packages[pkg];
  console.log(`- @autamedica/${pkg}: ${info.contentLength} chars, ${info.codeBlocks} code blocks`);
});

// Check what's documented for @autamedica/shared specifically
const sharedMatch = glosario.match(/## @autamedica\/shared\n([\s\S]*?)(?=## @autamedica\/|## [🎯📚]|$)/u);
if (sharedMatch) {
  const sharedContent = sharedMatch[1];
  const exportMatches = sharedContent.match(/export \{[\s\S]*?\}/g) || [];
  console.log(`\n📦 @autamedica/shared tiene ${exportMatches.length} bloques export {}`);

  if (exportMatches.length > 0) {
    const firstBlock = exportMatches[0].substring(0, 200);
    console.log(`\nPrimer bloque: ${firstBlock}...`);
  }
}
