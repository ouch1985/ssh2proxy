/**
 * 双向转发本地 socket 与 SSH stream，并统一清理。
 */
function relay(socket, stream) {
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    socket.unpipe(stream);
    stream.unpipe(socket);
    if (!socket.destroyed) socket.destroy();
    if (stream && !stream.destroyed) stream.destroy();
  };

  socket.pipe(stream);
  stream.pipe(socket);
  socket.on('error', cleanup);
  stream.on('error', cleanup);
  socket.on('close', cleanup);
  stream.on('close', cleanup);
}

module.exports = { relay };
