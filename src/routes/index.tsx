import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { AuthScreen } from "@/components/panel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (!isPending && user) return <Navigate to="/app" />;

  return (
    <AuthScreen>
      <p className="text-center text-2xl font-semibold">栈门</p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          to="/login"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-pine font-semibold text-on-pine"
        >
          登录
        </Link>
        <Link
          to="/register"
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-line bg-surface font-semibold"
        >
          注册
        </Link>
      </div>
    </AuthScreen>
  );
}
