# 日本 VPS 3x-ui / Xray 交接文档

> 文档日期：2026-09-28（Asia/Shanghai）  
> 适用主机：`82.108.198.150`（Debian 12，主机名 `ECS998`）  
> 目标：为后续运维和开发提供可复核的现状、边界和操作入口。

## 1. 交接范围

本项目是部署在日本 VPS 上的 3x-ui 面板与 Xray 节点，提供 VLESS + TCP + REALITY 代理，以及 Clash/通用订阅输出。当前为供应商二进制安装，不是本地 Git 源码工作树；若要修改面板代码，应单独检出上游 3x-ui 项目，不要直接修改 `/usr/local/x-ui/x-ui`。

本文档不保存以下敏感信息：面板密码、完整用户名凭据、面板 web base path、订阅路径或订阅 ID、客户端 UUID、REALITY 私钥、完整 VLESS URI、API token。需要时仅在服务器上读取并临时使用。

## 2. 主机与系统现状

| 项目 | 当前值 |
|---|---|
| OS | Debian GNU/Linux 12 |
| Kernel | `6.1.0-52-cloud-amd64` |
| 主机名 | `ECS998` |
| 公网地址 | `82.108.198.150` |
| SSH 管理端口 | `639`（另有 `22` 监听，变更前须确认备用会话） |
| 磁盘 | 约 9.7G，总使用约 5.2G，剩余约 4.1G |
| 内存 | 约 3.8GiB |
| Swap | 未配置 |

磁盘空间偏紧。升级、构建或导入大文件前先执行 `df -hT`、`docker system df`、`journalctl --disk-usage`，避免在服务器上进行不必要的镜像重构。

## 3. 进程与 systemd

主服务：`/etc/systemd/system/x-ui.service`

- enabled，当前 active/running。
- `Restart=on-failure`，`RestartSec=5s`。
- 程序根目录：`/usr/local/x-ui`
- 状态目录：`/etc/x-ui`
- 主进程启动 Xray 子进程；检查时主进程和 Xray 均正常。
- Xray 版本：`26.9.9`。
- 3x-ui CLI 不支持独立的 `version` 子命令，因此面板版本应以安装包、日志或发布记录核对，不要把 CLI 失败误判为服务故障。

常用只读检查：

```bash
systemctl status x-ui --no-pager
systemctl cat x-ui
pgrep -a -f '/usr/local/x-ui|xray'
journalctl -u x-ui -n 100 --no-pager
```

重启前先备份数据库；重启后同时检查监听、日志和订阅 HTTP 响应：

```bash
systemctl restart x-ui
systemctl is-active x-ui
ss -lntup
journalctl -u x-ui -n 80 --no-pager
```

## 4. 监听端口与访问边界

| 监听 | 用途 | 暴露策略 |
|---|---|---|
| `127.0.0.1:<面板端口>` | x-ui 管理面板，HTTP | 仅回环，不直接公网开放 |
| `*:2096` | x-ui 订阅服务 | 公网，用于 Clash/通用订阅 |
| `*:443` | Xray VLESS + REALITY | 公网代理入口 |
| `127.0.0.1:11111` | Xray metrics | 仅本机 |
| `127.0.0.1:62789` | Xray API tunnel | 仅本机 |

面板安全访问方式是 SSH 隧道，不要为了方便把回环监听改成 `0.0.0.0`：

```powershell
ssh -p 639 -N -L 45783:127.0.0.1:45783 root@82.108.198.150
```

然后在本机浏览器打开 `http://127.0.0.1:45783/<服务器中的 webBasePath>/`。真实端口和路径以 `/etc/x-ui/install-result.env`、SQLite `settings` 表为准；不要从本文档猜测。

云厂商安全组仍会影响公网可达性。若本机 `ss` 正常但外部失败，应同时检查安全组和上游网络，而不是先修改 x-ui。

## 5. 面板与 Xray 配置概览

