const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const levelName =
  process.env.SSH2PROXY_LOG_LEVEL?.toLowerCase() || 'info';

const minLevel = LEVELS[levelName] ?? LEVELS.info;

function formatTime() {
  return new Date().toISOString();
}

function log(level, tag, message, ...args) {
  if (LEVELS[level] < minLevel) return;
  const prefix = `[${formatTime()}] [${level.toUpperCase()}] [${tag}]`;
  const fn = level === 'error' ? console.error : console.log;
  fn(prefix, message, ...args);
}

function createLogger(tag) {
  return {
    debug: (msg, ...a) => log('debug', tag, msg, ...a),
    info: (msg, ...a) => log('info', tag, msg, ...a),
    warn: (msg, ...a) => log('warn', tag, msg, ...a),
    error: (msg, ...a) => log('error', tag, msg, ...a),
  };
}

module.exports = { createLogger };
