import * as Sentry from "@sentry/nextjs";

export type LayerName = "rules" | "velocity" | "semantic" | "auth" | "webhook" | "action_evaluation" | "action_telemetry";

interface LayerMetric {
  layer: LayerName;
  decision: string;
  risk_score: number;
  duration_ms: number;
  workspace_id?: string;
  agent_id?: string;
}

/**
 * Records a per-layer metric as a Sentry breadcrumb + custom measurement.
 * Never includes agent_context or any user-supplied free text.
 */
export function recordLayerMetric(metric: LayerMetric): void {
  Sentry.addBreadcrumb({
    category: `intentguard.layer.${metric.layer}`,
    level: metric.risk_score >= 70 ? "warning" : "info",
    data: {
      layer: metric.layer,
      decision: metric.decision,
      risk_score: metric.risk_score,
      duration_ms: metric.duration_ms,
      workspace_id: metric.workspace_id ?? "unknown",
      agent_id: metric.agent_id ?? "unknown",
    },
  });
}

/**
 * Captures an exception, stripping agent_context from extra context before sending.
 */
export function captureError(
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  const safe = { ...context };
  delete safe.agent_context;
  delete safe.agentContext;

  Sentry.withScope((scope) => {
    scope.setExtras(safe);
    Sentry.captureException(error);
  });
}

/**
 * Wraps a function and captures any unhandled exception with layer context.
 */
export async function withLayerMonitoring<T>(
  layer: LayerName,
  fn: () => Promise<T>,
  context: { workspace_id?: string; agent_id?: string } = {}
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } catch (e) {
    captureError(e, { layer, ...context });
    throw e;
  } finally {
    const duration_ms = Math.round(performance.now() - start);
    Sentry.setMeasurement(`layer.${layer}.duration_ms`, duration_ms, "millisecond");
  }
}
