# 从零部署

当前生产机是 Debian 12，面板在 `82.108.198.150:8443`，代理在同一台机器的 443。这份说明按那次部署里实际踩过的坑写。仓库里没有 SSH 密码、面板密码、REALITY 私钥或用户 UUID。

## 机器上最终长什么样

| 端口 | 进程 | 作用 |
|---|---|---|
| 443 | x-ui 拉起的 Xray 26.9.9 | 唯一的 VLESS + TCP + REALITY 入站。旧客户端和新面板用户共用 |
| 2096 | x-ui | 旧订阅。不要改它的路径、UUID 或权限 |
| 8081 | `vite preview`，只听 127.0.0.1 | 面板上游 |
| 8443 | `scripts/public-entry.mjs` | 公网面板。原样转发 Host，不要改成 https |

不要把面板放到 80。这台机器的 80 上原来就有下载用的 nginx，占过去会和现有文件下载冲突。443 也不能再绑第二个进程。

目录：

- 代码和构建结果：`/opt/zhanmen`
- 环境变量：`/etc/zhanmen/env`，权限 600
- 用户库：`/var/lib/zhanmen/pg`（PGlite）
- 同步脚本：`/opt/zhanmen/scripts/xray-sync.py`
- systemd：`zhanmen.service`

## 新机器

