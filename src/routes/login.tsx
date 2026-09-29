import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthScreen, Button, Field, Notice } from "@/components/panel";
import { authClient, authEnabled } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "登录 · 栈门" }] }),
  component: LoginPage,
});

function zhAuth(message: string | undefined): string {
  const text = (message ?? "").toLowerCase();
  if (text.includes("invalid") || text.includes("password") || text.includes("credential")) return "邮箱或密码不正确";
  if (text.includes("origin")) return "登录环境没有通过校验，请刷新后再试";
  return "没有登录成功，请再试一次";
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.signIn.email({ email: email.trim(), password });
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
      <h1 className="mt-3 text-2xl">登录</h1>
      {authEnabled ? (
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <Field label="邮箱" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <Field label="密码" type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "正在登录" : "登录"}
          </Button>
        </form>
      ) : (
        <div className="mt-6">
          <Notice>登录还没打开。</Notice>
        </div>
      )}
      <p className="mt-4 text-sm">
        <Link to="/register" className="font-semibold text-pine">
          注册
        </Link>
      </p>
    </AuthScreen>
  );
}
