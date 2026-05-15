const { loadConfig, isEnabled } = require('./config');
const { createLogger } = require('./logger');
const { SshTunnelProxy } = require('./ssh-tunnel');
const { SiteProxy } = require('./site-proxy');

const log = createLogger('main');
const tunnels = [];
const sites = [];

function shutdown(signal) {
  log.info(`收到 ${signal}，正在退出...`);
  for (const s of sites) {
    s.stop();
  }
  for (const t of tunnels) {
    t.stop();
  }
  setTimeout(() => process.exit(0), 500);
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    log.error('加载配置失败:', err.message);
    process.exit(1);
  }

  const enabledProxies = config.proxies.filter(isEnabled);
  const disabledProxies = config.proxies.filter((e) => !isEnabled(e));
  const enabledSites = (config.sites || []).filter(isEnabled);
  const disabledSites = (config.sites || []).filter((e) => !isEnabled(e));

  log.info(
    `proxies ${config.proxies.length} 组（启用 ${enabledProxies.length}）` +
      (config.sites.length
        ? `，sites ${config.sites.length} 个（启用 ${enabledSites.length}）`
        : ''),
  );

  for (const entry of disabledProxies) {
    const name = entry.name || entry.ssh?.host || '未命名';
    log.info(`[${name}] 已禁用（enabled: false），不启动`);
  }
  for (const entry of disabledSites) {
    const name = entry.name || entry.target || '未命名';
    log.info(`[site:${name}] 已禁用（enabled: false），不启动`);
  }

  const tunnelByName = new Map();

  config.proxies.forEach((entry, i) => {
    if (!isEnabled(entry)) return;
    const key = entry.name || `proxies[${i}]`;
    const tunnel = new SshTunnelProxy(entry);
    tunnels.push(tunnel);
    tunnelByName.set(key, tunnel);
    tunnel.start();
  });

  for (const entry of enabledSites) {
    const tunnel = tunnelByName.get(entry.proxy);
    if (!tunnel) {
      log.error(`站点 ${entry.name || entry.target} 引用的 proxy "${entry.proxy}" 未启用`);
      process.exit(1);
    }
    const site = new SiteProxy(entry, tunnel);
    sites.push(site);
    tunnel.whenReady(() => {
      site.start().catch(() => process.exit(1));
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  log.error('启动失败:', err);
  process.exit(1);
});