1. Debian 12 或 Ubuntu，root，磁盘至少再留 3GB。`npm ci` 和构建都在这台机器上做，空间不够会装到一半失败。
2. 先装 [3x-ui](https://github.com/MHSanaei/3x-ui)，建好一个 VLESS + TCP + REALITY 入站，监听 443。SNI 用现在这套的 `www.microsoft.com` 即可。
3. Xray 保持 **26.9.9 或更新**。不要为了兼容旧 Clash 把核心降到 26.7.28。用现有私钥在 26.7.28 上测过，Xray 客户端自己都会握手失败；降级还会把旧订阅一起弄断。
4. 云防火墙放行 SSH、443、8443。2096 只在还要保留旧订阅时放行。
5. 克隆本仓库，填环境变量，再安装：

```bash
git clone https://github.com/3446960598z-sketch/zhanmen.git
cd zhanmen
sudo bash deploy/install.sh
```

第一次运行会写出 `/etc/zhanmen/env` 然后退出。填完再跑一次。脚本不会覆盖已经存在的 env，也不会重启 Xray。

公钥和 shortId 从入站里读，不要读私钥：

```bash
python3 - << 'PY'
import json, sqlite3
db = sqlite3.connect("/etc/x-ui/x-ui.db")
row = db.execute("select stream_settings from inbounds where port=443").fetchone()
rs = json.loads(row[0])["realitySettings"]
public = rs.get("publicKey") or rs["settings"]["publicKey"]
print("XRAY_PUBLIC_KEY=" + public)
print("XRAY_SHORT_ID=" + rs["shortIds"][0])
print("XRAY_SNI=" + rs["serverNames"][0])
PY
```

`BETTER_AUTH_SECRET` 用 `openssl rand -base64 32`。

`BETTER_AUTH_URL` 必须是用户浏览器里的地址，例如 `http://1.2.3.4:8443`。写成 `https://` 之后，登录 cookie 会带 Secure，HTTP 页面上登录成功也会马上掉。

## 安装脚本实际做了什么

1. 安装 Node.js 22 和 python3。
2. 把仓库拷到 `/opt/zhanmen`，执行 `npm ci` 和 `npm run build`。
3. 把 PGlite 的 `pglite.data` 和 wasm 复制进 `.vercel/output/functions/__server.func/_libs/`。漏掉这一步，面板进程能起来，一查数据库就报找不到 wasm。
4. 安装并启动 `zhanmen.service`。

`scripts/vps-serve.sh` 同时拉起两个进程：127.0.0.1:8081 的 preview，和 0.0.0.0:8443 的转发。转发必须保留原始 Host。曾经把 Host 改掉之后，服务端函数全部 403/500。

检查：

```bash
systemctl status zhanmen x-ui
curl -I http://127.0.0.1:8443/
journalctl -u zhanmen -n 80 --no-pager
```

浏览器打开 `http://公网IP:8443`，注册第一个账号，进管理页认领管理员。库里还没有管理员时，认领会成功；已经有管理员时会拒绝。

## 旧节点怎么保住

`scripts/xray-sync.py` 只增改邮箱以 `zhanmen-` 开头的客户端。邮箱 `reality-main` 的 UUID、flow、流量和路由都不动。脚本拒绝把旧 UUID 再注册成面板用户。

面板用户写入两张表：`clients` 和 `client_inbounds`。`client_inbounds.flow_override` 必须是 `xtls-rprx-vision`。只写 `clients.flow` 不够，实测会出现 `SSL_ERROR_SYSCALL`，测速超时。

路由只对 `zhanmen-*` 生效：国内域名和国内 IP 直连，白名单放行，其余拒绝。旧客户端不在这组规则里。

每次有人拉取订阅，面板才会把当前用户和白名单同步进 x-ui。改完白名单后要重新拉一次订阅，服务端规则才会更新。同步前会备份数据库到 `/etc/zhanmen/x-ui.db.before-panel-clients`。

## 订阅和客户端

Clash 和 Shadowrocket 都从白名单生成。规则顺序是：

1. `GEOIP,CN` 和 `GEOSITE,cn` 直连。国内站不拦。
2. 服务器自己的 IP 直连，避免回环。
3. 白名单走代理。
4. 其余拒绝。

所以“测速通了但某个网站打不开”，先看域名在不在白名单，不要先怀疑端口。

Clash 配置里有两处是这次才补上的，缺了就会超时：

- `reality-opts.support-x25519mlkem768: true`。Xray 26.9.8 起要求 ClientHello 带 X25519MLKEM768。Mihomo 默认会把这项删掉，表现就是 `REALITY authentication failed`，界面上是 timeout。Xray 官方客户端不受影响，所以用 Xray 测通、用 Clash 测不通。
- 公钥用引号包起来。这台机器的公钥以 `-` 开头，不引号时 YAML 可能把整份配置解析坏。

重置订阅会换 token。旧链接立刻 404，客户端必须重新导入。

面板是 HTTP，浏览器的 Clipboard API 不能用。复制按钮走的是 `document.execCommand("copy")`。

## 白名单怎么加

域名写在 `migrations/000N_*.sql`，用 `on conflict do nothing`。PGlite 在进程启动时按文件名执行还没跑过的迁移，而且迁移内容是构建时打进包里的。只改服务器上的 sql 文件不会生效，要重新 `npm run build` 并重启 `zhanmen`。

然后拉一次任意订阅，让 xray-sync 把新域名写进路由。客户端也要更新订阅，否则本地规则仍是旧的。

已经加过的几类：

- 开发、代码托管、AI 站点，见 `migrations/0003_allowlist.sql`
- Clash Verge 首页 IP 信息：`ip.sb`、`ipapi.co`、`ipapi.is`、`ipwho.is`、`ip.api.skk.moe`、`geojs.io`
- Apple ID 登录 ChatGPT。只放 `appleid.apple.com` 和 `idmsa.apple.com` 不够，登录还会访问 `gsa.apple.com`、`account.apple.com`、`appleid.cdn-apple.com`、`setup.icloud.com`。所以放了 `apple.com`、`cdn-apple.com`、`icloud.com` 以及 OpenAI 官方列出的登录和客户端域名

## 不要再做的事

- 不要把 Xray 换成 26.7.28。同一把密钥在那个版本上，最小配置也握手失败。
- 不要设置 REALITY `minClientVer`。26.9.9 上它修不好 Clash；26.7.28 上设成 `1.1.1` 反而把正常客户端也断开。
- 不要在同步脚本里每次都重启 x-ui。已经一致就直接返回。
- 不要把私钥写进 xray 模板或这个仓库。
- 不要用端口 80 反代面板，除非确认那台机器上没有别的站点。
