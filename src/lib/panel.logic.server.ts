import { getSql, type Sql } from "@/lib/db";
import { gbToBytes } from "@/lib/format";
import { normalizeDomain } from "@/lib/subscription";

export type Mine = {
  email: string;
  role: "user" | "admin";
  enabled: boolean;
  totalBytes: number;
  usedBytes: number;
  clashPath: string;
  shadowPath: string;
  rotatedAt: string | null;
  adminCount: number;
  domains: string[];
  redemptions: { code: string; grantBytes: number; createdAt: string }[];
};

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  enabled: boolean;
  totalBytes: number;
  usedBytes: number;
};

export type CodeRow = {
  id: number;
  code: string;
  grantBytes: number;
  maxUses: number;
  usedCount: number;
  enabled: boolean;
  note: string;
  createdAt: string;
};

export type AdminHome = {
  role: "user" | "admin";
  adminCount: number;
  users: UserRow[];
  codes: CodeRow[];
  domains: string[];
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stamp(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  return text.length ? text : null;
}

function newToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function ensureUser(sql: Sql, userId: string) {
  await sql`insert into profiles (user_id) values (${userId}) on conflict (user_id) do nothing`;
  await sql`insert into traffic (user_id) values (${userId}) on conflict (user_id) do nothing`;
  await sql`
    insert into nodes (user_id, uuid, sub_token)
    values (${userId}, ${crypto.randomUUID()}, ${newToken()})
    on conflict (user_id) do nothing
  `;
}

async function adminCount(sql: Sql): Promise<number> {
  const rows = await sql<{ c: unknown }>`select count(*) as c from profiles where role = 'admin'`;
  return num(rows[0]?.c);
}

async function roleOf(sql: Sql, userId: string): Promise<"user" | "admin"> {
  const rows = await sql<{ role: string }>`select role from profiles where user_id = ${userId}`;
  return rows[0]?.role === "admin" ? "admin" : "user";
}

async function requireAdmin(sql: Sql, userId: string) {
  if ((await roleOf(sql, userId)) !== "admin") throw new Error("只有管理员可以这样做");
}

function cleanGb(value: number, allowZero = false): number {
  if (!Number.isFinite(value) || value < 0 || value > 10240) throw new Error("流量要在 0 到 10240 GB 之间");
  if (!allowZero && value <= 0) throw new Error("流量要大于 0");
  return value;
}

function cleanIds(ids: number[]): number[] {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) throw new Error("先选择兑换码");
  if (unique.length > 200) throw new Error("一次最多处理 200 个");
  return unique;
}

export async function loadMine(userId: string): Promise<Mine> {
  const sql = await getSql();
  await ensureUser(sql, userId);
  const people = await sql<{ email: string }>`select email from "user" where id = ${userId}`;
  const profile = await sql<{ role: string; enabled: boolean }>`
    select role, enabled from profiles where user_id = ${userId}
  `;
  const traffic = await sql<{ total_bytes: unknown; used_bytes: unknown }>`
    select total_bytes, used_bytes from traffic where user_id = ${userId}
  `;
  const node = await sql<{ sub_token: string; rotated_at: unknown }>`
    select sub_token, rotated_at from nodes where user_id = ${userId}
  `;
  const domains = await sql<{ domain: string }>`select domain from allowlist order by domain`;
  const redemptions = await sql<{ code: string; grant_bytes: unknown; created_at: unknown }>`
    select c.code, r.grant_bytes, r.created_at
    from redemptions r
    join redeem_codes c on c.id = r.code_id
    where r.user_id = ${userId}
    order by r.created_at desc
    limit 8
  `;
  const token = node[0]?.sub_token ?? "";
  return {
    email: people[0]?.email ?? "",
    role: profile[0]?.role === "admin" ? "admin" : "user",
    enabled: profile[0]?.enabled !== false,
    totalBytes: num(traffic[0]?.total_bytes),
    usedBytes: num(traffic[0]?.used_bytes),
    clashPath: `/sub/${token}/clash`,
    shadowPath: `/sub/${token}/shadow`,
    rotatedAt: stamp(node[0]?.rotated_at),
    adminCount: await adminCount(sql),
    domains: domains.map((row) => row.domain),
    redemptions: redemptions.map((row) => ({
      code: row.code,
      grantBytes: num(row.grant_bytes),
      createdAt: stamp(row.created_at) ?? "",
    })),
  };
}

