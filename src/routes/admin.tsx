import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatBytes, formatWhen } from "@/lib/format";
import {
  becomeAdmin,
  deleteDomain,
  editCodes,
  generateCodes,
  getAdminHome,
  saveDomain,
  updateUser,
} from "@/lib/panel.functions";
import { Button, Card, Field, Notice, Shell } from "@/components/panel";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "管理 · 栈门" }] }),
  component: AdminPage,
});

type Home = Awaited<ReturnType<typeof getAdminHome>>;
type Tab = "users" | "codes" | "domains";

function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setHome(await getAdminHome());
  }

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    getAdminHome()
      .then((next) => {
        if (!cancel) setHome(next);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "没有打开管理");
      });
    return () => {
      cancel = true;
    };
  }, [user]);

  if (isPending || (user && !home && !error)) {
    return (
      <Shell admin>
        <p className="text-sm text-ink/60">正在打开管理</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!home) {
    return (
      <Shell admin>
        <Notice tone="bad">{error ?? "没有打开管理"}</Notice>
      </Shell>
    );
  }
  if (home.role !== "admin") {
    return (
      <Shell>
        <Card>
          <h1 className="font-display text-4xl">管理</h1>
          {home.adminCount === 0 ? (
            <>
              <p className="mt-3 text-sm text-ink/75">还没有管理员。第一个接手的注册用户可以管理用户、流量和兑换码。</p>
              <Button
                className="mt-5"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  becomeAdmin()
                    .then(setHome)
                    .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "没有成功"))
                    .finally(() => setBusy(false));
                }}
              >
                接手管理
              </Button>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink/75">已经有管理员了。这个账号不能进入管理。</p>
          )}
          {error ? <div className="mt-4"><Notice tone="bad">{error}</Notice></div> : null}
        </Card>
      </Shell>
    );
  }

  return (
    <Shell admin>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(
          [
            ["users", "用户"],
            ["codes", "兑换码"],
            ["domains", "白名单"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${tab === id ? "bg-pine text-on-pine" : "bg-surface text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <div className="mb-4"><Notice tone="bad">{error}</Notice></div> : null}
      {tab === "users" ? (
        <UsersPanel
          users={home.users}
          busy={busy}
          onRun={async (work) => {
            setBusy(true);
            setError(null);
            try {
              await work();
              await reload();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "没有保存");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {tab === "codes" ? (
        <CodesPanel
          codes={home.codes}
          busy={busy}
          onRun={async (work) => {
            setBusy(true);
            setError(null);
            try {
              await work();
              await reload();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "没有保存");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {tab === "domains" ? (
        <DomainsPanel
          domains={home.domains}
          busy={busy}
          onRun={async (work) => {
            setBusy(true);
            setError(null);
            try {
              await work();
              await reload();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "没有保存");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </Shell>
  );
}

function UsersPanel({
  users,
  busy,
  onRun,
}: {
  users: Home["users"];
  busy: boolean;
  onRun: (work: () => Promise<void>) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Home["users"][number] | null>(null);
  const [totalGb, setTotalGb] = useState("10");
  const [addGb, setAddGb] = useState("1");
  const [usedGb, setUsedGb] = useState("0");
  const visible = useMemo(
    () => users.filter((item) => `${item.email} ${item.name}`.toLowerCase().includes(query.trim().toLowerCase())),
    [users, query],
  );

  return (
    <div className="space-y-3">
      <Field label="查找用户" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="邮箱" />
      {visible.map((item) => {
        const remain = Math.max(0, item.totalBytes - item.usedBytes);
        return (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.email}</p>
                <p className="text-sm text-ink/60">{item.role === "admin" ? "管理员" : "用户"} · {item.enabled ? "可用" : "已停用"}</p>
              </div>
              <p className="shrink-0 text-right text-sm tabular-nums">
                剩余 {formatBytes(remain)}
                <span className="block text-ink/55">共 {formatBytes(item.totalBytes)}</span>
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="quiet"
                onClick={() => {
                  setTarget(item);
                  setTotalGb(String(Math.round((item.totalBytes / 1024 ** 3) * 10) / 10));
                  setUsedGb(String(Math.round((item.usedBytes / 1024 ** 3) * 10) / 10));
                }}
              >
                调整流量
              </Button>
              <Button
                variant={item.enabled ? "ghost" : "primary"}
                disabled={busy}
                onClick={() => void onRun(() => updateUser({ data: { userId: item.id, op: "enabled", enabled: !item.enabled } }).then(() => undefined))}
              >
                {item.enabled ? "停用" : "启用"}
              </Button>
            </div>
          </Card>
        );
      })}
      {target ? (
        <Card>
          <h2 className="font-display text-2xl">调整 {target.email}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="设为总流量 GB" inputMode="decimal" value={totalGb} onChange={(event) => setTotalGb(event.target.value)} />
            <Field label="追加 GB" inputMode="decimal" value={addGb} onChange={(event) => setAddGb(event.target.value)} />
            <Field label="设为已用 GB" inputMode="decimal" value={usedGb} onChange={(event) => setUsedGb(event.target.value)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void onRun(async () => { await updateUser({ data: { userId: target.id, op: "set-total", gb: Number(totalGb) } }); setTarget(null); })}>
              保存总量
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => void onRun(() => updateUser({ data: { userId: target.id, op: "add", gb: Number(addGb) } }).then(() => undefined))}>
              追加
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => void onRun(() => updateUser({ data: { userId: target.id, op: "set-used", gb: Number(usedGb) } }).then(() => undefined))}>
              改已用
            </Button>
            <Button variant="ghost" onClick={() => setTarget(null)}>关闭</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function CodesPanel({
  codes,
  busy,
  onRun,
}: {
  codes: Home["codes"];
  busy: boolean;
  onRun: (work: () => Promise<void>) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [prefix, setPrefix] = useState("ZM");
  const [count, setCount] = useState("5");
  const [grantGb, setGrantGb] = useState("10");
  const [maxUses, setMaxUses] = useState("1");
  const [custom, setCustom] = useState("");
  const [batchGb, setBatchGb] = useState("10");
  const [batchUses, setBatchUses] = useState("1");
  const [made, setMade] = useState<string[]>([]);

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    await onRun(async () => {
      const codesMade = await generateCodes({
        data: {
          count: custom.trim() ? 1 : Number(count),
          prefix,
          grantGb: Number(grantGb),
          maxUses: Number(maxUses),
          note: custom.trim() ? "单独创建" : "批量生成",
          code: custom.trim() || undefined,
        },
      });
      setMade(codesMade);
      setCustom("");
    });
  }

  return (
    <div className="space-y-3">
      <Card>
        <h2 className="font-display text-2xl">新建兑换码</h2>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void generate(event)}>
          <Field label="数量" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} />
          <Field label="前缀" value={prefix} onChange={(event) => setPrefix(event.target.value)} />
          <Field label="每个码的流量 GB" inputMode="decimal" value={grantGb} onChange={(event) => setGrantGb(event.target.value)} />
          <Field label="每个码可用次数" inputMode="numeric" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
          <Field label="指定兑换码，留空则批量生成" value={custom} onChange={(event) => setCustom(event.target.value)} />
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={busy}>生成</Button>
          </div>
        </form>
        {made.length ? <p className="mt-3 text-sm break-all text-ink/70">刚生成：{made.join("、")}</p> : null}
      </Card>
      {selected.length ? (
        <Card>
          <p className="text-sm font-semibold">已选 {selected.length} 个</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="批量改为流量 GB" inputMode="decimal" value={batchGb} onChange={(event) => setBatchGb(event.target.value)} />
            <Field label="批量改为可用次数" inputMode="numeric" value={batchUses} onChange={(event) => setBatchUses(event.target.value)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void onRun(() => editCodes({ data: { ids: selected, grantGb: Number(batchGb) } }).then(() => undefined))}>改流量</Button>
            <Button variant="quiet" disabled={busy} onClick={() => void onRun(() => editCodes({ data: { ids: selected, maxUses: Number(batchUses) } }).then(() => undefined))}>改次数</Button>
            <Button variant="quiet" disabled={busy} onClick={() => void onRun(() => editCodes({ data: { ids: selected, enabled: true } }).then(() => undefined))}>启用</Button>
            <Button variant="quiet" disabled={busy} onClick={() => void onRun(() => editCodes({ data: { ids: selected, enabled: false } }).then(() => undefined))}>停用</Button>
            <Button variant="danger" disabled={busy} onClick={() => void onRun(async () => { await editCodes({ data: { ids: selected, removeUnused: true } }); setSelected([]); })}>删除未使用</Button>
          </div>
        </Card>
      ) : null}
      {codes.map((item) => (
        <Card key={item.id}>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 size-5 accent-pine" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold tracking-wide">{item.code}</span>
              <span className="mt-1 block text-sm text-ink/65">
                {formatBytes(item.grantBytes)} · 已用 {item.usedCount}/{item.maxUses} · {item.enabled ? "启用" : "停用"} · {formatWhen(item.createdAt)}
              </span>
              {item.note ? <span className="mt-1 block text-sm text-ink/55">{item.note}</span> : null}
            </span>
          </label>
        </Card>
      ))}
    </div>
  );
}

function DomainsPanel({
  domains,
  busy,
  onRun,
}: {
  domains: string[];
  busy: boolean;
  onRun: (work: () => Promise<void>) => Promise<void>;
}) {
  const [domain, setDomain] = useState("");
  const [query, setQuery] = useState("");
  const visible = domains.filter((item) => item.includes(query.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <Card>
        <h2 className="text-xl">白名单</h2>
        <p className="mt-2 text-sm text-ink/70">{domains.length} 个域名</p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void onRun(async () => {
              await saveDomain({ data: domain });
              setDomain("");
            });
          }}
        >
          <div className="flex-1">
            <Field label="添加域名" value={domain} placeholder="github.com" onChange={(event) => setDomain(event.target.value)} />
          </div>
          <Button type="submit" disabled={busy || !domain.trim()}>添加</Button>
        </form>
      </Card>
      <Field label="查找" value={query} placeholder="openai" onChange={(event) => setQuery(event.target.value)} />
      {domains.length === 0 ? <Notice>还没有域名。国外流量目前全部拒绝。</Notice> : null}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {visible.map((item) => (
          <li key={item} className="flex min-h-11 items-center justify-between gap-3 px-4">
            <span className="text-sm">{item}</span>
            <Button variant="ghost" disabled={busy} onClick={() => void onRun(() => deleteDomain({ data: item }).then(() => undefined))}>
              移除
            </Button>
          </li>
        ))}
      </ul>
      {domains.length > 0 && visible.length === 0 ? <Notice>没有匹配的域名。</Notice> : null}
    </div>
  );
}
