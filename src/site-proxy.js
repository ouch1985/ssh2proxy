const http = require('http');
const https = require('https');
const { URL } = require('url');
const { createLogger } = require('./logger');
const { createSshAgent } = require('./ssh-agent');
const { bindServer } = require('./listen');

class SiteProxy {
  constructor(site, tunnel) {
    this.site = site;
    this.tunnel = tunnel;
    this.target = new URL(site.target);
    this.name = site.name || `${this.target.host}:${site.port}`;
    this.log = createLogger(`site:${this.name}`);
    this.server = null;
    this.useTls = this.target.protocol === 'https:';
    this.lib = this.useTls ? https : http;
    this.agent = createSshAgent(
      (h, p) => tunnel.forward(h, p),
      this.target.hostname,
      this.useTls,
    );
  }

  start() {
    const host = this.site.host || '127.0.0.1';
    const port = this.site.port;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        this.log.debug(`请求失败: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('Bad Gateway');
      });
    });

    this.server.on('clientError', (err, socket) => {
      if (err.code === 'ECONNRESET' || err.code === 'HPE_INVALID_EOF_STATE') {
        return;
      }
      this.log.debug(`客户端错误: ${err.message}`);
      if (!socket.destroyed) socket.destroy();
    });

    return bindServer(this.server, {
      port,
      host,
      log: this.log,
      label: '站点代理',
    }).then(() => {
      this.log.info(
        `站点代理已启动 http://${host}:${port} -> ${this.site.target}`,
      );
    });
  }

  buildUpstreamHeaders(req) {
    const headers = { ...req.headers };
    headers.host = this.target.host;
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];
    return headers;
  }

  handleRequest(req, res) {
    if (!this.tunnel.connected) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('SSH tunnel not connected');
      return Promise.resolve();
    }

    const path = req.url || '/';
    const fullUrl = `${this.site.target}${path}`;
    this.log.debug(`${req.method} ${fullUrl}`);
    const defaultPort = this.useTls ? 443 : 80;
    const port = this.target.port ? Number(this.target.port) : defaultPort;

    const options = {
      protocol: this.target.protocol,
      hostname: this.target.hostname,
      port,
      method: req.method,
      path,
      headers: this.buildUpstreamHeaders(req),
      agent: this.agent,
      timeout: 120000,
    };

    return new Promise((resolve) => {
      const upstream = this.lib.request(options, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
        upstreamRes.on('end', resolve);
      });

      upstream.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end(`Bad Gateway: ${err.message}`);
        resolve();
      });

      req.pipe(upstream);
    });
  }

  stop() {
    if (this.server) {
      const srv = this.server;
      this.server = null;
      if (typeof srv.closeAllConnections === 'function') {
        srv.closeAllConnections();
      }
      srv.close();
    }
    this.agent.destroy();
    this.log.info('站点代理已停止');
  }
}

module.exports = { SiteProxy };
