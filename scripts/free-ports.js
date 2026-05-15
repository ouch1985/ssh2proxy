#!/usr/bin/env node
/** 根据 config 释放已占用的本地端口 */
const { execSync } = require('child_process');
const path = require('path');

process.chdir(path.join(__dirname, '..'));
const { loadConfig, isEnabled } = require('../src/config');

const config = loadConfig();
const ports = new Set();

for (const p of config.proxies) {
  if (isEnabled(p) && p.proxy?.port) ports.add(p.proxy.port);
}
for (const s of config.sites || []) {
  if (isEnabled(s) && s.port) ports.add(s.port);
}

for (const port of ports) {
  try {
    const out = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (!out) continue;
    for (const pid of out.split('\n')) {
      console.log(`释放端口 ${port} (PID ${pid})`);
      try {
        execSync(`kill ${pid}`);
      } catch {
        execSync(`kill -9 ${pid}`);
      }
    }
  } catch {
    // 端口空闲
  }
}
