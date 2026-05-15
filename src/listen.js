/**
 * 监听端口；EADDRINUSE 时退出进程并给出明确提示。
 */
function bindServer(server, { port, host, log, label }) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err.code === 'EADDRINUSE') {
        log.error(
          `${label}: 端口 ${host}:${port} 已被占用。请先 Ctrl+C 停掉旧窗口，或重新执行 ./startup.sh`,
        );
        process.exit(1);
      }
      log.error(`${label}: ${err.message}`);
      reject(err);
    };

    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      server.on('error', (err) => {
        log.debug(`${label} server: ${err.message}`);
      });
      resolve();
    });
  });
}

module.exports = { bindServer };
