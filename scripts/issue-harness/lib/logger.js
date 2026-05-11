const RESET = '\x1b[0m';
const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(color, label, msg) {
  console.log(`${COLORS[color] || ''}[${label}]${RESET} ${msg}`);
}

module.exports = {
  info: (msg) => log('blue', 'INFO', msg),
  success: (msg) => log('green', 'PASS', msg),
  error: (msg) => log('red', 'FAIL', msg),
  warn: (msg) => log('yellow', 'WARN', msg),
  step: (msg) => log('cyan', 'STEP', msg),
  debug: (msg) => log('gray', 'DEBUG', msg),
};
