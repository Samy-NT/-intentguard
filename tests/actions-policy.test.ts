import { describe, expect, it } from "vitest";
import { evaluateAurelAction } from "@/lib/actions/evaluate";
import type { AurelActionRequest } from "@/lib/actions/protocol";

function action(overrides: Partial<AurelActionRequest> = {}): AurelActionRequest {
  return {
    version: "1",
    integration: "test",
    action: { id: "act_1", name: "read_file", arguments: { path: "README.md" } },
    agent: { id: "agent_1", sessionId: "session_1", runId: "run_1" },
    timestamp: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("evaluateAurelAction", () => {
  it("allows low-risk actions by default", () => {
    const result = evaluateAurelAction(action(), null, "trace");
    expect(result.decision).toMatchObject({ decision: "allow", riskScore: 5, traceId: "trace" });
  });

  it("requires approval for high-risk actions by default", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_2", name: "exec", arguments: { command: "npm install package" } } }),
      null,
      "trace"
    );
    expect(result.decision.decision).toBe("require_approval");
    expect(result.decision.ruleIds).toContain("action.high_risk_default");
  });

  it("requires approval for privileged communication actions by default", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_email", name: "send_email", arguments: { to: "finance@example.com", body: "wire details" } } }),
      null,
      "trace"
    );
    expect(result.decision).toMatchObject({
      decision: "require_approval",
      category: "high",
      ruleIds: ["action.high_risk_default"],
    });
  });

  it("requires approval for database mutation actions by default", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_db", name: "database.update", arguments: { table: "users", role: "admin" } } }),
      null,
      "trace"
    );
    expect(result.decision).toMatchObject({
      decision: "require_approval",
      category: "high",
      ruleIds: ["action.high_risk_default"],
    });
  });

  it("requires approval for process execution actions by default", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_exec", name: "exec", arguments: { command: "pwd" } } }),
      null,
      "trace"
    );
    expect(result.decision).toMatchObject({
      decision: "require_approval",
      category: "high",
      ruleIds: ["action.high_risk_default"],
    });
  });

  it("requires approval for browser and network actions by default", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_browser", name: "browser.open", arguments: { url: "https://example.com" } } }),
      null,
      "trace"
    );
    expect(result.decision).toMatchObject({
      decision: "require_approval",
      category: "high",
      ruleIds: ["action.high_risk_default"],
    });
  });

  it("blocks configured tools", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_3", name: "send_email", arguments: { to: "x@example.com" } } }),
      { action_security: { blocked_tools: ["send_email"] } },
      "trace"
    );
    expect(result.decision).toMatchObject({ decision: "block", ruleIds: ["action.blocked_tool"] });
  });

  it("supports strict tool allowlists", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_4", name: "browser.open", arguments: { url: "https://example.com" } } }),
      { action_security: { strict_tools: true, allowed_tools: ["read_file"] } },
      "trace"
    );
    expect(result.decision.decision).toBe("block");
  });

  it("requires approval for configured argument patterns", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_5", name: "terminal", arguments: { command: "git push origin main" } } }),
      { action_security: { approval_argument_patterns: ["git push"] } },
      "trace"
    );
    expect(result.decision).toMatchObject({ decision: "require_approval", ruleIds: ["action.approval_arguments"] });
  });

  it("supports bounded regex argument patterns", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_6", name: "terminal", arguments: { command: "curl https://malicious-domain.example" } } }),
      { action_security: { blocked_argument_patterns: ["/curl\\s+https:\\/\\/malicious-domain/i"] } },
      "trace"
    );
    expect(result.decision).toMatchObject({ decision: "block", ruleIds: ["action.blocked_arguments"] });
  });

  it("does not execute risky policy regexes in the preflight path", () => {
    const result = evaluateAurelAction(
      action({ action: { id: "act_7", name: "read_file", arguments: { value: `${"a".repeat(2000)}!` } } }),
      { action_security: { blocked_argument_patterns: ["/(a+)+$/"] } },
      "trace"
    );
    expect(result.decision.decision).toBe("allow");
  });

  it("blocks configured target paths", () => {
    const result = evaluateAurelAction(
      action({ context: { targetPaths: ["C:/repo/.env"] } }),
      { action_security: { blocked_paths: [".env"] } },
      "trace"
    );
    expect(result.decision).toMatchObject({ decision: "block", category: "path" });
  });
});