export async function redeemCode(userId: string, rawCode: string): Promise<Mine> {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{4,40}$/.test(code)) throw new Error("兑换码格式不对");
  const sql = await getSql();
  await ensureUser(sql, userId);
  const found = await sql<{
    id: number;
    grant_bytes: unknown;
    enabled: boolean;
    used_count: unknown;
    max_uses: unknown;
  }>`select id, grant_bytes, enabled, used_count, max_uses from redeem_codes where code = ${code}`;
  const row = found[0];
  if (!row || !row.enabled) throw new Error("兑换码无效");
  if (num(row.used_count) >= num(row.max_uses)) throw new Error("这个兑换码已经用完了");
  const bumped = await sql<{ grant_bytes: unknown }>`
    update redeem_codes
    set used_count = used_count + 1, updated_at = now()
    where id = ${row.id} and enabled and used_count < max_uses
    returning grant_bytes
  `;
  if (!bumped.length) throw new Error("这个兑换码已经用完了");
  const grant = num(bumped[0]?.grant_bytes);
  const inserted = await sql<{ id: number }>`
    insert into redemptions (code_id, user_id, grant_bytes)
    values (${row.id}, ${userId}, ${grant})
    on conflict (code_id, user_id) do nothing
    returning id
  `;
  if (!inserted.length) {
    await sql`
      update redeem_codes
      set used_count = greatest(used_count - 1, 0), updated_at = now()
      where id = ${row.id}
    `;
    throw new Error("你已经用过这个兑换码");
  }
  await sql`
    update traffic
    set total_bytes = total_bytes + ${grant}, updated_at = now()
    where user_id = ${userId}
  `;
  return loadMine(userId);
}

export async function rotateSubscription(userId: string): Promise<Mine> {
  const sql = await getSql();
  await ensureUser(sql, userId);
  await sql`
    update nodes
    set uuid = ${crypto.randomUUID()}, sub_token = ${newToken()}, rotated_at = now()
    where user_id = ${userId}
  `;
  const uuids = await sql<{ uuid: string }>`select uuid from nodes`;
  const domains = await sql<{ domain: string }>`select domain from allowlist order by domain`;
  try {
    const { syncPanelNodes } = await import("./xray-sync.server");
    await syncPanelNodes(
      uuids.map((item) => item.uuid),
      domains.map((item) => item.domain),
    );
  } catch (error) {
    console.error("[xray-sync]", error instanceof Error ? error.message : error);
  }
  return loadMine(userId);
}

export async function loadAdmin(userId: string): Promise<AdminHome> {
  const sql = await getSql();
  await ensureUser(sql, userId);
  const role = await roleOf(sql, userId);
  const count = await adminCount(sql);
  if (role !== "admin") return { role, adminCount: count, users: [], codes: [], domains: [] };
  const users = await sql<{
    id: string;
    email: string;
    name: string;
    role: string | null;
    enabled: boolean | null;
    total_bytes: unknown;
    used_bytes: unknown;
  }>`
    select u.id, u.email, u.name, p.role, p.enabled, t.total_bytes, t.used_bytes
    from "user" u
    left join profiles p on p.user_id = u.id
    left join traffic t on t.user_id = u.id
    order by u."createdAt" desc
  `;
  const codes = await sql<{
    id: number;
    code: string;
    grant_bytes: unknown;
    max_uses: number;
    used_count: number;
    enabled: boolean;
    note: string;
    created_at: unknown;
  }>`
    select id, code, grant_bytes, max_uses, used_count, enabled, note, created_at
    from redeem_codes
    order by id desc
  `;
  const domains = await sql<{ domain: string }>`select domain from allowlist order by domain`;
  return {
    role,
    adminCount: count,
    users: users.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role === "admin" ? "admin" : "user",
      enabled: row.enabled !== false,
      totalBytes: num(row.total_bytes),
      usedBytes: num(row.used_bytes),
    })),
    codes: codes.map((row) => ({
      id: row.id,
      code: row.code,
      grantBytes: num(row.grant_bytes),
      maxUses: num(row.max_uses),
      usedCount: num(row.used_count),
      enabled: row.enabled,
      note: row.note,
      createdAt: stamp(row.created_at) ?? "",
    })),
    domains: domains.map((row) => row.domain),
  };
}

export async function claimAdmin(userId: string): Promise<AdminHome> {
  const sql = await getSql();
  await ensureUser(sql, userId);
  const claimed = await sql<{ user_id: string }>`
    update profiles
    set role = 'admin'
    where user_id = ${userId}
      and not exists (select 1 from profiles where role = 'admin')
    returning user_id
  `;
  if (!claimed.length && (await roleOf(sql, userId)) !== "admin") {
    throw new Error("已经有管理员了");
  }
  return loadAdmin(userId);
}

export async function adjustUser(
  actorId: string,
  input: { userId: string; op: "set-total" | "add" | "set-used" | "enabled"; gb?: number; enabled?: boolean },
): Promise<void> {
  const sql = await getSql();
  await requireAdmin(sql, actorId);
  if (!input.userId) throw new Error("缺少用户");
  await ensureUser(sql, input.userId);
  if (input.op === "enabled") {
    if (typeof input.enabled !== "boolean") throw new Error("缺少状态");
    await sql`update profiles set enabled = ${input.enabled} where user_id = ${input.userId}`;
    return;
  }
  const gb = cleanGb(input.gb ?? NaN, true);
  const bytes = gbToBytes(gb);
  if (input.op === "set-total") {
    await sql`update traffic set total_bytes = ${bytes}, updated_at = now() where user_id = ${input.userId}`;
  } else if (input.op === "add") {
    await sql`update traffic set total_bytes = total_bytes + ${bytes}, updated_at = now() where user_id = ${input.userId}`;
  } else {
    await sql`update traffic set used_bytes = ${bytes}, updated_at = now() where user_id = ${input.userId}`;
  }
}

