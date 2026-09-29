export const PREVIEW_SERVER = "not-connected.invalid";
export const PREVIEW_PUBLIC_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const PREVIEW_SHORT_ID = "a1b2c3d4";

/** Existing Japan subscription. Direct, unrestricted, and not editable. */
export const LEGACY_SUBSCRIPTION = {
  host: "82.108.198.150",
  proxyPort: 443,
  subPort: 2096,
} as const;

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type ProxyNode = {
  host: string;
  port: number;
  uuid: string;
  sni: string;
  publicKey: string;
  shortId: string;
  flow: string;
  spiderX: string;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function proxyNode(uuid: string): ProxyNode {
  const host = env("XRAY_HOST");
  const publicKey = env("XRAY_PUBLIC_KEY");
  const shortId = env("XRAY_SHORT_ID");
  const port = Number(env("XRAY_PORT") || "443");
  return {
    host: host || PREVIEW_SERVER,
    port: Number.isInteger(port) && port > 0 ? port : 443,
    uuid,
    sni: env("XRAY_SNI") || "www.microsoft.com",
    publicKey: publicKey || PREVIEW_PUBLIC_KEY,
    shortId: shortId || PREVIEW_SHORT_ID,
    flow: env("XRAY_FLOW") || "xtls-rprx-vision",
    spiderX: env("XRAY_SPIDERX") || "/",
  };
}

export function normalizeDomain(input: string): string | null {
  const domain = input.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
  if (!DOMAIN_RE.test(domain)) return null;
  if (domain.includes("..")) return null;
  return domain;
}

function clashRules(domains: string[]): string[] {
  return [
    "  - GEOIP,CN,DIRECT",
    "  - GEOSITE,cn,DIRECT",
    `  - IP-CIDR,${LEGACY_SUBSCRIPTION.host}/32,DIRECT,no-resolve`,
    ...domains.map((domain) => `  - DOMAIN-SUFFIX,${domain},Proxy`),
    "  - MATCH,REJECT",
  ];
}

export function clashDocument(input: {
  uuid: string;
  domains: string[];
}): string {
  const node = proxyNode(input.uuid);
  return [
    "mixed-port: 7890",
    "allow-lan: false",
    "mode: rule",
    "log-level: warning",
    "proxies:",
    "  - name: Lane",
    "    type: vless",
    `    server: ${node.host}`,
    `    port: ${node.port}`,
    `    uuid: ${node.uuid}`,
    "    network: tcp",
    "    udp: true",
    "    tls: true",
    `    flow: ${node.flow}`,
    `    servername: ${node.sni}`,
    "    client-fingerprint: chrome",
    "    reality-opts:",
    `      public-key: ${JSON.stringify(node.publicKey)}`,
    `      short-id: ${JSON.stringify(node.shortId)}`,
    `      spider-x: ${JSON.stringify(node.spiderX)}`,
    "      support-x25519mlkem768: true",
    "proxy-groups:",
    "  - name: Proxy",
    "    type: select",
    "    proxies:",
    "      - Lane",
    "rules:",
    ...clashRules(input.domains),
    "",
  ].join("\n");
}

export function shadowDocument(input: {
  uuid: string;
  domains: string[];
}): string {
  const node = proxyNode(input.uuid);
  const rules = [
    "GEOIP,CN,DIRECT",
    `IP-CIDR,${LEGACY_SUBSCRIPTION.host}/32,DIRECT`,
    ...input.domains.map((domain) => `DOMAIN-SUFFIX,${domain},Lane`),
    "FINAL,REJECT",
  ];
  return [
    "[General]",
    "bypass-system = true",
    "skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local",
    "dns-server = system",
    "ipv6 = false",
    "",
    "[Proxy]",
    `Lane = vless, ${node.host}, ${node.port}, username=${node.uuid}, tls=true, flow=${node.flow}, reality-public-key=${node.publicKey}, reality-short-id=${node.shortId}, reality-spider-x=${node.spiderX}, sni=${node.sni}, fingerprint=chrome, udp=true`,
    "",
    "[Rule]",
    ...rules,
    "",
  ].join("\n");
}

export function userinfoHeader(total: number, used: number): string {
  const safeTotal = Math.max(0, Math.round(total));
  const download = Math.max(0, Math.min(Math.round(used), safeTotal));
  return `upload=0; download=${download}; total=${safeTotal}; expire=0`;
}
