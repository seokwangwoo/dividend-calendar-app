const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function getCurrentBranch() {
  return execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
}

function ensureWorktreesDir() {
  const dir = path.resolve('.worktrees');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createWorktree(issueSlug, baseBranch = 'main') {
  ensureWorktreesDir();
  const worktreePath = `.worktrees/issue-${issueSlug}`;
  const absPath = path.resolve(worktreePath);
  if (fs.existsSync(absPath)) {
    logger.warn(`Worktree ${worktreePath} already exists. Reusing.`);
    return absPath;
  }

  logger.step(`Creating worktree at ${worktreePath} from ${baseBranch}`);
  try {
    execSync(`git worktree add -b issue/${issueSlug} ${worktreePath} ${baseBranch}`, {
      stdio: 'inherit',
      shell: true,
    });
  } catch (e) {
    logger.error('Failed to create worktree.');
    throw e;
  }
  return absPath;
}

function removeWorktree(worktreePath) {
  logger.step(`Removing worktree ${worktreePath}`);
  execSync(`git worktree remove ${worktreePath}`, { stdio: 'inherit', shell: true });
}

function commit(worktreePath, message) {
  logger.step(`Committing changes: ${message}`);
  execSync('git add -A', { cwd: worktreePath, stdio: 'inherit', shell: true });
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
    cwd: worktreePath,
    stdio: 'inherit',
    shell: true,
  });
}

module.exports = { getCurrentBranch, createWorktree, removeWorktree, commit };
