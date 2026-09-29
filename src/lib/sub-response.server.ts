import { clashDocument, shadowDocument, userinfoHeader } from "@/lib/subscription";

export async function subscriptionResponse(token: string, kind: "clash" | "shadow"): Promise<Response> {
  const { loadSubscription } = await import("./panel.logic.server");
  const { syncPanelNodes } = await import("./xray-sync.server");
  const row = await loadSubscription(token);
  if (!row) return new Response("not found", { status: 404 });
  if (!row.enabled) return new Response("disabled", { status: 403 });
  try {
    await syncPanelNodes(row.allUuids, row.domains);
  } catch (error) {
    console.error("[xray-sync]", error instanceof Error ? error.message : error);
  }
  const body =
    kind === "clash"
      ? clashDocument({ uuid: row.uuid, domains: row.domains })
      : shadowDocument({ uuid: row.uuid, domains: row.domains });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": kind === "clash" ? "application/yaml; charset=utf-8" : "text/plain; charset=utf-8",
      "subscription-userinfo": userinfoHeader(row.totalBytes, row.usedBytes),
      "profile-update-interval": "12",
      "cache-control": "no-store",
    },
  });
}
