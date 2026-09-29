import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

function message(error: unknown): never {
  if (error instanceof Error && error.message) throw new Error(error.message);
  throw new Error("没有完成，请再试一次");
}

export const getMyPanel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const { loadMine } = await import("./panel.logic.server");
      return loadMine(context.userId);
    } catch (error) {
      message(error);
    }
  });

export const redeemTraffic = createServerFn({ method: "POST" })
  .validator((code: string) => code)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    try {
      const { redeemCode } = await import("./panel.logic.server");
      return redeemCode(context.userId, data);
    } catch (error) {
      message(error);
    }
  });

export const resetSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const { rotateSubscription } = await import("./panel.logic.server");
      return rotateSubscription(context.userId);
    } catch (error) {
      message(error);
    }
  });

export const getAdminHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const { loadAdmin } = await import("./panel.logic.server");
      return loadAdmin(context.userId);
    } catch (error) {
      message(error);
    }
  });

export const becomeAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const { claimAdmin } = await import("./panel.logic.server");
      return claimAdmin(context.userId);
    } catch (error) {
      message(error);
    }
  });

export const updateUser = createServerFn({ method: "POST" })
  .validator((input: {
    userId: string;
    op: "set-total" | "add" | "set-used" | "enabled";
    gb?: number;
    enabled?: boolean;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    try {
      const { adjustUser } = await import("./panel.logic.server");
      await adjustUser(context.userId, data);
      return { ok: true as const };
    } catch (error) {
      message(error);
    }
  });

export const generateCodes = createServerFn({ method: "POST" })
  .validator((input: {
    count: number;
    prefix: string;
    grantGb: number;
    maxUses: number;
    note: string;
    code?: string;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    try {
      const { createCodes } = await import("./panel.logic.server");
      return createCodes(context.userId, data);
    } catch (error) {
      message(error);
    }
  });

export const editCodes = createServerFn({ method: "POST" })
  .validator((input: {
    ids: number[];
    grantGb?: number;
    maxUses?: number;
    enabled?: boolean;
    removeUnused?: boolean;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    try {
      const { patchCodes } = await import("./panel.logic.server");
      return patchCodes(context.userId, data);
    } catch (error) {
      message(error);
    }
  });

export const saveDomain = createServerFn({ method: "POST" })
  .validator((domain: string) => domain)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    try {
      const { addDomain } = await import("./panel.logic.server");
      await addDomain(context.userId, data);
      return { ok: true as const };
    } catch (error) {
      message(error);
    }
  });

export const deleteDomain = createServerFn({ method: "POST" })
  .validator((domain: string) => domain)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    try {
      const { removeDomain } = await import("./panel.logic.server");
      await removeDomain(context.userId, data);
      return { ok: true as const };
    } catch (error) {
      message(error);
    }
  });
