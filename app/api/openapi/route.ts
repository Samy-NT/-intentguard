import { NextResponse } from "next/server";

const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Aurel Intent Firewall API",
    version: "1.0.0",
    description: "Pre-execution verification, enforcement decisions, signed audit evidence, and redacted action telemetry for autonomous agents.",
  },
  servers: [{ url: "/" }],
  security: [{ ApiKey: [] }],
  components: {
    securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "x-api-key" } },
    schemas: {
      Decision: { type: "string", enum: ["allow", "block", "flag", "require_approval", "rewrite", "quarantine"] },
      ActionDecision: { type: "object", required: ["decision"], properties: { decision: { type: "string", enum: ["allow", "block", "require_approval", "rewrite", "quarantine"] }, reason: { type: "string" }, riskScore: { type: "number", minimum: 0, maximum: 100 }, ruleIds: { type: "array", items: { type: "string" } }, traceId: { type: "string" } } },
      Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
    },
  },
  paths: {
    "/api/v1/verify": {
      post: { summary: "Verify a payment intent before execution", operationId: "verifyPaymentIntent", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["intent_id", "agent_id", "amount", "currency", "recipient", "agent_context"], properties: { intent_id: { type: "string" }, agent_id: { type: "string" }, amount: { type: "number", exclusiveMinimum: 0 }, currency: { type: "string" }, recipient: { type: "string" }, agent_context: { type: "string" }, mission_scope: { type: "string" }, metadata: { type: "object" } } } } } }, responses: { "200": { description: "Enforceable decision with signed audit evidence" }, "401": { description: "Unauthorized", content: { "application/json": { schema: { "$ref": "#/components/schemas/Error" } } } }, "409": { description: "Idempotency payload conflict" } } },
    },
    "/api/v1/actions/evaluate": {
      post: { summary: "Evaluate a generic agent/tool action before execution", operationId: "evaluateAction", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["version", "integration", "action", "agent", "timestamp"], properties: { version: { type: "string", const: "1" }, integration: { type: "string" }, action: { type: "object" }, agent: { type: "object" }, timestamp: { type: "string", format: "date-time" } } } } } }, responses: { "200": { description: "Decision and signed action audit signature" }, "409": { description: "Action id payload conflict" } } },
    },
    "/api/v1/actions/telemetry": {
      post: { summary: "Record redacted post-execution telemetry", operationId: "recordActionTelemetry", responses: { "200": { description: "Telemetry accepted" }, "429": { description: "Workspace rate limit exceeded" } } },
    },
    "/api/v1/workspace/action-audit": { get: { summary: "List signed generic action decisions", operationId: "listActionAudit", responses: { "200": { description: "Workspace-scoped audit records" } } } },
    "/api/v1/workspace/action-telemetry": { get: { summary: "List redacted action telemetry", operationId: "listActionTelemetry", responses: { "200": { description: "Workspace-scoped telemetry events" } } } },
    "/api/v1/workspace/action-telemetry-export": { get: { summary: "Export action telemetry as JSON or CSV", operationId: "exportActionTelemetry", parameters: [{ name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"] } }] , responses: { "200": { description: "Telemetry export" } } } },
  },
} as const;

export function GET() {
  return NextResponse.json(OPENAPI, { headers: { "Cache-Control": "public, max-age=300" } });
}
