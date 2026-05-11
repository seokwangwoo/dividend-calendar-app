#!/usr/bin/env node
const path = require('path');
const { execSync } = require('child_process');
const { parseIssue } = require('./lib/issue');
const { createWorktree, commit, getCurrentBranch } = require('./lib/git');
const { writeTestFile } = require('./lib/scaffold');
const { runTests, runSingleTest } = require('./lib/test');
const { runLint, runTypeCheck, runAllUnitTests, runFormatter } = require('./lib/verify');
const logger = require('./lib/logger');

const repoRoot = path.resolve(__dirname, '../..');
const [,, command, ...args] = process.argv;

function printUsage() {
  console.log(`
Usage: node scripts/issue-harness/index.js <command> [args]

Commands:
  init <issue-file>              Parse issue, create git worktree, scaffold failing test
  cycle [path/to/test.ts]        Run TDD cycle (expects fail -> fix -> pass)
  verify                         Run lint, typecheck, formatter, and all unit tests
  finish "<commit-message>"      Run supabase deploy (if configured) and git commit

Example:
  node scripts/issue-harness/index.js init docs/issue/active/20260510-xxx.md
  cd .worktrees/issue-20260510-xxx
  node ../../scripts/issue-harness/index.js cycle
  node ../../scripts/issue-harness/index.js verify
  node ../../scripts/issue-harness/index.js finish "fix: resolve xxx"
`);
}

if (!command) {
  printUsage();
  process.exit(0);
}

if (command === 'init') {
  const issueFile = args[0];
  if (!issueFile) {
    logger.error('Please provide an issue file path, e.g. docs/issue/active/20260510-xxx.md');
    process.exit(1);
  }

  const issuePath = path.resolve(issueFile);
  if (!require('fs').existsSync(issuePath)) {
    logger.error(`Issue file not found: ${issuePath}`);
    process.exit(1);
  }

  const issue = parseIssue(issuePath);
  const slug = path.basename(issuePath, '.md');

  logger.info(`Initializing harness for issue: ${slug}`);
  logger.debug(`Issue priority: ${issue.frontmatter.priority || 'unknown'}`);

  // 1. Create git worktree
  const currentBranch = getCurrentBranch();
  const worktreePath = createWorktree(slug, currentBranch);

  // 2. Scaffold failing test
  const testFile = writeTestFile(issue, worktreePath);

  // 3. Initial test run (MUST fail for TDD)
  logger.step('Running initial test (expected to FAIL)');
  const result = runSingleTest(worktreePath, testFile);

  if (result.success) {
    logger.error('Initial test passed, but it should have failed. Review the scaffolded test.');
    logger.info('TIP: The test likely has a placeholder assertion that is too permissive.');
  } else {
    logger.success('Initial test failed as expected. TDD harness is ready.');
    logger.info(`
========================================
AI TDD Workflow
========================================
Worktree : ${worktreePath}
Branch   : issue/${slug}
Test     : ${testFile.replace(worktreePath + '/', '')}

Next steps:
1. cd ${worktreePath}
2. Edit source code (NOT the test) to fix the issue.
3. Run: node ../../scripts/issue-harness/index.js cycle tests/issues/${path.basename(testFile)}
4. After green, run: node ../../scripts/issue-harness/index.js verify
5. Finally, run: node ../../scripts/issue-harness/index.js finish "fix: resolve ${slug}"
`);
  }
}

else if (command === 'cycle') {
  const cwd = process.cwd();
  const pattern = args[0];

  logger.step('Running TDD cycle in ' + cwd);
  const result = pattern ? runSingleTest(cwd, pattern) : runTests(cwd);

  if (result.success) {
    logger.success('Tests are GREEN. Proceed to verify step.');
  } else {
    logger.error('Tests are still RED. Fix the implementation and run cycle again.');
    process.exit(1);
  }
}

else if (command === 'verify') {
  const cwd = process.cwd();
  logger.info('Starting full verification pipeline...');

  const fmt = runFormatter(cwd);
  const lint = runLint(cwd);
  const type = runTypeCheck(cwd);
  const tests = runAllUnitTests(cwd);

  if (fmt && lint && type && tests) {
    logger.success('All verification checks passed (formatter, lint, typecheck, unit tests).');
  } else {
    if (!fmt) logger.warn('Formatter had issues.');
    if (!lint) logger.error('Lint check failed.');
    if (!type) logger.error('Type check failed.');
    if (!tests) logger.error('Unit tests failed.');
    process.exit(1);
  }
}

else if (command === 'finish') {
  const message = args.join(' ') || 'fix: resolve issue';
  const cwd = process.cwd();

  // Supabase deploy (best-effort: if script exists or supabase CLI is present)
  try {
    const pkgPath = path.join(cwd, 'package.json');
    const pkg = require(pkgPath);
    if (pkg.scripts && pkg.scripts['supabase:deploy']) {
      logger.step('Running supabase:deploy from package.json...');
      execSync('npm run supabase:deploy', { cwd, stdio: 'inherit', shell: true });
    } else if (pkg.scripts && pkg.scripts['db:deploy']) {
      logger.step('Running db:deploy from package.json...');
      execSync('npm run db:deploy', { cwd, stdio: 'inherit', shell: true });
    } else {
      logger.warn('No supabase:deploy / db:deploy script found. Skipping.');
      logger.info('If you need Supabase deploy, add a script to package.json.');
    }
  } catch (e) {
    logger.warn('Supabase deploy step skipped or failed. Continuing to commit.');
  }

  commit(cwd, message);
  logger.success('Issue harness cycle complete!');
  logger.info('You may now push the branch and create a PR from the worktree.');
}

else {
  logger.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}
