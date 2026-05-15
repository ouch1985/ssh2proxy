#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh"
  nvm use 20
else
  echo "警告: 未找到 nvm，将使用当前 shell 中的 node" >&2
fi

if [[ ! -d node_modules ]]; then
  echo "安装依赖..."
  npm install
fi

CONFIG="${SSH2PROXY_CONFIG:-$SCRIPT_DIR/config.json}"
if [[ ! -f "$CONFIG" ]] && [[ -z "${SSH2PROXY_CONFIG_JSON:-}" ]]; then
  echo "错误: 未找到配置文件。请复制 config.example.json 为 config.json 并填写，或设置 SSH2PROXY_CONFIG / SSH2PROXY_CONFIG_JSON" >&2
  exit 1
fi

export SSH2PROXY_CONFIG="${SSH2PROXY_CONFIG:-$CONFIG}"

# 按 config 释放 7071/7072 等端口（勿用 sh startup.sh，请 ./startup.sh）
if [[ "${SSH2PROXY_NO_KILL:-}" != "1" ]]; then
  node scripts/free-ports.js 2>/dev/null || true
  sleep 1
fi

exec node src/index.js
