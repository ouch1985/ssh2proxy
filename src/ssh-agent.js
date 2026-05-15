const http = require('http');
const https = require('https');
const tls = require('tls');

function createSshAgent(forward, remoteHost, useTls) {
  const Base = useTls ? https.Agent : http.Agent;

  class SshAgent extends Base {
    constructor() {
      super({ keepAlive: true });
      this.forward = forward;
      this.remoteHost = remoteHost;
      this.useTls = useTls;
    }

    createConnection(options, callback) {
      const port = Number(options.port) || (this.useTls ? 443 : 80);
      this.forward(this.remoteHost, port)
        .then((stream) => {
          if (!this.useTls) {
            callback(null, stream);
            return;
          }
          const tlsSocket = tls.connect(
            {
              socket: stream,
              servername: this.remoteHost,
              ALPNProtocols: ['http/1.1', 'http/1.0'],
            },
            () => callback(null, tlsSocket),
          );
          tlsSocket.on('error', callback);
        })
        .catch(callback);
    }
  }

  return new SshAgent();
}

module.exports = { createSshAgent };
