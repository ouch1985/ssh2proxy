#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-7071}"
PROXY="127.0.0.1:${PORT}"
FAIL=0

check() {
  local name="$1"
  shift
  printf "  %-20s ... " "$name"
  if "$@" >/dev/null 2>&1; then
    echo "OK"
  else
    echo "FAIL"
    FAIL=1
  fi
}

echo "代理 smoke test -> ${PROXY}"
echo "等待端口就绪..."
for _ in $(seq 1 30); do
  if nc -z 127.0.0.1 "${PORT}" 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! nc -z 127.0.0.1 "${PORT}" 2>/dev/null; then
  echo "错误: 端口 ${PORT} 未监听，请先 ./startup.sh"
  exit 1
fi

check "SOCKS5 Google" \
  curl -fsS -x "socks5h://${PROXY}" --connect-timeout 20 -m 25 -o /dev/null \
  https://www.google.com

check "HTTP Google" \
  curl -fsS -x "http://${PROXY}" --connect-timeout 20 -m 25 -o /dev/null \
  https://www.google.com

check "SOCKS5 Cloudflare" \
  curl -fsS -x "socks5h://${PROXY}" --connect-timeout 20 -m 25 -o /dev/null \
  https://1.1.1.1

if [[ "$FAIL" -eq 0 ]]; then
  echo "全部通过"
  exit 0
fi
echo "存在失败项"
exit 1
