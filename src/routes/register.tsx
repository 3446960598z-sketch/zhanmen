import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthScreen, Button, Field, Notice } from "@/components/panel";
import { authClient, authEnabled } from "@/lib/auth/client";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "注册 · 栈门" }] }),
  component: RegisterPage,
});

function zhAuth(message: string | undefined): string {
  const text = (message ?? "").toLowerCase();
  if (text.includes("already") || text.includes("exist")) return "这个邮箱已经注册过了";
  if (text.includes("password")) return "密码至少 8 位";
  if (text.includes("email")) return "邮箱格式不对";
  return "没有注册成功，请再试一次";
}

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.signUp.email({
      name: name.trim() || "用户",
      email: email.trim(),
      password,
      callbackURL: "/app",
    });
    if (result.error) {
      setError(zhAuth(result.error.message));
      setPending(false);
      return;
    }
    await navigate({ to: "/app" });
  }

  return (
    <AuthScreen>
      <Link to="/" className="text-sm font-semibold text-pine">
        栈门
      </Link>
      <h1 className="mt-3 text-2xl">注册</h1>
      {authEnabled ? (
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <Field label="名字" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
          <Field label="邮箱" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <Field label="密码" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "正在创建" : "注册"}
          </Button>
        </form>
      ) : (
        <div className="mt-6">
          <Notice>注册还没打开。</Notice>
        </div>
      )}
      <p className="mt-4 text-sm">
        <Link to="/login" className="font-semibold text-pine">
          登录
        </Link>
      </p>
    </AuthScreen>
  );
}
