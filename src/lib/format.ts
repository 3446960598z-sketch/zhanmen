const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(value: number): string {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (n < 1024) return `${Math.round(n)} B`;
  let v = n;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = v >= 10 || i <= 1 ? 0 : 1;
  return `${v.toFixed(digits)} ${UNITS[i]}`;
}

export function gbToBytes(gb: number): number {
  return Math.round(gb * 1024 * 1024 * 1024);
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export const DEMO_CODE = "ZHMEN-10G-DEMO";