function randomCode(prefix: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  const clean = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "ZM";
  return `${clean}-${body}`;
}

export async function createCodes(
  actorId: string,
  input: { count: number; prefix: string; grantGb: number; maxUses: number; note: string; code?: string },
): Promise<string[]> {
  const sql = await getSql();
  await requireAdmin(sql, actorId);
  const count = Math.round(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("一次生成 1 到 100 个");
  const maxUses = Math.round(input.maxUses);
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000) throw new Error("可用次数要在 1 到 100000");
  const grant = gbToBytes(cleanGb(input.grantGb));
  const note = input.note.trim().slice(0, 80);
  const made: string[] = [];
  if (input.code?.trim()) {
    if (count !== 1) throw new Error("指定兑换码时一次只能建一个");
    const code = input.code.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9-]{4,40}$/.test(code)) throw new Error("兑换码格式不对");
    const inserted = await sql<{ code: string }>`
      insert into redeem_codes (code, grant_bytes, max_uses, note)
      values (${code}, ${grant}, ${maxUses}, ${note})
      on conflict (code) do nothing
      returning code
    `;
    if (!inserted.length) throw new Error("这个兑换码已经存在");
    return [inserted[0].code];
  }
  for (let i = 0; i < count; i += 1) {
    let code = randomCode(input.prefix);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const inserted = await sql<{ code: string }>`
        insert into redeem_codes (code, grant_bytes, max_uses, note)
        values (${code}, ${grant}, ${maxUses}, ${note})
        on conflict (code) do nothing
        returning code
      `;
      if (inserted.length) {
        made.push(inserted[0].code);
        break;
      }
      code = randomCode(input.prefix);
    }
  }
  if (made.length !== count) throw new Error("有一部分兑换码没有生成，请再试一次");
  return made;
}

export async function patchCodes(
  actorId: string,
  input: { ids: number[]; grantGb?: number; maxUses?: number; enabled?: boolean; removeUnused?: boolean },
): Promise<{ removed: number }> {
  const sql = await getSql();
  await requireAdmin(sql, actorId);
  const ids = cleanIds(input.ids);
  const list = ids.join(",");
  if (input.removeUnused) {
    const removed = await sql.query<{ id: number }>(
      `delete from redeem_codes where used_count = 0 and id in (${list}) returning id`,
    );
    return { removed: removed.length };
  }
  if (input.grantGb != null) {
    const grant = gbToBytes(cleanGb(input.grantGb));
    await sql.query(`update redeem_codes set grant_bytes = $1, updated_at = now() where id in (${list})`, [grant]);
  }
  if (input.maxUses != null) {
    const maxUses = Math.round(input.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000) throw new Error("可用次数要在 1 到 100000");
    await sql.query(`update redeem_codes set max_uses = $1, updated_at = now() where id in (${list})`, [maxUses]);
  }
  if (typeof input.enabled === "boolean") {
    await sql.query(`update redeem_codes set enabled = $1, updated_at = now() where id in (${list})`, [input.enabled]);
  }
  return { removed: 0 };
}

export async function addDomain(actorId: string, raw: string): Promise<void> {
  const sql = await getSql();
  await requireAdmin(sql, actorId);
  const domain = normalizeDomain(raw);
  if (!domain) throw new Error("域名格式不对，例如 github.com");
  await sql`insert into allowlist (domain) values (${domain}) on conflict (domain) do nothing`;
}

export async function removeDomain(actorId: string, raw: string): Promise<void> {
  const sql = await getSql();
  await requireAdmin(sql, actorId);
  const domain = normalizeDomain(raw);
  if (!domain) throw new Error("域名格式不对");
  await sql`delete from allowlist where domain = ${domain}`;
}

export async function loadSubscription(token: string): Promise<{
  uuid: string;
  enabled: boolean;
  totalBytes: number;
  usedBytes: number;
  domains: string[];
  allUuids: string[];
} | null> {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(token)) return null;
  const sql = await getSql();
  const rows = await sql<{
    uuid: string;
    enabled: boolean | null;
    total_bytes: unknown;
    used_bytes: unknown;
  }>`
    select n.uuid, p.enabled, t.total_bytes, t.used_bytes
    from nodes n
    left join profiles p on p.user_id = n.user_id
    left join traffic t on t.user_id = n.user_id
    where n.sub_token = ${token}
  `;
  const row = rows[0];
  if (!row) return null;
  const domains = await sql<{ domain: string }>`select domain from allowlist order by domain`;
  return {
    uuid: row.uuid,
    enabled: row.enabled !== false,
    totalBytes: num(row.total_bytes),
    usedBytes: num(row.used_bytes),
    domains: domains.map((item) => item.domain),
    allUuids: (await sql<{ uuid: string }>`select uuid from nodes`).map((item) => item.uuid),
  };
}
