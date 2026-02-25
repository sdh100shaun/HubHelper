#!/usr/bin/env node

/**
 * Git Hooks Uninstaller
 *
 * Removes the commit-msg hook installed by install-git-hooks.js
 *
 * Run: npm run hooks:uninstall
 */

import { copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function uninstallHook() {
  console.log('🗑️  Uninstalling Conventional Commits git hook...\n');

  const hooksDir = join(projectRoot, '.git', 'hooks');
  const hookPath = join(hooksDir, 'commit-msg');
  const backupPath = join(hooksDir, 'commit-msg.backup');

  // Check if hook exists
  if (!existsSync(hookPath)) {
    console.log('ℹ️  No commit-msg hook found. Nothing to uninstall.');
    return;
  }

  // Remove the hook
  console.log('✅ Removing commit-msg hook...');
  unlinkSync(hookPath);

  // Restore backup if it exists
  if (existsSync(backupPath)) {
    console.log('♻️  Restoring previous hook from backup...');
    copyFileSync(backupPath, hookPath);
    unlinkSync(backupPath);
    console.log('✅ Previous hook restored from backup');
  }

  console.log('\n✅ Hook uninstalled successfully!\n');
  console.log('   Commit messages will no longer be validated automatically.');
  console.log('   You can still validate manually with: npm run commit:validate\n');
}

// Run uninstallation
try {
  uninstallHook();
} catch (error) {
  console.error('❌ Error uninstalling hook:', error.message);
  process.exit(1);
}
