const { execSync } = require('child_process');
const logger = require('./logger');

function runLint(cwd) {
  logger.step('Running ESLint...');
  try {
    execSync('npm run lint', { cwd, stdio: 'inherit', shell: true });
    return true;
  } catch (e) {
    return false;
  }
}

function runTypeCheck(cwd) {
  logger.step('Running TypeScript type check...');
  try {
    execSync('npm run typecheck', { cwd, stdio: 'inherit', shell: true });
    return true;
  } catch (e) {
    return false;
  }
}

function runAllUnitTests(cwd) {
  logger.step('Running all unit tests...');
  try {
    execSync('npm run test:unit -- --run', { cwd, stdio: 'inherit', shell: true });
    return true;
  } catch (e) {
    return false;
  }
}

function runFormatter(cwd) {
  logger.step('Running formatter (eslint --fix)...');
  try {
    execSync('npx eslint . --fix --max-warnings=0', { cwd, stdio: 'inherit', shell: true });
    return true;
  } catch (e) {
    logger.warn('Formatter had issues, but continuing.');
    return false;
  }
}

module.exports = { runLint, runTypeCheck, runAllUnitTests, runFormatter };
