// Simple logger utility

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function getTimestamp() {
  return new Date().toISOString();
}

function log(level, message, ...args) {
  const timestamp = getTimestamp();
  let color = colors.reset;
  let prefix = '';

  switch (level) {
    case 'info':
      color = colors.green;
      prefix = 'ℹ️';
      break;
    case 'warn':
      color = colors.yellow;
      prefix = '⚠️';
      break;
    case 'error':
      color = colors.red;
      prefix = '❌';
      break;
    case 'debug':
      color = colors.blue;
      prefix = '🐞';
      break;
    case 'success':
      color = colors.green;
      prefix = '✅';
      break;
    default:
      prefix = '📌';
  }

  console.log(`${color}[${timestamp}] ${prefix} ${message}${colors.reset}`, ...args);
}

module.exports = {
  info: (msg, ...args) => log('info', msg, ...args),
  warn: (msg, ...args) => log('warn', msg, ...args),
  error: (msg, ...args) => log('error', msg, ...args),
  debug: (msg, ...args) => log('debug', msg, ...args),
  success: (msg, ...args) => log('success', msg, ...args),
  log: (msg, ...args) => log('log', msg, ...args)
};