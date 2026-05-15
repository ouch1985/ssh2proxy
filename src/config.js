const fs = require('fs');
const path = require('path');

function readConfigFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`配置文件不存在: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  return JSON.parse(raw);
}

function parseInlineJson() {
  const inline = process.env.SSH2PROXY_CONFIG_JSON;
  if (!inline) return null;
  return JSON.parse(inline);
}

function isEnabled(entry) {
  return entry.enabled !== false;
}

function validateProxy(entry, index) {
  if (!isEnabled(entry)) return;

  const label = entry.name || `proxies[${index}]`;
  if (!entry.ssh?.host) {
    throw new Error(`${label}: 缺少 ssh.host`);
  }
  if (!entry.ssh?.username) {
    throw new Error(`${label}: 缺少 ssh.username`);
  }
  const hasPassword = Boolean(entry.ssh.password);
  const hasKey = Boolean(entry.ssh.privateKey);
  if (!hasPassword && !hasKey) {
    throw new Error(`${label}: 需配置 ssh.password 或 ssh.privateKey`);
  }
  if (!entry.proxy?.port) {
    throw new Error(`${label}: 缺少 proxy.port`);
  }
}

function validateSite(entry, index, proxyNames) {
  if (!isEnabled(entry)) return;

  const label = entry.name || `sites[${index}]`;
  if (!entry.proxy) {
    throw new Error(`${label}: 缺少 proxy（需指定 proxies 中的 name）`);
  }
  if (!proxyNames.has(entry.proxy)) {
    throw new Error(`${label}: proxy "${entry.proxy}" 不存在于 proxies 配置中`);
  }
  if (!entry.port) {
    throw new Error(`${label}: 缺少 port`);
  }
  if (!entry.target) {
    throw new Error(`${label}: 缺少 target`);
  }
  let url;
  try {
    url = new URL(entry.target);
  } catch {
    throw new Error(`${label}: target 不是合法 URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label}: target 仅支持 http:// 或 https://`);
  }
}

function collectPorts(config) {
  const ports = new Map();

  const add = (port, label) => {
    if (ports.has(port)) {
      throw new Error(`端口 ${port} 被重复使用（${ports.get(port)} 与 ${label}）`);
    }
    ports.set(port, label);
  };

  config.proxies.forEach((entry, i) => {
    if (!isEnabled(entry)) return;
    const label = entry.name || `proxies[${i}]`;
    add(entry.proxy.port, label);
  });

  (config.sites || []).forEach((entry, i) => {
    if (!isEnabled(entry)) return;
    const label = entry.name || `sites[${i}]`;
    add(entry.port, label);
  });

  return ports;
}

function normalize(config) {
  if (!config.proxies || !Array.isArray(config.proxies)) {
    throw new Error('配置需包含 proxies 数组');
  }
  if (config.proxies.length === 0) {
    throw new Error('proxies 不能为空');
  }

  if (!config.sites) {
    config.sites = [];
  }
  if (!Array.isArray(config.sites)) {
    throw new Error('sites 必须是数组');
  }

  config.proxies.forEach(validateProxy);

  const proxyNames = new Set();
  config.proxies.forEach((p, i) => {
    if (!isEnabled(p)) return;
    proxyNames.add(p.name || `proxies[${i}]`);
  });
  config.sites.forEach((s, i) => validateSite(s, i, proxyNames));

  const enabledProxies = config.proxies.filter(isEnabled).length;
  const enabledSites = config.sites.filter(isEnabled).length;
  if (enabledProxies === 0 && enabledSites === 0) {
    throw new Error('至少需要启用一组 proxies 或 sites');
  }

  collectPorts(config);

  return config;
}

function loadConfig() {
  const inline = parseInlineJson();
  if (inline) {
    return normalize(inline);
  }

  const configPath =
    process.env.SSH2PROXY_CONFIG ||
    path.join(process.cwd(), 'config.json');

  return normalize(readConfigFile(configPath));
}

module.exports = { loadConfig, isEnabled };
