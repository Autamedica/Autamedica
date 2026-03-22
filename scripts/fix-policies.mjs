import fs from 'fs';
import path from 'path';

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).map(f => path.join(dir, f));

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;
    
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match CREATE POLICY "policy" ON table
        const matchSingle = line.match(/^(\s*)CREATE\s+POLICY\s+("?[a-zA-Z0-9_ -]+"?[a-zA-Z0-9_]*?)\s+ON\s+([a-zA-Z0-9_."]+)/i);
        if (matchSingle) {
            const prefix = matchSingle[1];
            const policyName = matchSingle[2];
            const tableName = matchSingle[3];

            if (i === 0 || !lines[i-1].match(/DROP\s+POLICY\s+IF\s+EXISTS/i)) {
                lines.splice(i, 0, `${prefix}DROP POLICY IF EXISTS ${policyName} ON ${tableName};`);
                i++; // Skip added line
                changed = true;
            }
            continue;
        }

        // Match CREATE POLICY "policy" (without ON table)
        const matchSplit = line.match(/^(\s*)CREATE\s+POLICY\s+("?[a-zA-Z0-9_ -]+"?[a-zA-Z0-9_]*?)\s*$/i);
        if (matchSplit) {
            let foundOn = false;
            let tableName = '';
            for (let j = i + 1; j < lines.length && j < i + 5; j++) {
                const _nextLineMatch = lines[j].match(/^\s+(?:ON\s+)?([a-zA-Z0-9_."]+)/i);
                if (lines[j].match(/^\s*ON\s+([a-zA-Z0-9_."]+)/i)) {
                    tableName = lines[j].match(/^\s*ON\s+([a-zA-Z0-9_."]+)/i)[1];
                    foundOn = true;
                    break;
                }
            }

            if (foundOn) {
                const prefix = matchSplit[1];
                const policyName = matchSplit[2];
                if (i === 0 || !lines[i-1].match(/DROP\s+POLICY\s+IF\s+EXISTS/i)) {
                    lines.splice(i, 0, `${prefix}DROP POLICY IF EXISTS ${policyName} ON ${tableName};`);
                    i++;
                    changed = true;
                }
            }
        }
    }

    if (changed) {
        fs.writeFileSync(file, lines.join('\n'));
        console.log(`Fixed ${file}`);
    }
});