配置数据库：`/etc/x-ui/x-ui.db`。

当前逻辑状态：

- 面板仅监听回环地址，随机管理端口和随机 web base path。
- 已启用订阅、Clash 订阅和通用/Shadowrocket 订阅。
- 只有 1 个启用入站和 1 个客户端。
- 入站备注为 `JP-Reality`，监听 `0.0.0.0:443`，协议 VLESS，传输 TCP，REALITY，flow 为 `xtls-rprx-vision`。
- REALITY 目标/SNI 为 `www.microsoft.com:443`，fingerprint 为 `chrome`，sniffing 覆盖 `http`、`tls`、`quic`。
- 分享地址策略为 custom，已固定为当前公网 IP，避免订阅生成 `localhost`。
- 客户端通过 `client_inbounds` 关联，并显式覆盖 flow 为 `xtls-rprx-vision`。

REALITY 目标使用微软站点时，Xray 日志提示可能增加服务端 IP 被封锁概率；这是现有配置的风险项，后续调整前必须同时更新订阅字段并重新验证客户端导入。

## 6. 订阅生成与验证

订阅路径和客户端订阅 ID 存在 SQLite `settings`、`clients` 等表中。本文档故意不列出完整公网 URL；接手者应在服务器上读取当前值后，再用一次性命令验证。

验证目标：

1. Clash 响应为 HTTP 200，YAML 可解析。
2. YAML 中的 `server` 是公网地址，不是 `localhost`。
3. VLESS 节点包含 `flow`、REALITY 公钥和 short ID。
4. 通用/Shadowrocket 响应为 HTTP 200，Base64 解码后含 `flow=xtls-rprx-vision`。
5. 外部访问失败时，按“监听 -> 本机 curl -> 外部 curl -> 安全组”顺序定位。

此前已完成本机和外部验证，Clash 与通用订阅均返回 200；如再次失败，优先检查数据库中分享地址、REALITY client 字段和订阅开关。

## 7. 数据库、WAL 与备份

数据库为 SQLite WAL 模式。运行中的服务不能只复制 `x-ui.db` 主文件：当 WAL 文件存在时，直接复制可能得到不完整或不可独立恢复的快照。

已创建并通过完整性检查的交接备份：

```text
/etc/x-ui/backups/x-ui-handoff-20260928T131419Z.sqlite
```

该文件权限为 `600`，`PRAGMA integrity_check` 返回 `ok`，包含 22 张表、1 个入站、1 个客户端。

推荐备份方式（服务在线）：

```bash
install -d -m 700 /etc/x-ui/backups
python3 - <<'PY'
import sqlite3
src = sqlite3.connect('/etc/x-ui/x-ui.db')
dst = sqlite3.connect('/etc/x-ui/backups/x-ui-handoff-YYYYMMDDTHHMMSSZ.sqlite')
src.backup(dst)
dst.close(); src.close()
PY
chmod 600 /etc/x-ui/backups/*.sqlite
sqlite3 /etc/x-ui/backups/x-ui-handoff-YYYYMMDDTHHMMSSZ.sqlite 'PRAGMA integrity_check;'
```

恢复前必须停止服务、保留旧目录副本，并确认备份文件完整：

```bash
systemctl stop x-ui
cp -a /etc/x-ui /etc/x-ui.before-restore-$(date -u +%Y%m%dT%H%M%SZ)
cp /etc/x-ui/backups/<verified-backup>.sqlite /etc/x-ui/x-ui.db
rm -f /etc/x-ui/x-ui.db-wal /etc/x-ui/x-ui.db-shm
sqlite3 /etc/x-ui/x-ui.db 'PRAGMA integrity_check;'
systemctl start x-ui
```

恢复后必须复核服务状态、监听端口、面板日志和两类订阅。不要删除旧备份，除非已确认新实例稳定运行。

## 8. 已做的手工修补与升级风险

