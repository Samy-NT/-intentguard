const BLOCKED_MESSAGE = "Aurel blocked this action because it violates the active security policy.";
const UNAVAILABLE_MESSAGE = "Aurel security verification is unavailable.";
const MAX_AUREL_RESPONSE_BYTES = 1024 * 1024;
const MAX_AUREL_REQUEST_BYTES = 1024 * 1024;
const MAX_AUREL_STRING_CHARS = 65536;
const MAX_AUREL_ARRAY_ITEMS = 512;
const MAX_AUREL_OBJECT_KEYS = 512;
const SENSITIVE_KEY_PATTERN = /(?:password|passwd|secret|token|api[_-]?key|apikey|authorization|cookie|session|private[_-]?key|credential|access[_-]?token|refresh[_-]?token)/i;
export function loadConfig(raw = {}) {
    var _a, _b, _c, _d;
    const cfg = raw && typeof raw === "object" ? raw : {};
    return {
        enabled: readBoolean(cfg.enabled, readEnvBoolean("AUREL_ENABLED", true)),
        apiUrl: readString(cfg.apiUrl, (_b = (_a = process.env.AUREL_API_URL) !== null && _a !== void 0 ? _a : process.env.INTENTGUARD_API_URL) !== null && _b !== void 0 ? _b : "https://api.intentguard.io"),
        apiKey: readString(cfg.apiKey, (_d = (_c = process.env.AUREL_API_KEY) !== null && _c !== void 0 ? _c : process.env.INTENTGUARD_API_KEY) !== null && _d !== void 0 ? _d : ""),
        failMode: readEnum(cfg.failMode, ["open", "closed"], process.env.AUREL_FAIL_MODE === "open" ? "open" : "closed"),
        failOpenPrivilegedActions: readEnum(cfg.failOpenPrivilegedActions, ["block", "allow"], process.env.AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS === "allow" ? "allow" : "block"),
        timeoutMs: readNumber(cfg.timeoutMs, readEnvNumber("AUREL_TIMEOUT_MS", 1500), 100, 30000),
        logLevel: readLogLevel(cfg.logLevel),
        telemetry: {
            enabled: readBoolean(readObject(cfg.telemetry).enabled, readEnvBoolean("AUREL_TELEMETRY_ENABLED", true)),
            includeResults: readBoolean(readObject(cfg.telemetry).includeResults, readEnvBoolean("AUREL_TELEMETRY_INCLUDE_RESULTS", false)),
            maxPayloadBytes: readNumber(readObject(cfg.telemetry).maxPayloadBytes, readEnvNumber("AUREL_TELEMETRY_MAX_PAYLOAD_BYTES", 32768), 1024, 262144),
        },
        approval: {
            enabled: readBoolean(readObject(cfg.approval).enabled, true),
            nativeDirective: readBoolean(readObject(cfg.approval).nativeDirective, readEnvBoolean("AUREL_OPENCLAW_NATIVE_APPROVAL", false)),
            timeoutMs: readNumber(readObject(cfg.approval).timeoutMs, 60000, 1000, 3600000),
        },
        rewrite: {
            enabled: readBoolean(readObject(cfg.rewrite).enabled, true),
            unsupportedFallback: readEnum(readObject(cfg.rewrite).unsupportedFallback, ["approval", "block"], process.env.AUREL_REWRITE_UNSUPPORTED_FALLBACK === "block" ? "block" : "approval"),
            unsupportedTools: readStringArray(readObject(cfg.rewrite).unsupportedTools),
        },
        tools: {
            include: readStringArray(readObject(cfg.tools).include, readEnvList("AUREL_TOOLS_INCLUDE")),
            exclude: readStringArray(readObject(cfg.tools).exclude, readEnvList("AUREL_TOOLS_EXCLUDE")),
        },
        redaction: {
            enabled: readBoolean(readObject(cfg.redaction).enabled, readEnvBoolean("AUREL_REDACTION_ENABLED", true)),
        },
    };
}
export function createAurelHttpClient(config, fetchImpl = fetch) {
    const baseUrl = validateBaseUrl(config.apiUrl);
    return {
        async evaluateAction(action, signal) {
            const body = await requestJson(fetchImpl, baseUrl, "/api/v1/actions/evaluate", config, action, signal);
            return parseDecision(body);
        },
        async recordTelemetry(telemetry, signal) {
            await retryTelemetry(async () => {
                await requestJson(fetchImpl, baseUrl, "/api/v1/actions/telemetry", config, telemetry, signal);
            });
        },
    };
}
export function createOpenClawAurelHandlers(config, client) {
    const stateByToolCall = new Map();
    let lastDecision;
    return {
        async beforeToolCall(event, ctx = {}) {
            if (!shouldIntercept(event.toolName, config))
                return undefined;
            const started = now();
            const action = normalizeOpenClawAction(event, ctx);
            try {
                const decision = await client.evaluateAction(action, ctx.abortSignal);
                lastDecision = decision;
                const state = {
                    actionId: action.action.id,
                    traceId: decision.traceId,
                    agent: action.agent,
                    preflightLatencyMs: elapsed(started),
                };
                const key = toolCallKey(event, ctx, action.action.id);
                stateByToolCall.set(key, state);
                scheduleStateCleanup(stateByToolCall, key, state);
                return mapDecision(event, decision, config, client, state);
            }
            catch (error) {
                log(config, config.failMode === "closed" ? "error" : "warn", "Aurel preflight failed", error);
                if (config.failMode === "closed" || shouldBlockFailOpenOutage(action, config)) {
                    return { block: true, blockReason: UNAVAILABLE_MESSAGE };
                }
                return undefined;
            }
        },
        async afterToolCall(event, ctx = {}) {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (!config.telemetry.enabled || !shouldIntercept(event.toolName, config))
                return;
            const key = toolCallKey(event, ctx, undefined);
            const state = stateByToolCall.get(key);
            if (state === null || state === void 0 ? void 0 : state.reported)
                return;
            if (state)
                state.reported = true;
            const actionId = (_b = (_a = state === null || state === void 0 ? void 0 : state.actionId) !== null && _a !== void 0 ? _a : event.toolCallId) !== null && _b !== void 0 ? _b : randomId("oc-act");
            const postStarted = now();
            const success = (_c = event.success) !== null && _c !== void 0 ? _c : event.error === undefined;
            const metadata = {
                tool: event.toolName,
                toolKind: (_d = event.toolKind) !== null && _d !== void 0 ? _d : ctx.toolKind,
                toolInputKind: (_e = event.toolInputKind) !== null && _e !== void 0 ? _e : ctx.toolInputKind,
                params: redact(event.params, config),
            };
            if (config.telemetry.includeResults) {
                metadata.result = redact(event.result, config);
            }
            const telemetry = {
                version: "1",
                integration: "openclaw",
                actionId,
                traceId: state === null || state === void 0 ? void 0 : state.traceId,
                agent: (_f = state === null || state === void 0 ? void 0 : state.agent) !== null && _f !== void 0 ? _f : {
                    id: ctx.agentId,
                    sessionId: (_g = ctx.sessionId) !== null && _g !== void 0 ? _g : ctx.sessionKey,
                    runId: stringifyId((_h = ctx.runId) !== null && _h !== void 0 ? _h : event.runId),
                },
                outcome: {
                    status: success ? "success" : "failure",
                    durationMs: readOptionalNumber(event.durationMs),
                    errorCategory: success ? undefined : classifyError(event.error),
                },
                timings: {
                    aurelPreflightLatencyMs: state === null || state === void 0 ? void 0 : state.preflightLatencyMs,
                    toolExecutionLatencyMs: readOptionalNumber(event.durationMs),
                    aurelPostflightLatencyMs: elapsed(postStarted),
                },
                metadata,
                timestamp: new Date().toISOString(),
            };
            void client.recordTelemetry(telemetry, ctx.abortSignal).catch((error) => {
                log(config, "warn", "Aurel postflight telemetry failed", error);
            });
        },
        status() {
            return {
                enabled: config.enabled,
                failMode: config.failMode,
                telemetry: config.telemetry.enabled,
                lastDecision,
                pendingActions: stateByToolCall.size,
            };
        },
    };
}
export function normalizeOpenClawAction(event, ctx = {}) {
    var _a, _b, _c, _d, _e, _f, _g;
    const actionId = (_b = (_a = event.toolCallId) !== null && _a !== void 0 ? _a : traceString(ctx.trace, "toolCallId")) !== null && _b !== void 0 ? _b : randomId("oc-act");
    return {
        version: "1",
        integration: "openclaw",
        action: {
            id: actionId,
            name: safeName(event.toolName),
            type: (_c = event.toolKind) !== null && _c !== void 0 ? _c : ctx.toolKind,
            arguments: (_d = event.params) !== null && _d !== void 0 ? _d : {},
        },
        agent: {
            id: ctx.agentId,
            sessionId: (_e = ctx.sessionId) !== null && _e !== void 0 ? _e : ctx.sessionKey,
            runId: stringifyId((_f = ctx.runId) !== null && _f !== void 0 ? _f : event.runId),
        },
        requester: ctx.requester
            ? {
                channel: ctx.requester.channel,
                accountId: ctx.requester.accountId,
                senderId: ctx.requester.senderId,
                isOwner: ctx.requester.senderIsOwner,
                roleIds: Array.isArray(ctx.requester.roleIds) ? ctx.requester.roleIds : undefined,
            }
            : undefined,
        context: {
            workingDirectory: ctx.cwd,
            targetPaths: Array.isArray(event.derivedPaths) ? event.derivedPaths : undefined,
            parentActionId: traceString(ctx.trace, "parentActionId"),
            metadata: {
                toolInputKind: (_g = event.toolInputKind) !== null && _g !== void 0 ? _g : ctx.toolInputKind,
            },
        },
        timestamp: new Date().toISOString(),
    };
}
function mapDecision(event, decision, config, client, state) {
    switch (decision.decision) {
        case "allow":
            return undefined;
        case "block":
        case "quarantine":
            recordPreExecutionOutcome(client, config, state, event, "blocked", decision);
            return { block: true, blockReason: BLOCKED_MESSAGE };
        case "require_approval":
            if (!config.approval.enabled || !config.approval.nativeDirective) {
                recordPreExecutionOutcome(client, config, state, event, "blocked", decision);
                return { block: true, blockReason: BLOCKED_MESSAGE };
            }
            return approvalResult(event, decision, config, client, state);
        case "rewrite":
            if (canRewrite(event, decision, config)) {
                return { params: decision.rewrittenArguments };
            }
            if (config.rewrite.unsupportedFallback === "block" || !config.approval.enabled || !config.approval.nativeDirective) {
                recordPreExecutionOutcome(client, config, state, event, "blocked", decision);
                return { block: true, blockReason: BLOCKED_MESSAGE };
            }
            return approvalResult(event, Object.assign(Object.assign({}, decision), { reason: "Aurel requested a parameter rewrite that this OpenClaw tool runtime cannot apply safely." }), config, client, state);
        default:
            recordPreExecutionOutcome(client, config, state, event, "blocked", decision);
            return { block: true, blockReason: BLOCKED_MESSAGE };
    }
}
function recordPreExecutionOutcome(client, config, state, event, status, decision) {
    if (!config.telemetry.enabled || state.reported)
        return;
    const postStarted = now();
    state.reported = true;
    void client.recordTelemetry({
        version: "1",
        integration: "openclaw",
        actionId: state.actionId,
        traceId: state.traceId,
        agent: state.agent,
        outcome: { status },
        timings: {
            aurelPreflightLatencyMs: state.preflightLatencyMs,
            aurelPostflightLatencyMs: elapsed(postStarted),
        },
        metadata: {
            tool: event.toolName,
            toolKind: event.toolKind,
            toolInputKind: event.toolInputKind,
            params: redact(event.params, config),
            decision: decision.decision,
            riskScore: decision.riskScore,
            category: decision.category,
            ruleIds: decision.ruleIds,
        },
        timestamp: new Date().toISOString(),
    }).catch((error) => {
        log(config, "warn", "Aurel terminal pre-execution telemetry failed", error);
    });
}
function approvalResult(event, decision, config, client, state) {
    recordApprovalRequested(client, config, state, event, decision);
    return {
        requireApproval: {
            title: "Aurel approval required",
            description: "Aurel requires human approval before this action can run.",
            severity: severityFor(decision.riskScore),
            timeoutMs: config.approval.timeoutMs,
            allowedDecisions: ["allow-once", "deny"],
            onResolution: async (resolution) => {
                if (!config.telemetry.enabled)
                    return;
                await client.recordTelemetry({
                    version: "1",
                    integration: "openclaw",
                    actionId: state.actionId,
                    traceId: state.traceId,
                    agent: state.agent,
                    outcome: {
                        status: resolution === "allow-once" || resolution === "allow-always" ? "approval_allowed" : "approval_denied",
                    },
                    metadata: {
                        approvalResolution: resolution,
                    },
                    timestamp: new Date().toISOString(),
                });
            },
        },
    };
}
function recordApprovalRequested(client, config, state, event, decision) {
    if (!config.telemetry.enabled)
        return;
    const postStarted = now();
    void client.recordTelemetry({
        version: "1",
        integration: "openclaw",
        actionId: state.actionId,
        traceId: state.traceId,
        agent: state.agent,
        outcome: { status: "approval_requested" },
        timings: {
            aurelPreflightLatencyMs: state.preflightLatencyMs,
            aurelPostflightLatencyMs: elapsed(postStarted),
        },
        metadata: {
            tool: event.toolName,
            toolKind: event.toolKind,
            toolInputKind: event.toolInputKind,
            params: redact(event.params, config),
            decision: decision.decision,
            riskScore: decision.riskScore,
            category: decision.category,
            ruleIds: decision.ruleIds,
        },
        timestamp: new Date().toISOString(),
    }).catch((error) => {
        log(config, "warn", "Aurel approval-request telemetry failed", error);
    });
}
function canRewrite(event, decision, config) {
    return (config.rewrite.enabled &&
        decision.rewrittenArguments !== undefined &&
        isRecord(decision.rewrittenArguments) &&
        event.supportsParamRewrite !== false &&
        !config.rewrite.unsupportedTools.includes(event.toolName));
}
function shouldIntercept(toolName, config) {
    if (!config.enabled)
        return false;
    if (!config.apiKey)
        return config.failMode === "closed";
    if (isAurelInternalTool(toolName))
        return false;
    if (config.tools.exclude.includes(toolName))
        return false;
    return config.tools.include.length === 0 || config.tools.include.includes(toolName);
}
function shouldBlockFailOpenOutage(action, config) {
    return config.failMode === "open" && config.failOpenPrivilegedActions === "block" && isPrivilegedToolName(action.action.name);
}
function isPrivilegedToolName(toolName) {
    return /(?:^|[._:-])(?:bash|shell|terminal|exec|execute|process|spawn|run_command|file_write|write_file|delete_file|remove_file|patch|apply_patch|git_push|network|browser|http|fetch|email|send_email|message|database|db|sql|cloud|package|install|schedule|subagent|delegate|mcp|api|payment|finance|permission|auth|credential)(?:$|[._:-])/i.test(toolName);
}
function isAurelInternalTool(toolName) {
    return /^aurel(?:_|\.|-)/i.test(toolName);
}
function parseDecision(body) {
    if (!isRecord(body) || typeof body.decision !== "string") {
        throw new Error("Malformed Aurel decision response");
    }
    const normalized = body.decision === "flag" ? Object.assign(Object.assign({}, body), { decision: "require_approval" }) : body;
    if (!["allow", "block", "require_approval", "rewrite", "quarantine"].includes(normalized.decision)) {
        throw new Error(`Unsupported Aurel decision: ${body.decision}`);
    }
    validateDecisionMetadata(normalized);
    return normalized;
}
function validateDecisionMetadata(body) {
    if (body.riskScore !== undefined) {
        const riskScore = body.riskScore;
        if (typeof riskScore !== "number" || !Number.isFinite(riskScore) || riskScore < 0 || riskScore > 100) {
            throw new Error("Aurel returned an invalid risk score");
        }
    }
    for (const field of ["reason", "category", "traceId", "policyVersion"]) {
        const value = body[field];
        if (value !== undefined && (typeof value !== "string" || value.length > 4096)) {
            throw new Error(`Aurel returned an invalid ${field}`);
        }
    }
    if (body.ruleIds !== undefined &&
        (!Array.isArray(body.ruleIds) || body.ruleIds.length > 128 || body.ruleIds.some((ruleId) => typeof ruleId !== "string" || ruleId.length > 512))) {
        throw new Error("Aurel returned invalid rule IDs");
    }
}
async function requestJson(fetchImpl, baseUrl, path, config, payload, upstreamSignal) {
    if (!config.apiKey)
        throw new Error("Aurel API key is not configured");
    const controller = new AbortController();
    const timeoutError = new Error(`Aurel request timed out after ${config.timeoutMs}ms`);
    let timeout;
    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => {
            controller.abort(timeoutError);
            reject(timeoutError);
        }, config.timeoutMs);
    });
    const cleanup = linkSignal(controller, upstreamSignal);
    try {
        const response = await Promise.race([
            fetchImpl(`${baseUrl}${path}`, {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "content-type": "application/json",
                    "x-api-key": config.apiKey,
                    "idempotency-key": idempotencyKeyFor(path, payload),
                    "user-agent": "aurel-openclaw-plugin/0.1.0",
                },
                body: stringifyAurelPayload(payload),
            }),
            timeoutPromise,
        ]);
        const body = await readJsonResponse(response, timeoutPromise);
        if (!response.ok)
            throw new Error(`Aurel HTTP ${response.status}`);
        return body;
    }
    catch (error) {
        if (controller.signal.aborted) {
            throw controller.signal.reason instanceof Error ? controller.signal.reason : timeoutError;
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
        cleanup();
    }
}
function stringifyAurelPayload(value) {
    const serialized = JSON.stringify(toSerializable(value, new WeakSet(), 0));
    if (new TextEncoder().encode(serialized).length <= MAX_AUREL_REQUEST_BYTES)
        return serialized;
    const bounded = boundActionArguments(value);
    const fallback = JSON.stringify(toSerializable(bounded, new WeakSet(), 0));
    if (new TextEncoder().encode(fallback).length <= MAX_AUREL_REQUEST_BYTES)
        return fallback;
    throw new Error("Aurel request payload exceeded maximum size");
}
function toSerializable(value, seen, depth) {
    if (value === null || typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return Number.isFinite(value) ? value : "[NonFiniteNumber]";
    if (typeof value === "string")
        return truncatePayloadString(value);
    if (typeof value === "bigint")
        return value.toString();
    if (typeof value === "undefined")
        return null;
    if (typeof value === "function" || typeof value === "symbol")
        return `[${typeof value}]`;
    if (depth > 12)
        return "[MaxDepth]";
    if (typeof value !== "object")
        return String(value);
    if (seen.has(value))
        return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) {
        try {
            const entries = value.slice(0, MAX_AUREL_ARRAY_ITEMS).map((entry) => toSerializable(entry, seen, depth + 1));
            if (value.length > MAX_AUREL_ARRAY_ITEMS)
                entries.push(`[${value.length - MAX_AUREL_ARRAY_ITEMS} items truncated]`);
            return entries;
        }
        finally {
            seen.delete(value);
        }
    }
    try {
        const output = Object.create(null);
        let keys;
        try {
            keys = Object.keys(value);
        }
        catch (_a) {
            return "[UnserializableObject]";
        }
        for (const key of keys.slice(0, MAX_AUREL_OBJECT_KEYS)) {
            let entry;
            try {
                entry = value[key];
            }
            catch (_b) {
                output[key] = "[UnserializableProperty]";
                continue;
            }
            output[key] = toSerializable(entry, seen, depth + 1);
        }
        if (keys.length > MAX_AUREL_OBJECT_KEYS)
            output.__truncatedKeys = keys.length - MAX_AUREL_OBJECT_KEYS;
        return output;
    }
    finally {
        seen.delete(value);
    }
}
function truncatePayloadString(value) {
    return value.length > MAX_AUREL_STRING_CHARS ? `${value.slice(0, MAX_AUREL_STRING_CHARS)}...[truncated]` : value;
}
function boundActionArguments(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return { truncated: true, reason: "payload_limit" };
    const envelope = value;
    if (!envelope.action || typeof envelope.action !== "object" || Array.isArray(envelope.action)) {
        return { truncated: true, reason: "payload_limit" };
    }
    return Object.assign(Object.assign({}, envelope), { action: Object.assign(Object.assign({}, envelope.action), { arguments: { truncated: true, reason: "payload_limit" } }) });
}
async function readJsonResponse(response, timeoutPromise) {
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_AUREL_RESPONSE_BYTES) {
        throw new Error("Aurel response exceeded maximum size");
    }
    const text = await readLimitedText(response, timeoutPromise);
    if (!text.trim())
        return null;
    try {
        return JSON.parse(text);
    }
    catch (_a) {
        return null;
    }
}
async function readLimitedText(response, timeoutPromise) {
    if (!response.body) {
        const text = await Promise.race([response.text(), timeoutPromise]);
        if (new TextEncoder().encode(text).length > MAX_AUREL_RESPONSE_BYTES) {
            throw new Error("Aurel response exceeded maximum size");
        }
        return text;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await Promise.race([reader.read(), timeoutPromise]);
            if (done)
                break;
            if (!value)
                continue;
            total += value.byteLength;
            if (total > MAX_AUREL_RESPONSE_BYTES) {
                await reader.cancel().catch(() => undefined);
                throw new Error("Aurel response exceeded maximum size");
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}
async function retryTelemetry(fn) {
    const delays = [50, 150, 350];
    let lastError;
    for (let index = 0; index < delays.length; index += 1) {
        try {
            await fn();
            return;
        }
        catch (error) {
            lastError = error;
            if (index + 1 < delays.length) {
                await new Promise((resolve) => setTimeout(resolve, delays[index]));
            }
        }
    }
    throw lastError;
}
function redact(value, config) {
    return redactValue(value, new WeakSet(), 0, config);
}
function redactValue(value, seen, depth, config) {
    if (!config.redaction.enabled)
        return boundPayload(value, config.telemetry.maxPayloadBytes);
    if (value === null || typeof value === "number" || typeof value === "boolean")
        return value;
    if (typeof value === "bigint")
        return value.toString();
    if (typeof value === "string")
        return truncate(value, 4096);
    if (typeof value === "undefined")
        return null;
    if (typeof value === "function" || typeof value === "symbol")
        return `[${typeof value}]`;
    if (depth > 8)
        return "[MaxDepth]";
    if (seen.has(value))
        return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) {
        try {
            return value.slice(0, 50).map((entry) => redactValue(entry, seen, depth + 1, config));
        }
        finally {
            seen.delete(value);
        }
    }
    try {
        const out = Object.create(null);
        let keys;
        try {
            keys = Object.keys(value);
        }
        catch (_a) {
            return "[UnserializableObject]";
        }
        for (const key of keys) {
            const safeKey = truncate(key, 256);
            if (SENSITIVE_KEY_PATTERN.test(key)) {
                out[safeKey] = "[REDACTED]";
                continue;
            }
            let entry;
            try {
                entry = value[key];
            }
            catch (_b) {
                out[safeKey] = "[UnserializableProperty]";
                continue;
            }
            out[safeKey] = redactValue(entry, seen, depth + 1, config);
        }
        return boundPayload(out, config.telemetry.maxPayloadBytes);
    }
    finally {
        seen.delete(value);
    }
}
function boundPayload(value, maxBytes) {
    const json = safeStringify(value);
    if (new TextEncoder().encode(json).length <= maxBytes)
        return value;
    return { truncated: true, reason: "payload_limit", preview: truncate(json, Math.min(4096, maxBytes)) };
}
function safeStringify(value) {
    var _a;
    try {
        return (_a = JSON.stringify(value)) !== null && _a !== void 0 ? _a : "null";
    }
    catch (_b) {
        return '"[Unserializable]"';
    }
}
function truncate(value, maxLength) {
    const sanitized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "\uFFFD");
    return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...[truncated]` : sanitized;
}
function idempotencyKeyFor(path, payload) {
    if (isRecord(payload) && path.endsWith("/evaluate") && isRecord(payload.action) && typeof payload.action.id === "string") {
        return idempotencyKey("action-evaluate", payload.action.id);
    }
    if (isRecord(payload) && path.endsWith("/telemetry") && typeof payload.actionId === "string") {
        const status = isRecord(payload.outcome) && typeof payload.outcome.status === "string" ? payload.outcome.status : "unknown";
        return idempotencyKey("action-telemetry", payload.actionId, status);
    }
    return idempotencyKey("aurel-request", safeStringify(payload).slice(0, 128));
}
function idempotencyKey(prefix, ...parts) {
    return [prefix, ...parts.map((part) => encodeURIComponent(part).slice(0, 256))].join(":");
}
function severityFor(riskScore = 0) {
    if (riskScore >= 85)
        return "critical";
    if (riskScore >= 50)
        return "warning";
    return "info";
}
function validateBaseUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("Aurel API URL must use http or https");
    }
    if (url.username || url.password) {
        throw new Error("Aurel API URL must not include embedded credentials");
    }
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
}
function linkSignal(controller, upstream) {
    if (!upstream)
        return () => undefined;
    if (upstream.aborted) {
        controller.abort(upstream.reason);
        return () => undefined;
    }
    const onAbort = () => controller.abort(upstream.reason);
    upstream.addEventListener("abort", onAbort, { once: true });
    return () => upstream.removeEventListener("abort", onAbort);
}
function toolCallKey(event, ctx, fallback) {
    var _a, _b;
    const explicitId = (_a = event.toolCallId) !== null && _a !== void 0 ? _a : traceString(ctx.trace, "toolCallId");
    if (explicitId)
        return `action:${explicitId}`;
    const runId = stringifyId((_b = ctx.runId) !== null && _b !== void 0 ? _b : event.runId);
    if (runId)
        return `run:${runId}:${event.toolName}`;
    return `action:${fallback !== null && fallback !== void 0 ? fallback : `${event.toolName}:unknown`}`;
}
function scheduleStateCleanup(map, key, state) {
    var _a, _b;
    (_b = (_a = setTimeout(() => {
        if (map.get(key) === state) {
            map.delete(key);
        }
    }, 10 * 60 * 1000)).unref) === null || _b === void 0 ? void 0 : _b.call(_a);
}
function classifyError(error) {
    if (!error)
        return undefined;
    if (error instanceof Error)
        return error.name || "Error";
    if (typeof error === "object" && error !== null && "name" in error && typeof error.name === "string")
        return error.name;
    return "unknown";
}
function traceString(trace, key) {
    if (!isRecord(trace))
        return undefined;
    const value = trace[key];
    return typeof value === "string" ? value : undefined;
}
function stringifyId(value) {
    if (typeof value === "string" && value.length > 0)
        return value;
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    return undefined;
}
function safeName(value) {
    return typeof value === "string" && value.trim() ? value.slice(0, 256) : "unknown";
}
function randomId(prefix) {
    var _a, _b, _c;
    return `${prefix}_${(_c = (_b = (_a = globalThis.crypto) === null || _a === void 0 ? void 0 : _a.randomUUID) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}
function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function elapsed(start) {
    return Math.round(now() - start);
}
function readObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}
function readString(value, fallback) {
    return typeof value === "string" && value.length > 0 ? value : fallback;
}
function readStringArray(value, fallback = []) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.length > 0) : fallback;
}
function readNumber(value, fallback, min, max) {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.max(min, Math.min(max, n));
}
function readEnum(value, allowed, fallback) {
    return typeof value === "string" && allowed.includes(value) ? value : fallback;
}
function readOptionalNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function readEnvNumber(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function readEnvBoolean(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    if (["1", "true", "yes", "on"].includes(value.toLowerCase()))
        return true;
    if (["0", "false", "no", "off"].includes(value.toLowerCase()))
        return false;
    return fallback;
}
function readEnvList(name) {
    const value = process.env[name];
    if (!value)
        return [];
    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function readLogLevel(value) {
    return value === "silent" || value === "error" || value === "warn" || value === "info" || value === "debug"
        ? value
        : readEnum(process.env.AUREL_LOG_LEVEL, ["silent", "error", "warn", "info", "debug"], "warn");
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function log(config, level, message, error) {
    var _a;
    const order = ["silent", "error", "warn", "info", "debug"];
    if (order.indexOf(config.logLevel) < order.indexOf(level))
        return;
    const logger = (_a = console[level]) !== null && _a !== void 0 ? _a : console.warn;
    logger(`[aurel-openclaw] ${message}`, error instanceof Error ? error.message : error !== null && error !== void 0 ? error : "");
}
