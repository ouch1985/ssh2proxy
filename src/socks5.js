const { relay } = require('./relay');

const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;

function parseTarget(buf, offset) {
  const atyp = buf[offset];
  let pos = offset + 1;

  if (atyp === ATYP_IPV4) {
    const host = Array.from(buf.subarray(pos, pos + 4)).join('.');
    pos += 4;
    const port = buf.readUInt16BE(pos);
    return { host, port, next: pos + 2 };
  }

  if (atyp === ATYP_DOMAIN) {
    const len = buf[pos];
    pos += 1;
    const host = buf.subarray(pos, pos + len).toString('utf8');
    pos += len;
    const port = buf.readUInt16BE(pos);
    return { host, port, next: pos + 2 };
  }

  if (atyp === ATYP_IPV6) {
    const parts = [];
    for (let i = 0; i < 16; i += 2) {
      parts.push(buf.readUInt16BE(pos + i).toString(16));
    }
    const host = parts.join(':');
    pos += 16;
    const port = buf.readUInt16BE(pos);
    return { host, port, next: pos + 2 };
  }

  throw new Error(`不支持的 SOCKS5 ATYP: ${atyp}`);
}

function replyConnectSuccess(socket) {
  socket.write(
    Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]),
  );
}

function replyError(socket, code = 0x01) {
  if (socket.destroyed) return;
  socket.write(Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
  socket.end();
}

/**
 * @param {import('net').Socket} socket
 * @param {Buffer} firstChunk
 * @param {(host: string, port: number) => Promise<import('stream').Duplex>} forward
 */
async function handleSocks5(socket, firstChunk, forward) {
  let buf = firstChunk;

  const need = (min) =>
    new Promise((resolve, reject) => {
      if (buf.length >= min) {
        resolve();
        return;
      }
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
        reject(new Error('客户端在握手阶段断开'));
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

  const consume = (n) => {
    const chunk = buf.subarray(0, n);
    buf = buf.subarray(n);
    return chunk;
  };

  try {
    await need(2);
    const nMethods = buf[1];
    await need(2 + nMethods);
    consume(2 + nMethods);
    socket.write(Buffer.from([0x05, 0x00]));

    await need(4);
    if (buf[0] !== 0x05) {
      replyError(socket, 0x01);
      return;
    }
    if (buf[1] !== 0x01) {
      replyError(socket, 0x07);
      return;
    }

    const atyp = buf[3];
    let reqLen;
    if (atyp === ATYP_IPV4) {
      reqLen = 10;
    } else if (atyp === ATYP_DOMAIN) {
      await need(5);
      reqLen = 7 + buf[4];
    } else if (atyp === ATYP_IPV6) {
      reqLen = 22;
    } else {
      replyError(socket, 0x08);
      return;
    }
    await need(reqLen);

    const { host, port, next } = parseTarget(buf, 3);
    const rest = buf.subarray(next);
    buf = Buffer.alloc(0);

    const stream = await forward(host, port);
    replyConnectSuccess(socket);
    if (rest.length > 0) stream.write(rest);
    relay(socket, stream);
  } catch (err) {
    const code = /SSH 未连接|ECONNREFUSED|ETIMEDOUT/i.test(err.message)
      ? 0x05
      : 0x01;
    replyError(socket, code);
    throw err;
  }
}

module.exports = { handleSocks5 };
