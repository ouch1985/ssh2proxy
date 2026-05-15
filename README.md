# ssh2proxy

通过 SSH 隧道在本地提供：

1. **通用代理**（`proxies`）：SOCKS5 + HTTP CONNECT，流量经远程服务器出口访问任意目标
2. **站点反向代理**（`sites`）：把指定 API/网站映射到本地 HTTP 端口，路径与线上一致

适用于访问国外 API / 网站（Claude Code、OpenRouter、Anthropic 等）。支持多组 SSH、断线自动重连。

## 环境要求

- [Node.js 20](https://nodejs.org/)（推荐 [nvm](https://github.com/nvm-sh/nvm)）
- 一台可 SSH 登录、且能访问目标网络的远程服务器

## 快速开始

```bash
cd ssh2proxy
npm install
cp config.example.json config.json   # 编辑 SSH 与端口
chmod +x startup.sh                 # 首次
./startup.sh                        # 勿用 sh startup.sh；会自动释放占用端口
```

`config.json` 已在 `.gitignore` 中，避免误提交密码。

启动成功日志示例：

```
[INFO] [main] proxies 1 组（启用 1），sites 2 个（启用 2）
[INFO] [vps-password] SSH 已连接 203.0.113.10:22
[INFO] [vps-password] 本地代理已启动 127.0.0.1:1080（SOCKS5 + HTTP CONNECT）
[INFO] [site:openrouter] 站点代理已启动 http://127.0.0.1:7072 -> https://openrouter.ai
```

按 `Ctrl+C` 退出。

## 配置文件说明

完整模板见 [config.example.json](./config.example.json)。

### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `proxies` | 数组 | 是 | SSH 隧道 + 本地 SOCKS5/HTTP 代理 |
| `sites` | 数组 | 否 | 站点反向代理，默认 `[]` |

**端口规则**：所有已启用的 `proxies[].proxy.port` 与 `sites[].port` 不能重复。

---

### `proxies[]` — 通用代理

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 日志名称；`sites` 通过此字段引用 |
| `enabled` | boolean | 否 | 默认 `true`；`false` 时不连接、不监听 |
| `ssh` | object | 启用时必填 | SSH 连接参数 |
| `proxy` | object | 启用时必填 | 本地监听参数 |

#### `ssh`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `host` | string | 是 | 服务器 IP 或域名 |
| `port` | number | 否 | SSH 端口，默认 `22` |
| `username` | string | 是 | SSH 用户名 |
| `password` | string | 二选一 | SSH 密码 |
| `privateKey` | string | 二选一 | 私钥**绝对路径** |
| `passphrase` | string | 否 | 私钥口令 |
| `readyTimeout` | number | 否 | 握手超时（毫秒），默认 `60000` |
| `keepaliveInterval` | number | 否 | 保活间隔，默认 `10000` |
| `keepaliveCountMax` | number | 否 | 保活失败上限，默认 `3` |

#### `proxy`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `port` | number | 是 | 本地端口；**同时支持 SOCKS5 与 HTTP CONNECT** |
| `host` | string | 否 | 监听地址，默认 `127.0.0.1` |

---

### `sites[]` — 站点反向代理

将本地 HTTP 请求原样转发到 `target`（路径、Query 不变），经 `proxy` 指定的 SSH 隧道出站。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 日志名称 |
| `enabled` | boolean | 否 | 默认 `true` |
| `proxy` | string | 是 | 对应 `proxies[].name`（须为已启用项） |
| `host` | string | 否 | 监听地址，默认 `127.0.0.1` |
| `port` | number | 是 | 本地 HTTP 端口 |
| `target` | string | 是 | 上游根地址，如 `https://openrouter.ai` |

**映射关系**：

| 本地请求 | 实际上游 |
|----------|----------|
| `http://127.0.0.1:7072/api/v1/models` | `https://openrouter.ai/api/v1/models` |
| `http://127.0.0.1:7073/v1/messages` | `https://api.anthropic.com/v1/messages` |

客户端只需把 API Base URL 改成本地地址即可，无需再配 SOCKS5。

---

### 配置示例

**仅通用代理：**

```json
{
  "proxies": [
    {
      "name": "my-vps",
      "ssh": {
        "host": "203.0.113.10",
        "username": "root",
        "privateKey": "/Users/you/.ssh/id_rsa"
      },
      "proxy": { "port": 1080 }
    }
  ]
}
```

**代理 + 站点（推荐 API 场景）：**

```json
{
  "proxies": [
    {
      "name": "my-vps",
      "ssh": {
        "host": "203.0.113.10",
        "username": "ubuntu",
        "privateKey": "/Users/you/.ssh/id_rsa"
      },
      "proxy": { "port": 1080 }
    }
  ],
  "sites": [
    {
      "name": "openrouter",
      "proxy": "my-vps",
      "port": 7072,
      "target": "https://openrouter.ai"
    }
  ]
}
```

临时禁用（保留配置，重启生效）：

```json
{ "name": "backup", "enabled": false, "ssh": { ... }, "proxy": { "port": 1081 } }
```

```json
{ "name": "old-api", "enabled": false, "proxy": "my-vps", "port": 7074, "target": "https://example.com" }
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `SSH2PROXY_CONFIG` | 配置文件路径，默认 `./config.json` |
| `SSH2PROXY_CONFIG_JSON` | 内联 JSON，**优先于文件** |
| `SSH2PROXY_LOG_LEVEL` | `debug` / `info` / `warn` / `error`，默认 `info` |

## 使用方式

### 通用代理（SOCKS5 / HTTP）

假设 `proxy.port` 为 `1080`：

```bash
# 验证
npm run test:proxy -- 1080

# SOCKS5
curl -x socks5h://127.0.0.1:1080 https://www.google.com

# HTTP CONNECT
curl -x http://127.0.0.1:1080 https://api.anthropic.com
```

环境变量：

```bash
export ALL_PROXY=socks5h://127.0.0.1:1080
export HTTPS_PROXY=http://127.0.0.1:1080
```

Claude Code 等工具在「网络 / Proxy」中填 `socks5://127.0.0.1:1080` 或 `http://127.0.0.1:1080`。

### 站点反向代理

```bash
# OpenRouter：本地路径 = 官方 API 路径
curl http://127.0.0.1:7072/api/v1/models

# Anthropic
curl http://127.0.0.1:7073/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{ ... }'
```

应用里把 Base URL 设为 `http://127.0.0.1:7072`（OpenRouter）即可。

## 运行命令

| 方式 | 命令 |
|------|------|
| 推荐 | `./startup.sh` |
| npm | `npm start` |
| 开发 | `npm run dev` |
| 自检 | `npm run test:proxy -- <端口>` |

## 断线重连

SSH 断开后自动重连（2s 起，指数退避，最长 60s）。重连期间新连接可能失败或返回 `503`，恢复后正常。

## 常见问题

**Q: 配置文件不存在**  
A: `cp config.example.json config.json`

**Q: SSH 连不上 / 握手超时**  
A: 本机先 `ssh user@host` 验证；可把 `readyTimeout` 调到 `60000`

**Q: 通用代理不可用**  
A: 确认使用 SOCKS5 或 HTTP CONNECT；`npm run test:proxy -- <端口>`

**Q: 站点代理 502 / 503**  
A: `503` 多为 SSH 未连上；`502` 检查 `target` 是否正确、远端能否访问该域名

**Q: 端口冲突**  
A: 所有已启用的 `proxy.port` 与 `sites[].port` 必须互不相同

**Q: sites 报 proxy 不存在**  
A: `sites[].proxy` 必须与某个**已启用**的 `proxies[].name` 完全一致

## 项目结构

```
ssh2proxy/
├── config.example.json
├── startup.sh
├── scripts/smoke-test.sh
└── src/
    ├── index.js          # 入口
    ├── config.js         # 配置加载与校验
    ├── ssh-tunnel.js     # SSH + SOCKS5/HTTP 代理
    ├── site-proxy.js     # 站点反向代理
    ├── ssh-agent.js      # 经 SSH 的 HTTP(S) Agent
    ├── socks5.js
    ├── http-proxy.js
    ├── relay.js
    └── logger.js
```

## 安全提示

- 勿将含密码的 `config.json` 提交到 Git
- 私钥建议 `chmod 600`
- 默认仅监听 `127.0.0.1`
