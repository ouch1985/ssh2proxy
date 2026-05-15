const fs = require('fs');
const net = require('net');
const { Client } = require('ssh2');
const { createLogger } = require('./logger');
const { handleSocks5 } = require('./socks5');
const { handleHttpConnect } = require('./http-proxy');
const { bindServer } = require('./listen');

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 60000;

function buildSshConfig(ssh) {
  const cfg = {
    host: ssh.host,
    port: ssh.port || 22,
    username: ssh.username,
    readyTimeout: ssh.readyTimeout || 60000,
    keepaliveInterval: ssh.keepaliveInterval || 10000,
    keepaliveCountMax: ssh.keepaliveCountMax || 3,
  };

  if (ssh.password) {
    cfg.password = ssh.password;
  }
  if (ssh.privateKey) {
    cfg.privateKey = fs.readFileSync(ssh.privateKey);
    if (ssh.passphrase) {
      cfg.passphrase = ssh.passphrase;
    }
  }
  return cfg;
}

class SshTunnelProxy {
  constructor(entry) {
    this.entry = entry;
    this.name = entry.name || `${entry.ssh.host}:${entry.proxy.port}`;
    this.log = createLogger(this.name);
    this.conn = null;
    this.server = null;
    this.connected = false;
    this.stopping = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.readyCallbacks = [];
  }

  whenReady(fn) {
    if (this.connected) fn();
    else this.readyCallbacks.push(fn);
  }

  emitReady() {
    for (const fn of this.readyCallbacks) fn();
    this.readyCallbacks = [];
  }

  start() {
    this.stopping = false;
    this.log.info('启动代理组');
    this.connectSsh();
    return this;
  }

  connectSsh() {
    if (this.stopping) return;

    if (this.conn) {
      this.conn.removeAllListeners();
      this.conn.destroy();
      this.conn = null;
    }

    const client = new Client();
    this.conn = client;

    client.on('ready', () => {
      this.connected = true;
      this.reconnectAttempt = 0;
      this.log.info(
        `SSH 已连接 ${this.entry.ssh.host}:${this.entry.ssh.port || 22}`,
      );
      this.startProxyServer()
        .then(() => this.emitReady())
        .catch(() => process.exit(1));
    });

    client.on('error', (err) => {
      if (this.stopping) return;
      this.log.warn('SSH 错误:', err.message);
    });

    client.on('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.stopProxyServer();
      if (this.stopping) {
        this.log.info('SSH 已关闭');
        return;
      }
      this.log.warn(wasConnected ? 'SSH 连接断开，准备重连' : 'SSH 连接失败，准备重连');
      this.scheduleReconnect();
    });

    client.on('end', () => {
      this.log.debug('SSH end 事件');
    });

    this.log.info(
      `正在连接 SSH ${this.entry.ssh.host}:${this.entry.ssh.port || 22} ...`,
    );
    client.connect(buildSshConfig(this.entry.ssh));
  }

  scheduleReconnect() {
    if (this.stopping || this.reconnectTimer) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;
    this.log.info(`${delay / 1000}s 后尝试第 ${this.reconnectAttempt} 次重连`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSsh();
    }, delay);
  }

  forward(host, port) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.conn) {
        reject(new Error('SSH 未连接'));
        return;
      }
      this.conn.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stream);
      });
    });
  }

  startProxyServer() {
    if (this.server) return Promise.resolve();

    const port = this.entry.proxy.port;
    const host = this.entry.proxy.host || '127.0.0.1';

    this.server = net.createServer((socket) => {
      socket.setNoDelay(true);

      socket.once('data', async (chunk) => {
        const forward = (h, p) => this.forward(h, p);
        try {
          if (chunk[0] === 0x05) {
            await handleSocks5(socket, chunk, forward);
          } else {
            await handleHttpConnect(socket, chunk, forward);
          }
        } catch (err) {
          this.log.debug(`代理连接失败 ${err.message}`);
        }
      });

      socket.on('error', (err) => {
        this.log.debug('客户端 socket 错误:', err.message);
      });
    });

    return bindServer(this.server, {
      port,
      host,
      log: this.log,
      label: '本地代理',
    }).then(() => {
      this.log.info(
        `本地代理已启动 ${host}:${port}（SOCKS5 + HTTP CONNECT）`,
      );
    });
  }

  stopProxyServer() {
    if (!this.server) return;
    const srv = this.server;
    this.server = null;
    if (typeof srv.closeAllConnections === 'function') {
      srv.closeAllConnections();
    }
    srv.close(() => {
      this.log.debug('本地代理已停止监听');
    });
  }

  stop() {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopProxyServer();
    if (this.conn) {
      this.conn.end();
      this.conn = null;
    }
    this.log.info('代理组已停止');
  }
}

module.exports = { SshTunnelProxy };