为修复订阅生成问题，曾在 SQLite 中手工补齐/调整：

- `inbounds.share_addr_strategy = custom`
- `inbounds.share_addr = 公网 IP`
- `realitySettings.settings.publicKey`
- `realitySettings.settings.fingerprint = chrome`
- `realitySettings.settings.spiderX = /`
- 保留顶层 `realitySettings.publicKey`
- `client_inbounds.flow_override = xtls-rprx-vision`
- `inbounds.disable_flow = 0`

这些字段可能在后续面板编辑、导入配置或升级迁移时被覆盖。任何升级后都要重新验证真实生成的 Clash YAML 和通用订阅，不能只看端口是否监听。

升级建议：

1. 记录当前服务、数据库备份路径和 `ss -lntup`。
2. 使用 SQLite backup API 生成新备份并执行 `integrity_check`。
3. 升级后检查表结构、入站字段、订阅开关和客户端关联。
4. 以脱敏后的响应片段验证 `server`、`flow`、`public-key`，不要把完整订阅内容写入日志或工单。

## 9. 共存服务（禁止误停或改端口）

以下 Docker 工作负载在检查时健康，属于同一台主机上的既有业务：

- `new-api`：主机 TCP `3000`
- `new-api-jev`：主机 TCP `3001`
- `grok2api`：主机 TCP `8001`
- `codex-downloads` Nginx：主机 TCP `80`
- `redis`、`postgres`、`new-api-jev-postgres`：仅容器内部端口

接手任何新项目前，先执行 `ss -lntup` 与 `docker ps --format ...`，不得抢占 `80/3000/3001/8001/443/2096`，也不要使用 `docker system prune`。仅在明确需要释放构建缓存时评估 `docker builder prune -af` 的影响。

## 10. 账号、日志与安全事项

- 安装凭据文件：`/etc/x-ui/install-result.env`，权限应为 `600`；不要复制到工单、仓库或聊天。
- 面板用户名来自 SQLite `users.username`；密码只从服务器安全地重置或核对，不在文档中记录。
- 2026-09-28 03:38 UTC 的日志出现两次本地面板登录失败；这更像凭据不匹配或输入错误，不代表 x-ui 进程故障。若持续出现，先核对账号来源、系统时间和登录来源，再考虑重置密码。
- 订阅 URL 本质上是公开 bearer secret。若路径或订阅 ID 泄露，应在面板中重新生成客户端/订阅标识并废弃旧链接。
- 当前面板为 HTTP，但只绑定回环并通过 SSH 隧道访问；不要在没有 TLS、访问控制和回滚方案时直接公网暴露。
- 定期检查 `journalctl -u x-ui`、Xray 错误日志、磁盘占用和失败登录；不要把完整请求头、订阅内容或私钥写入调试日志。

## 11. 接手后的最小检查清单

```bash
systemctl is-enabled x-ui
systemctl is-active x-ui
ss -lntup
df -hT
sqlite3 /etc/x-ui/x-ui.db 'PRAGMA journal_mode; PRAGMA integrity_check;'
journalctl -u x-ui --since '1 hour ago' --no-pager
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

完成以上检查后，再从 SQLite 读取当前面板端口、webBasePath、订阅路径和客户端 ID，并在临时环境中验证订阅内容。任何字段修改都先备份、后变更、再重启/验证。

## 12. 尚未完成或需后续决策的事项

1. 是否更换 REALITY 目标站点，以降低日志提示的封锁风险。
2. 是否为面板增加反向代理/TLS；若不做，继续保持回环监听和 SSH 隧道。
3. 是否建立定期 SQLite 备份和磁盘告警；当前已有一次交接备份，但未形成自动轮换策略。
4. 3x-ui 上游升级前，需要重新评估手工 schema patch 是否仍被需要。
5. 若要进行“UI 项目”代码级开发，应另行准备上游源码仓库、版本锁定和测试环境，不要把生产二进制目录当作开发目录。
