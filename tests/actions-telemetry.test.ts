import { describe, expect, it } from "vitest";
import { telemetryRiskScore } from "@/app/api/v1/actions/telemetry/route";
import { redactForTelemetry } from "@/lib/actions/redaction";
import { AurelActionTelemetrySchema, type AurelActionTelemetry } from "@/lib/actions/protocol";

function telemetry(overrides: Partial<AurelActionTelemetry> = {}): AurelActionTelemetry {
  return {
    version: "1",
    integration: "test",
    actionId: "act_1",
    outcome: { status: "success" },
    timestamp: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("action telemetry ingestion helpers", () => {
  it("uses bounded adapter risk metadata for blocked telemetry metrics", () => {
    expect(telemetryRiskScore(telemetry({ outcome: { status: "blocked" }, metadata: { riskScore: 99.6 } }))).toBe(100);
  });

  it("clamps untrusted risk metadata", () => {
    expect(telemetryRiskScore(telemetry({ outcome: { status: "blocked" }, metadata: { riskScore: 500 } }))).toBe(100);
    expect(telemetryRiskScore(telemetry({ outcome: { status: "blocked" }, metadata: { riskScore: -10 } }))).toBe(0);
  });

  it("assigns useful defaults when telemetry has no risk metadata", () => {
    expect(telemetryRiskScore(telemetry({ outcome: { status: "blocked" } }))).toBe(75);
    expect(telemetryRiskScore(telemetry({ outcome: { status: "approval_denied" } }))).toBe(75);
    expect(telemetryRiskScore(telemetry({ outcome: { status: "approval_requested" } }))).toBe(60);
    expect(telemetryRiskScore(telemetry({ outcome: { status: "failure" } }))).toBe(50);
    expect(telemetryRiskScore(telemetry({ outcome: { status: "success" } }))).toBe(0);
  });

  it("accepts normalized approval resolution telemetry from integrations", () => {
    expect(AurelActionTelemetrySchema.safeParse(telemetry({ integration: "crewai", outcome: { status: "approval_allowed" } })).success).toBe(true);
    expect(AurelActionTelemetrySchema.safeParse(telemetry({ integration: "crewai", outcome: { status: "approval_denied" } })).success).toBe(true);
  });

  it("preserves repeated non-circular references during telemetry redaction", () => {
    const shared = { path: "README.md" };
    expect(redactForTelemetry({ first: shared, second: shared })).toEqual({
      first: { path: "README.md" },
      second: { path: "README.md" },
    });
  });

  it("redacts throwing telemetry accessors as inert values", () => {
    const input: Record<string, unknown> = { command: "pwd" };
    Object.defineProperty(input, "details", {
      enumerable: true,
      get() {
        throw new Error("getter should not escape");
      },
    });

    expect(redactForTelemetry(input)).toEqual({
      command: "pwd",
      details: "[UnserializableProperty]",
    });
  });

  it("redacts throwing telemetry enumeration as an inert object", () => {
    const input = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("ownKeys should not escape");
        },
      }
    );

    expect(redactForTelemetry(input)).toBe("[UnserializableObject]");
  });
});
