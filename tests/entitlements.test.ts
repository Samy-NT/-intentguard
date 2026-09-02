import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  currentUsagePeriodStart,
  evaluateWorkspaceEntitlements,
  normalizeMonthlyVerificationLimit,
  normalizeWorkspaceStatus,
} from "@/lib/entitlements";

function mockDb(count: number, error: { message: string } | null = null): SupabaseClient {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => Promise.resolve({ count, error })),
  };
  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient;
}

describe("workspace entitlements", () => {
  const now = new Date("2026-09-15T12:34:56.000Z");

  it("normalizes workspace status and monthly limits", () => {
    expect(normalizeWorkspaceStatus("suspended")).toBe("suspended");
    expect(normalizeWorkspaceStatus("unknown")).toBe("active");
    expect(normalizeMonthlyVerificationLimit(100.8)).toBe(100);
    expect(normalizeMonthlyVerificationLimit(0)).toBeNull();
    expect(normalizeMonthlyVerificationLimit("100")).toBeNull();
    expect(currentUsagePeriodStart(now)).toBe("2026-09-01T00:00:00.000Z");
  });

  it("blocks suspended workspaces without querying usage", async () => {
    const db = mockDb(0);

    const decision = await evaluateWorkspaceEntitlements(db, "ws_1", { workspace_status: "suspended" }, now);

    expect(decision).toMatchObject({ allowed: false, status: 403 });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("allows unlimited workspaces without querying usage", async () => {
    const db = mockDb(0);

    const decision = await evaluateWorkspaceEntitlements(db, "ws_1", { monthly_verification_limit: null }, now);

    expect(decision).toMatchObject({ allowed: true, usage: { limit: null, used: 0 } });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("blocks when the monthly verification limit is reached", async () => {
    const db = mockDb(10);

    const decision = await evaluateWorkspaceEntitlements(db, "ws_1", { monthly_verification_limit: 10 }, now);

    expect(decision).toMatchObject({
      allowed: false,
      status: 402,
      usage: {
        period_start: "2026-09-01T00:00:00.000Z",
        used: 10,
        limit: 10,
      },
    });
  });

  it("allows when usage is below the monthly verification limit", async () => {
    const db = mockDb(9);

    const decision = await evaluateWorkspaceEntitlements(db, "ws_1", { monthly_verification_limit: 10 }, now);

    expect(decision).toMatchObject({ allowed: true, usage: { used: 9, limit: 10 } });
  });
});
