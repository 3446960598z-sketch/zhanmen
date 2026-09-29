import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function syncPanelNodes(uuids: string[], domains: string[]): Promise<void> {
  const script = (process.env.XRAY_SYNC ?? "").trim();
  if (!script) return;
  const file = "/var/lib/zhanmen/xray-sync.json";
  await writeFile(file, JSON.stringify({ uuids, domains }));
  await exec("python3", [script, "apply", file], { timeout: 40000 });
}
