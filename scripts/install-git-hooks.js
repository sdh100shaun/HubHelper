#!/usr/bin/env node

/**
 * Optional Git Hooks Installer for Conventional Commits
 *
 * This script installs a commit-msg hook that validates commit messages
 * against the Conventional Commits specification.
 *
 * Run: npm run hooks:install
 */

import { writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const HOOK_SCRIPT = `#!/usr/bin/env sh

# Commitlint hook for conventional commits
# Validates commit messages against conventional commits specification

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

echo "\${YELLOW}🔍 Validating commit message...\${NC}"

# Run commitlint
npx --no-install commitlint --edit "$1"

RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo "\${GREEN}✅ Commit message is valid!\${NC}"
  exit 0
else
  echo ""
  echo "\${RED}❌ Commit message does not follow Conventional Commits format\${NC}"
  echo ""
  echo "Format: <type>(<scope>): <subject>"
  echo ""
  echo "Examples:"
  echo "  feat(auth): add OAuth2 authentication"
  echo "  fix(api): resolve race condition in data fetcher"
  echo "  docs(readme): update installation instructions"
  echo ""
  echo "Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, security"
  echo ""
  echo "See: https://www.conventionalcommits.org/"
  echo ""
  echo "To skip this check (not recommended): git commit --no-verify"
  echo ""
  exit 1
fi
`;

function installHook() {
  console.log('📦 Installing Conventional Commits git hook...\n');

  const gitDir = join(projectRoot, '.git');
  const hooksDir = join(gitDir, 'hooks');
  const hookPath = join(hooksDir, 'commit-msg');

  // Check if .git directory exists
  if (!existsSync(gitDir)) {
    console.error('❌ Error: .git directory not found. Are you in a git repository?');
    process.exit(1);
  }

  // Create hooks directory if it doesn't exist
  if (!existsSync(hooksDir)) {
    console.log('📁 Creating .git/hooks directory...');
    mkdirSync(hooksDir, { recursive: true });
  }

  // Check if hook already exists
  if (existsSync(hookPath)) {
    console.log('⚠️  Warning: commit-msg hook already exists');
    console.log('   Backing up existing hook to commit-msg.backup\n');
    const backupPath = join(hooksDir, 'commit-msg.backup');
    const { copyFileSync } = await import('node:fs');
    copyFileSync(hookPath, backupPath);
  }

  // Write the hook script
  console.log('✍️  Writing commit-msg hook...');
  writeFileSync(hookPath, HOOK_SCRIPT, { encoding: 'utf8' });

  // Make the hook executable
  console.log('🔐 Making hook executable...');
  chmodSync(hookPath, 0o755);

  console.log('\n✅ Conventional Commits hook installed successfully!\n');
  console.log('📝 Your commit messages will now be validated against the Conventional Commits spec.');
  console.log('   Format: <type>(<scope>): <subject>\n');
  console.log('Examples:');
  console.log('  feat(auth): add OAuth2 authentication');
  console.log('  fix(api): resolve race condition in data fetcher');
  console.log('  docs(readme): update installation instructions\n');
  console.log('To uninstall: npm run hooks:uninstall');
  console.log('To skip validation: git commit --no-verify (not recommended)\n');
}

// Run installation
try {
  installHook();
} catch (error) {
  console.error('❌ Error installing hook:', error.message);
  process.exit(1);
}
