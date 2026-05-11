const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function inferTestTarget(issueBody) {
  // Heuristic: extract backticked filenames or module references
  const fileMatches = issueBody.match(/`([^`]+\.(ts|tsx|js|jsx))`/g);
  if (fileMatches) {
    return fileMatches.map(m => m.replace(/`/g, ''));
  }
  return [];
}

function generateTestTemplate(issue, targetFiles) {
  const slug = path.basename(issue.filePath, '.md');
  const describeName = slug.replace(/-/g, ' ');

  let imports = '';
  if (targetFiles.length === 0) {
    imports = '// TODO: import the module under test\n// import { myFunction } from "@/lib/my-module";';
  } else {
    imports = targetFiles
      .map((f, i) => {
        const clean = f.replace(/^src\//, '').replace(/\.(ts|tsx|js|jsx)$/, '');
        return `import * as target${i} from '@/lib/${clean}';`;
      })
      .join('\n');
  }

  return `import { describe, it, expect } from 'vitest';
${imports}

describe('${describeName}', () => {
  it('should reproduce the issue (expected to FAIL before fix)', () => {
    // Arrange: set up the failing condition based on the issue
    // TODO: implement based on issue description

    // Act: execute the function or component behavior

    // Assert: must fail before the implementation fix
    expect(true).toBe(false);
  });

  it('should pass after the fix (regression test)', () => {
    // Arrange

    // Act

    // Assert
    expect(true).toBe(true); // TODO: replace with real regression assertion
  });
});
`;
}

function writeTestFile(issue, worktreePath) {
  const targets = inferTestTarget(issue.body);
  const testContent = generateTestTemplate(issue, targets);
  const slug = path.basename(issue.filePath, '.md');
  const testPath = path.join(worktreePath, 'tests', 'issues', `${slug}.test.ts`);

  fs.mkdirSync(path.dirname(testPath), { recursive: true });
  fs.writeFileSync(testPath, testContent);
  logger.success(`Scaffolded failing test: tests/issues/${path.basename(testPath)}`);
  return testPath;
}

module.exports = { inferTestTarget, generateTestTemplate, writeTestFile };
