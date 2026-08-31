export type AurelDecision = "allow" | "block" | "require_approval" | "rewrite" | "quarantine";
export type FailMode = "open" | "closed";
export interface OpenClawAurelConfig {
    enabled: boolean;
    apiUrl: string;
    apiKey: string;
    failMode: FailMode;
    failOpenPrivilegedActions: "block" | "allow";
    timeoutMs: number;
    logLevel: "silent" | "error" | "warn" | "info" | "debug";
    telemetry: {
        enabled: boolean;
        includeResults: boolean;
        maxPayloadBytes: number;
    };
    approval: {
        enabled: boolean;
        nativeDirective: boolean;
        timeoutMs: number;
    };
    rewrite: {
        enabled: boolean;
        unsupportedFallback: "approval" | "block";
        unsupportedTools: string[];
    };
    tools: {
        include: string[];
        exclude: string[];
    };
    redaction: {
        enabled: boolean;
    };
}
export interface AurelActionRequest {
    version: "1";
    integration: "openclaw";
    action: {
        id: string;
        name: string;
        type?: string;
        arguments: unknown;
    };
    agent: {
        id?: string;
        sessionId?: string;
        runId?: string;
    };
    requester?: {
        channel?: string;
        accountId?: string;
        senderId?: string;
        isOwner?: boolean;
        roleIds?: string[];
    };
    context?: {
        workingDirectory?: string;
        targetPaths?: string[];
        parentActionId?: string;
        metadata?: Record<string, unknown>;
    };
    timestamp: string;
}
export interface AurelSecurityDecision {
    decision: AurelDecision;
    reason?: string;
    riskScore?: number;
    ruleIds?: string[];
    category?: string;
    rewrittenArguments?: unknown;
    traceId?: string;
    policyVersion?: string;
}
export interface AurelActionTelemetry {
    version: "1";
    integration: "openclaw";
    actionId: string;
    traceId?: string;
    agent?: AurelActionRequest["agent"];
    outcome: {
        status: "success" | "failure" | "blocked" | "approval_requested" | "approval_allowed" | "approval_denied";
        durationMs?: number;
        errorCategory?: string;
    };
    timings?: {
        aurelPreflightLatencyMs?: number;
        toolExecutionLatencyMs?: number;
        aurelPostflightLatencyMs?: number;
    };
    metadata?: Record<string, unknown>;
    timestamp: string;
}
export interface OpenClawBeforeToolEvent {
    toolName: string;
    params?: unknown;
    toolKind?: string;
    toolInputKind?: string;
    derivedPaths?: string[];
    runId?: string | number;
    toolCallId?: string;
    supportsParamRewrite?: boolean;
}
export interface OpenClawAfterToolEvent extends OpenClawBeforeToolEvent {
    result?: unknown;
    error?: unknown;
    durationMs?: number;
    success?: boolean;
}
export interface OpenClawHookContext {
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    runId?: string | number;
    toolKind?: string;
    toolInputKind?: string;
    abortSignal?: AbortSignal;
    requester?: {
        channel?: string;
        accountId?: string;
        senderId?: string;
        senderIsOwner?: boolean;
        roleIds?: string[];
    };
    trace?: unknown;
    cwd?: string;
}
export interface BeforeToolResult {
    params?: Record<string, unknown>;
    block?: boolean;
    blockReason?: string;
    requireApproval?: {
        title: string;
        description: string;
        severity?: "info" | "warning" | "critical";
        timeoutMs?: number;
        allowedDecisions?: Array<"allow-once" | "allow-always" | "deny">;
        onResolution?: (decision: "allow-once" | "allow-always" | "deny" | "timeout" | "cancelled") => Promise<void> | void;
    };
}
export interface AurelHttpClient {
    evaluateAction(action: AurelActionRequest, signal?: AbortSignal): Promise<AurelSecurityDecision>;
    recordTelemetry(telemetry: AurelActionTelemetry, signal?: AbortSignal): Promise<void>;
}
export declare function loadConfig(raw?: unknown): OpenClawAurelConfig;
export declare function createAurelHttpClient(config: OpenClawAurelConfig, fetchImpl?: typeof fetch): AurelHttpClient;
export declare function createOpenClawAurelHandlers(config: OpenClawAurelConfig, client: AurelHttpClient): {
    beforeToolCall(event: OpenClawBeforeToolEvent, ctx?: OpenClawHookContext): Promise<BeforeToolResult | undefined>;
    afterToolCall(event: OpenClawAfterToolEvent, ctx?: OpenClawHookContext): Promise<void>;
    status(): {
        enabled: boolean;
        failMode: FailMode;
        telemetry: boolean;
        lastDecision: AurelSecurityDecision | undefined;
        pendingActions: number;
    };
};
export declare function normalizeOpenClawAction(event: OpenClawBeforeToolEvent, ctx?: OpenClawHookContext): AurelActionRequest;
