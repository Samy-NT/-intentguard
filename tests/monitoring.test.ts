import { beforeEach, describe, expect, it, vi } from "vitest";

const addBreadcrumb = vi.fn();
const setMeasurement = vi.fn();
const captureException = vi.fn();
const withScope = vi.fn((callback: (scope: { setExtras: (extras: unknown) => void }) => void) => {
  callback({ setExtras: vi.fn() });
});

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb,
  setMeasurement,
  captureException,
  withScope,
}));

describe("monitoring layers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records action evaluation under its own layer", async () => {
    const { recordLayerMetric } = await import("@/lib/monitoring");
    recordLayerMetric({
      layer: "action_evaluation",
      decision: "require_approval",
      risk_score: 75,
      duration_ms: 12,
      workspace_id: "workspace_1",
      agent_id: "agent_1",
    });

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "intentguard.layer.action_evaluation",
        level: "warning",
        data: expect.objectContaining({
          layer: "action_evaluation",
          decision: "require_approval",
          risk_score: 75,
        }),
      })
    );
  });

  it("records action telemetry under its own layer", async () => {
    const { recordLayerMetric } = await import("@/lib/monitoring");
    recordLayerMetric({
      layer: "action_telemetry",
      decision: "blocked",
      risk_score: 90,
      duration_ms: 3,
    });

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "intentguard.layer.action_telemetry",
        data: expect.objectContaining({ layer: "action_telemetry", decision: "blocked" }),
      })
    );
  });
});
