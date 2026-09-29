import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, RefreshCw } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { formatBytes, formatWhen } from "@/lib/format";
import { getMyPanel, redeemTraffic, resetSubscription } from "@/lib/panel.functions";
import { Button, Card, Field, Notice, Shell } from "@/components/panel";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "我的订阅 · 栈门" }] }),
  component: AppPage,
});

type Mine = Awaited<ReturnType<typeof getMyPanel>>;

function absolute(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function AppPage() {
  const { user, isPending } = useCurrentUserState();
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [justReset, setJustReset] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    getMyPanel()
      .then((next) => {
        if (!cancel) setMine(next);
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "没有读到订阅");
      });
    return () => {
      cancel = true;
    };
  }, [user]);

  if (isPending) {
    return (
      <Shell>
        <p className="text-sm text-ink/60">正在确认身份</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const total = mine?.totalBytes ?? 0;
  const used = Math.min(mine?.usedBytes ?? 0, total);
  const remain = Math.max(0, total - used);
  const ratio = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const clash = mine ? absolute(mine.clashPath) : "";
  const shadow = mine ? absolute(mine.shadowPath) : "";

  function copy(label: string, value: string) {
    if (!value) return;
    if (writeClipboard(value)) {
      setCopied(label);
      setError(null);
      return;
    }
    setError("没有复制成功，请长按链接复制");
  }

  async function redeem(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setMine(await redeemTraffic({ data: code }));
      setCode("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "兑换失败");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      setMine(await resetSubscription());
      setJustReset(true);
      setConfirmReset(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "重置失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell admin={mine?.role === "admin"}>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <p className="text-sm font-semibold text-pine">剩余流量</p>
          <p className="mt-2 font-display text-5xl tabular-nums">{mine ? formatBytes(remain) : "…"}</p>
          <p className="mt-2 text-sm tabular-nums text-ink/65">
            已用 {formatBytes(used)} / 共 {formatBytes(total)}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-pine" style={{ width: `${ratio}%` }} />
          </div>
          {!mine?.enabled ? <div className="mt-4"><Notice tone="bad">这个账号已停用，订阅链接暂时打不开。</Notice></div> : null}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="font-display text-2xl">兑换</h2>
          <form className="mt-4 space-y-3" onSubmit={redeem}>
            <Field label="兑换码" value={code} autoCapitalize="characters" onChange={(event) => setCode(event.target.value)} />
            <Button type="submit" className="w-full" disabled={busy || !code.trim()}>
              兑换流量
            </Button>
          </form>
          {mine?.redemptions.length ? (
            <ul className="mt-4 space-y-2 text-sm text-ink/70">
              {mine.redemptions.map((item) => (
                <li key={`${item.code}-${item.createdAt}`} className="flex justify-between gap-3 tabular-nums">
                  <span>{item.code}</span>
                  <span>+{formatBytes(item.grantBytes)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
        <Card className="lg:col-span-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl">订阅链接</h2>
            </div>
            {mine?.role === "admin" || mine?.adminCount === 0 ? (
              <Link to="/admin" className="shrink-0 text-sm font-semibold text-pine">
                {mine?.role === "admin" ? "管理" : "成为管理员"}
              </Link>
            ) : null}
          </div>
          {justReset ? <div className="mt-3"><Notice>旧链接和已导入的配置已经失效。</Notice></div> : null}
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <LinkBox title="Clash" value={clash} copied={copied === "Clash"} onCopy={() => copy("Clash", clash)} />
            <LinkBox title="Shadowrocket" value={shadow} copied={copied === "Shadowrocket"} onCopy={() => copy("Shadowrocket", shadow)} />
          </div>
          <p className="mt-3 text-xs text-ink/55">上次重置 {formatWhen(mine?.rotatedAt)}</p>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="text-xl">重置订阅</h2>
          {confirmReset ? (
            <div className="mt-4 space-y-3">
              <Notice tone="bad">确认后需要重新导入新链接。</Notice>
              <div className="flex gap-2">
                <Button variant="danger" disabled={busy} onClick={() => void reset()}>
                  <RefreshCw className="size-4" />
                  确认重置
                </Button>
                <Button variant="quiet" onClick={() => setConfirmReset(false)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="quiet" className="mt-4" onClick={() => setConfirmReset(true)}>
              重置链接
            </Button>
          )}
        </Card>
      </div>
      {error ? <div className="mt-4"><Notice tone="bad">{error}</Notice></div> : null}
    </Shell>
  );
}

function writeClipboard(value: string): boolean {
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.fontSize = "16px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(area);
  selection?.removeAllRanges();
  selection?.addRange(range);
  area.focus();
  area.select();
  area.setSelectionRange(0, value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  selection?.removeAllRanges();
  area.remove();
  return ok;
}

function LinkBox({
  title,
  value,
  copied,
  onCopy,
}: {
  title: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-xl bg-bg p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-sans text-sm font-semibold">{title}</h3>
        <Button variant="quiet" className="min-h-11 px-3" onClick={onCopy} disabled={!value}>
          <Copy className="size-4" />
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
      <p className="mt-2 text-sm break-all text-ink/75">{value || "正在生成"}</p>
    </div>
  );
}
