import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-sm">{children}</div>
    </div>
  );
}

export function Shell({
  children,
  admin,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  return (
    <div className="min-h-screen bg-bg text-ink md:grid md:grid-cols-[14rem_1fr]">
      <aside className="border-b border-line bg-surface md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <Link to="/app" className="text-lg font-semibold tracking-tight">
            栈门
          </Link>
          <nav className="mt-0 flex gap-4 text-sm font-medium md:mt-6 md:flex-col md:gap-1">
            <Link to="/app" className="inline-flex min-h-11 items-center rounded-md px-2 hover:bg-bg">
              订阅
            </Link>
            {admin ? (
              <Link to="/admin" className="inline-flex min-h-11 items-center rounded-md px-2 hover:bg-bg">
                管理
              </Link>
            ) : null}
          </nav>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-14 items-center justify-end border-b border-line bg-surface px-4">
          <UserButton />
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface p-5 shadow-sm ${className}`}>{children}</section>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "danger" | "ghost";
};

const buttonStyles = {
  primary: "bg-pine text-on-pine hover:opacity-90",
  quiet: "border border-line bg-surface text-ink hover:bg-bg",
  danger: "bg-danger text-on-danger hover:opacity-90",
  ghost: "bg-transparent text-ink hover:bg-bg",
};

export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        {...props}
        className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-pine"
      />
    </label>
  );
}

export function Notice({ children, tone = "quiet" }: { children: ReactNode; tone?: "quiet" | "bad" }) {
  return (
    <p className={`rounded-md px-3 py-2 text-sm ${tone === "bad" ? "bg-danger/10 text-danger" : "bg-bg text-ink/70"}`}>
      {children}
    </p>
  );
}
