const fs = require('fs');
const path = require('path');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const levelName =
  process.env.SSH2PROXY_LOG_LEVEL?.toLowerCase() || 'debug';

const minLevel = LEVELS[levelName] ?? LEVELS.debug;

// 文件日志：默认开启，写到 logs/app.log
const fileLogEnabled = process.env.SSH2PROXY_LOG_FILE !== 'false';
const fileLogPath = process.env.SSH2PROXY_LOG_FILE_PATH
  || path.join(process.cwd(), 'logs', 'app.log');

let fileStream = null;

if (fileLogEnabled) {
  fs.mkdirSync(path.dirname(fileLogPath), { recursive: true });
  fileStream = fs.createWriteStream(fileLogPath, { flags: 'a' });
}

function formatTime() {
  return new Date().toISOString();
}

function log(level, tag, message, ...args) {
  if (LEVELS[level] < minLevel) return;
  const prefix = `[${formatTime()}] [${level.toUpperCase()}] [${tag}]`;
  const extra = args.length ? ' ' + args.map(String).join(' ') : '';
  const line = `${prefix} ${message}${extra}`;

  const fn = level === 'error' ? console.error : console.log;
  fn(line);

  if (fileStream) {
    fileStream.write(line + '\n');
  }
}

function createLogger(tag) {
  return {
    debug: (msg, ...a) => log('debug', tag, msg, ...a),
    info:  (msg, ...a) => log('info',  tag, msg, ...a),
    warn:  (msg, ...a) => log('warn',  tag, msg, ...a),
    error: (msg, ...a) => log('error', tag, msg, ...a),
  };
}

module.exports = { createLogger };
