import { describe, expect, it, vi } from "vitest";
import { reserveWorkspaceVerification } from "@/lib/entitlements";

function dbWithRpc(data: unknown, error: { message: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  } as never;
}

describe("atomic workspace entitlements", () => {
  it("returns suspended before calling the reservation RPC", async () => {
    const db = dbWithRpc([{ allowed: true, used: 1, limit_value: 10, already_reserved: false }]) as { rpc: ReturnType<typeof vi.fn> };
    const result = await reserveWorkspaceVerification(
      db as never,
      "00000000-0000-0000-0000-000000000001",
      "intent-1",
      { workspace_status: "suspended", monthly_verification_limit: 10 }
    );

    expect(result).toMatchObject({ allowed: false, status: 403 });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("maps an atomic reservation response", async () => {
    const db = dbWithRpc([{ allowed: true, used: 3, limit_value: 10, already_reserved: false }]) as { rpc: ReturnType<typeof vi.fn> };
    const result = await reserveWorkspaceVerification(
      db as never,
      "00000000-0000-0000-0000-000000000001",
      "intent-1",
      { monthly_verification_limit: 10 },
      new Date("2026-09-02T12:00:00.000Z")
    );

    expect(result).toMatchObject({ allowed: true, status: 200, usage: { used: 3, limit: 10 } });
    expect(db.rpc).toHaveBeenCalledWith("reserve_workspace_verification", {
      p_workspace_id: "00000000-0000-0000-0000-000000000001",
      p_period_start: "2026-09-01T00:00:00.000Z",
      p_intent_id: "intent-1",
      p_limit: 10,
    });
  });

  it("fails closed when the reservation RPC is unavailable", async () => {
    const db = dbWithRpc(null, { message: "function reserve_workspace_verification does not exist" });
    const result = await reserveWorkspaceVerification(
      db,
      "00000000-0000-0000-0000-000000000001",
      "intent-1",
      { monthly_verification_limit: 10 }
    );

    expect(result).toMatchObject({ allowed: false, status: 503 });
  });
});
