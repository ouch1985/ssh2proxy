const { relay } = require('./relay');

function createBufferReader(socket, initial) {
  let buf = initial;

  return function need(min) {
    if (buf.length >= min) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.length >= min) {
          cleanup();
          resolve();
        }
      };
      const onErr = (err) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('客户端在 HTTP 握手阶段断开'));
      };
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onErr);
        socket.off('close', onClose);
      };
      socket.on('data', onData);
      socket.on('error', onErr);
      socket.on('close', onClose);
    });
  };
}

function parseConnectTarget(firstLine) {
  const bracket = firstLine.match(/^CONNECT\s+\[([^\]]+)\]:(\d+)\s+HTTP\/\d/i);
  if (bracket) {
    return { host: bracket[1], port: Number(bracket[2]) };
  }
  const plain = firstLine.match(/^CONNECT\s+([^:\s]+):(\d+)\s+HTTP\/\d/i);
  if (plain) {
    return { host: plain[1], port: Number(plain[2]) };
  }
  return null;
}

/**
 * @param {import('net').Socket} socket
 * @param {Buffer} firstChunk
 * @param {(host: string, port: number) => Promise<import('stream').Duplex>} forward
 */
async function handleHttpConnect(socket, firstChunk, forward) {
  let buf = firstChunk;

  while (buf.indexOf('\r\n\r\n') === -1) {
    await new Promise((resolve, reject) => {
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (buf.indexOf('\r\n\r\n') !== -1) {
          cleanup();
          resolve();
        }
      };
      const onErr = (err) => {
        cleanup();
        reject(err);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('客户端在 HTTP 握手阶段断开'));
      };
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onErr);
        socket.off('close', onClose);
      };
      socket.on('data', onData);
      socket.on('error', onErr);
      socket.on('close', onClose);
    });
  }

  const headerEnd = buf.indexOf('\r\n\r\n');
  const headerText = buf.subarray(0, headerEnd).toString('utf8');
  const rest = buf.subarray(headerEnd + 4);

  const firstLine = headerText.split('\r\n')[0];
  const target = parseConnectTarget(firstLine);
  if (!target) {
    socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
    socket.end();
    throw new Error(`不支持的 HTTP 代理请求: ${firstLine}`);
  }

  const stream = await forward(target.host, target.port);
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  if (rest.length > 0) stream.write(rest);
  relay(socket, stream);
}

module.exports = { handleHttpConnect };
