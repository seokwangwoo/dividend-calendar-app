const fs = require('fs');
const path = require('path');

function parseIssue(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const frontmatter = {};
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    fmMatch[1].split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        frontmatter[k] = v;
      }
    });
  }
  const body = content.replace(/^---\n[\s\S]*?\n---/, '').trim();
  return { frontmatter, body, filePath };
}

function listActiveIssues(baseDir = 'docs/issue/active') {
  const dir = path.resolve(baseDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dir, f));
}

module.exports = { parseIssue, listActiveIssues };
