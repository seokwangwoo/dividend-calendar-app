const { execSync } = require('child_process');
const logger = require('./logger');

function runTests(cwd, pattern) {
  const cmd = pattern
    ? `npm run test:unit -- --run ${pattern}`
    : `npm run test:unit -- --run`;
  logger.step(`Running tests: ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
}

function runSingleTest(cwd, testFilePath) {
  const relPath = testFilePath.replace(cwd, '').replace(/^\//, '');
  // Use `npm test` (vitest run) instead of `test:unit` so the pattern is the only filter
  const cmd = `npm run test -- --run ${relPath}`;
  logger.step(`Running single test: ${relPath}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
}

module.exports = { runTests, runSingleTest };
