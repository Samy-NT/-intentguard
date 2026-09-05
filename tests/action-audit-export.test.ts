import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, authenticateRequest: mocks.authenticateRequest };
});

function dbWithRows(rows: Record<string, unknown>[]) {
  return {
    from: vi.fn(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => Promise.resolve({ data: rows, error: null }),
      };
      return builder;
    }),
  };
}

describe("generic action audit export", () => {
  beforeEach(() => mocks.authenticateRequest.mockReset());

  it("exports JSON rows scoped to the authenticated workspace", async () => {
    mocks.authenticateRequest.mockResolvedValue({ workspace_id: "ws_1", db: dbWithRows([{ action_id: "act_1", decision: "allow" }]) });
    const { GET } = await import("@/app/api/v1/workspace/action-audit-export/route");
    const response = await GET(new Request("https://aurel.test/api/v1/workspace/action-audit-export") as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ logs: [{ action_id: "act_1", decision: "allow" }] });
  });

  it("exports CSV with a download-safe content type", async () => {
    mocks.authenticateRequest.mockResolvedValue({ workspace_id: "ws_1", db: dbWithRows([{ action_id: "act_1", decision: "allow" }]) });
    const { GET } = await import("@/app/api/v1/workspace/action-audit-export/route");
    const response = await GET(new Request("https://aurel.test/api/v1/workspace/action-audit-export?format=csv") as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toContain("created_at,action_id");
  });

  it("rejects unsupported formats", async () => {
    mocks.authenticateRequest.mockResolvedValue({ workspace_id: "ws_1", db: dbWithRows([]) });
    const { GET } = await import("@/app/api/v1/workspace/action-audit-export/route");
    const response = await GET(new Request("https://aurel.test/api/v1/workspace/action-audit-export?format=xml") as never);
    expect(response.status).toBe(422);
  });
});
