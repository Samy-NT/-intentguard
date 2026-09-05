import { describe, expect, it, vi } from "vitest";
import { buildTelemetryRow, persistTelemetry } from "@/lib/action-telemetry";
import type { AurelActionTelemetry } from "@/lib/actions/protocol";

const event: AurelActionTelemetry = {
  version: "1",
  integration: "mcp",
  actionId: "act_1",
  traceId: "trace_1",
  agent: { id: "agent_1" },
  outcome: { status: "success", durationMs: 12 },
  metadata: { authorization: "Bearer secret", riskScore: 42 },
  timestamp: "2026-09-03T00:00:00.000Z",
};

describe("action telemetry persistence", () => {
  it("redacts sensitive metadata and produces a stable event hash", () => {
    const row = buildTelemetryRow("ws_1", event);
    expect(row.metadata).toMatchObject({ authorization: "[REDACTED]", riskScore: 42 });
    expect(row.event_hash).toHaveLength(64);
    expect(buildTelemetryRow("ws_1", event).event_hash).toBe(row.event_hash);
  });

  it("upserts using the workspace/event hash conflict key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const db = { from: vi.fn(() => ({ upsert })) } as never;
    const result = await persistTelemetry(db, "ws_1", event);
    expect(result.error).toBeNull();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: "ws_1", event_hash: expect.any(String) }), {
      onConflict: "workspace_id,event_hash",
      ignoreDuplicates: true,
    });
  });
});
