import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkspaceOpsStatus } from "@/lib/ops-status";

function table(data: unknown[], error: { message: string } | null = null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data, error })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: data[0] ?? null, error })),
  };
  return chain;
}

function mockDb(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from: vi.fn((name: string) => table(tables[name] ?? [])),
  } as unknown as SupabaseClient;
}

describe("workspace ops status", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("summarizes healthy webhook and review operations", async () => {
    const db = mockDb({
      workspaces: [{ policy: { webhook_url: "https://ops.example.com/aurel", webhook_threshold: 70, siem_url: "https://siem.example.com/audit", nightly_export: true } }],
      webhook_jobs: [
        { status: "delivered", next_attempt_at: null, updated_at: "2026-09-01T11:00:00.000Z", created_at: "2026-09-01T10:00:00.000Z" },
      ],
      webhook_deliveries: [{ status: "delivered", created_at: "2026-09-01T11:01:00.000Z" }],
      verify_logs: [{ decision: "allow", review_status: "not_required", created_at: "2026-09-01T11:02:00.000Z" }],
    });

    const status = await buildWorkspaceOpsStatus(db, "workspace-1", now);

    expect(status.status).toBe("ok");
    expect(status.webhooks).toMatchObject({ configured: true, delivered: 1, failed: 0, due: 0 });
    expect(status.siem).toMatchObject({ configured: true, nightly_export_enabled: true });
    expect(status.verification).toMatchObject({ last_24h: 1, flagged_pending: 0, blocked_last_24h: 0 });
    expect(status.sla).toMatchObject({
      window_hours: 24,
      target_success_rate: 0.99,
      webhook_attempts: 1,
      webhook_failures: 0,
      webhook_success_rate: 1,
      error_budget_burn_percent: 0,
    });
    expect(status.alerts).toMatchObject({
      severity: "none",
      routing_configured: true,
      channels: ["webhook", "siem", "nightly_export"],
      recommended_actions: ["No operator action is required."],
    });
  });

  it("fails on terminal webhook jobs and warns on review queue and missing SIEM URL", async () => {
    const db = mockDb({
      workspaces: [{ policy: { webhook_url: "https://ops.example.com/aurel", nightly_export: true } }],
      webhook_jobs: [
        { status: "failed", next_attempt_at: "2026-09-01T11:00:00.000Z", updated_at: "2026-09-01T11:00:00.000Z", created_at: "2026-09-01T10:00:00.000Z" },
        { status: "pending", next_attempt_at: "2026-09-01T11:30:00.000Z", updated_at: "2026-09-01T11:30:00.000Z", created_at: "2026-09-01T09:00:00.000Z" },
      ],
      webhook_deliveries: [{ status: "failed", created_at: "2026-09-01T11:01:00.000Z" }],
      verify_logs: [
        { decision: "block", review_status: "pending", created_at: "2026-09-01T11:02:00.000Z" },
      ],
    });

    const status = await buildWorkspaceOpsStatus(db, "workspace-1", now);

    expect(status.status).toBe("fail");
    expect(status.webhooks).toMatchObject({ failed: 1, due: 1, oldest_pending_age_seconds: 10_800 });
    expect(status.checks).toContainEqual({
      name: "siem.config",
      status: "warn",
      detail: "Nightly export is enabled without a SIEM URL",
    });
    expect(status.verification).toMatchObject({ flagged_pending: 1, blocked_last_24h: 1 });
    expect(status.sla).toMatchObject({
      webhook_attempts: 1,
      webhook_failures: 1,
      webhook_success_rate: 0,
      error_budget_burn_percent: 10000,
      max_pending_age_seconds: 10_800,
      backlog_due: 1,
    });
    expect(status.alerts.severity).toBe("critical");
    expect(status.alerts.recommended_actions).toContain(
      "Inspect terminal webhook jobs, fix the downstream endpoint or secret, then retry failed jobs."
    );
    expect(status.alerts.recommended_actions).toContain(
      "Treat the workspace as degraded until webhook delivery success returns inside the SLO."
    );
  });

  it("escalates stale webhook backlog before jobs become terminal", async () => {
    const db = mockDb({
      workspaces: [{ policy: { webhook_url: "https://ops.example.com/aurel" } }],
      webhook_jobs: Array.from({ length: 101 }, (_, index) => ({
        status: "pending",
        next_attempt_at: "2026-09-01T11:00:00.000Z",
        updated_at: "2026-09-01T11:00:00.000Z",
        created_at: index === 0 ? "2026-09-01T10:59:00.000Z" : "2026-09-01T11:59:00.000Z",
      })),
      webhook_deliveries: [],
      verify_logs: [],
    });

    const status = await buildWorkspaceOpsStatus(db, "workspace-1", now);

    expect(status.status).toBe("fail");
    expect(status.checks).toContainEqual({
      name: "webhook.backlog",
      status: "fail",
      detail: "101 webhook jobs are due for retry",
    });
    expect(status.checks.find((check) => check.name === "webhook.latency")).toMatchObject({
      status: "fail",
      detail: "Oldest pending webhook job is 3660s old",
    });
    expect(status.alerts).toMatchObject({
      severity: "critical",
      routing_configured: true,
    });
  });
});
