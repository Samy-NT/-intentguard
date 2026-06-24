import { describe, it, expect, vi } from "vitest";
import { validateApiKey } from "@/lib/auth";
import type { SupabaseClient } from "@supabase/supabase-js";

function mockDbReturning(data: unknown, error: unknown = null): SupabaseClient {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("validateApiKey", () => {
  it("returns valid=true with workspace_id for an active key", async () => {
    const db = mockDbReturning({ workspace_id: "ws_abc", is_active: true });
    const result = await validateApiKey("raw-api-key-123", db);
    expect(result.valid).toBe(true);
    expect(result.workspace_id).toBe("ws_abc");
  });

  it("returns valid=false when key is not found (data is null)", async () => {
    const db = mockDbReturning(null);
    const result = await validateApiKey("unknown-key", db);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid API key");
  });

  it("returns valid=false when key is revoked (is_active=false)", async () => {
    const db = mockDbReturning({ workspace_id: "ws_abc", is_active: false });
    const result = await validateApiKey("revoked-key", db);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("API key is revoked");
  });

  it("returns valid=false when DB throws error", async () => {
    const db = mockDbReturning(null, { message: "connection timeout" });
    const result = await validateApiKey("any-key", db);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid API key");
  });

  it("does not leak workspace_id on invalid key", async () => {
    const db = mockDbReturning(null);
    const result = await validateApiKey("bad-key", db);
    expect(result.workspace_id).toBeUndefined();
  });

  it("SHA-256 hashes the raw key before lookup (different raw keys produce different hashes)", async () => {
    const calls: string[] = [];
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((field: string, value: string) => {
            if (field === "key_hash") calls.push(value);
            return {
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await validateApiKey("key-A", db);
    await validateApiKey("key-B", db);
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toBe(calls[1]);
    // Both should be 64-char hex strings (SHA-256)
    expect(calls[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[1]).toMatch(/^[0-9a-f]{64}$/);
  });
});
