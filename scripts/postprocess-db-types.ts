#!/usr/bin/env npx tsx
/**
 * Post-process Supabase-generated database types.
 * Fixes known incorrect type mappings from `supabase gen types`.
 *
 * Usage:
 *   pnpm types:db:postprocess
 *
 * Chained after type generation:
 *   supabase gen types ... > database.types.ts && tsx scripts/postprocess-db-types.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const TYPES_PATH = 'packages/shared/src/types/database.types.ts';
const TYPES_PATH_ALT = 'packages/types/src/supabase/database.types.ts';

interface TypeFix {
    description: string;
    pattern: RegExp;
    replacement: string;
}

/**
 * Registry of known incorrect types from Supabase CLI.
 * Add new entries here as issues are discovered.
 */
const KNOWN_FIXES: TypeFix[] = [
    {
        description: 'duration_minutes should be number (PostgreSQL INTEGER mapped as string)',
        pattern: /duration_minutes:\s*string/g,
        replacement: 'duration_minutes: number',
    },
    {
        description: 'duration_minutes optional should be number',
        pattern: /duration_minutes\?:\s*string/g,
        replacement: 'duration_minutes?: number',
    },
    {
        description: 'latitude should be number (PostgreSQL NUMERIC mapped as string)',
        pattern: /latitude:\s*string/g,
        replacement: 'latitude: number',
    },
    {
        description: 'latitude optional should be number',
        pattern: /latitude\?:\s*string/g,
        replacement: 'latitude?: number',
    },
    {
        description: 'longitude should be number (PostgreSQL NUMERIC mapped as string)',
        pattern: /longitude:\s*string/g,
        replacement: 'longitude: number',
    },
    {
        description: 'longitude optional should be number',
        pattern: /longitude\?:\s*string/g,
        replacement: 'longitude?: number',
    },
    {
        description: 'consultation_fee should be number (PostgreSQL NUMERIC mapped as string)',
        pattern: /consultation_fee:\s*string/g,
        replacement: 'consultation_fee: number',
    },
    {
        description: 'consultation_fee optional should be number',
        pattern: /consultation_fee\?:\s*string/g,
        replacement: 'consultation_fee?: number',
    },
];

function processFile(typesPath: string): number {
    const fullPath = path.resolve(process.cwd(), typesPath);

    if (!fs.existsSync(fullPath)) {
        return 0;
    }

    let content = fs.readFileSync(fullPath, 'utf-8');
    const appliedFixes: string[] = [];

    for (const fix of KNOWN_FIXES) {
        const matches = content.match(fix.pattern);
        if (matches && matches.length > 0) {
            content = content.replace(fix.pattern, fix.replacement);
            appliedFixes.push(`${fix.description} (${matches.length} occurrences)`);
        }
    }

    if (appliedFixes.length === 0) {
        return 0;
    }

    fs.writeFileSync(fullPath, content, 'utf-8');

    console.log(`🔧 Post-processed ${typesPath}:`);
    for (const fix of appliedFixes) {
        console.log(`   ✅ ${fix}`);
    }
    return appliedFixes.length;
}

function main() {
    const paths = [TYPES_PATH, TYPES_PATH_ALT];
    let totalFixes = 0;

    for (const p of paths) {
        totalFixes += processFile(p);
    }

    if (totalFixes === 0) {
        console.log('✅ No type fixes needed — database.types.ts files are already correct.');
    } else {
        console.log(`\n✅ Applied ${totalFixes} fix(es) total.`);
    }
}

main();
