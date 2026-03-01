#!/usr/bin/env node

/**
 * Watch ~/.claude/agentic-config.json for changes and auto-sync agents
 * Útil para desarrollo: mantiene agentes sincronizados en tiempo real
 */

import { watch } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const CONFIG_PATH = join(homedir(), '.claude', 'agentic-config.json');

console.log('👀 Watching for changes in:', CONFIG_PATH);
console.log('🤖 Agents will auto-sync when config changes...\n');

let timeout;

watch(CONFIG_PATH, (eventType, _filename) => {
  if (eventType === 'change') {
    // Debounce: wait 500ms after last change
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      console.log('\n📝 Config changed, re-registering agents...');
      try {
        execSync('node scripts/register-claude-agents.mjs', {
          cwd: '/root/Autamedica',
          stdio: 'inherit'
        });
        // Mantener también agentes equivalentes para ChatGPT/OpenAI
        try {
          execSync('node scripts/register-openai-agents.mjs', {
            cwd: '/root/Autamedica',
            stdio: 'inherit'
          });
        } catch (e) {
          console.error('❌ Error syncing OpenAI agents:', e.message);
        }
        console.log('✅ Agents synchronized!\n');
        console.log('👀 Watching for more changes...');
      } catch (error) {
        console.error('❌ Error syncing agents:', error.message);
      }
    }, 500);
  }
});

console.log('Press Ctrl+C to stop watching...');
