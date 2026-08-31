#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

const BLOCKED_MESSAGE = "Aurel blocked this action because it violates the active security policy.";
const UNAVAILABLE_MESSAGE = "Aurel security verification is unavailable.";
const INVALID_MCP_MESSAGE = "Invalid MCP message.";
const MAX_MCP_FRAME_BYTES = clampSize(Number(process.env.AUREL_MCP_MAX_FRAME_BYTES ?? 1_048_576), 1024, 16 * 1024 * 1024);
const PENDING_TTL_MS = clampSize(Number(process.env.AUREL_MCP_PENDING_TTL_MS ?? 10 * 60 * 1000), 1000, 60 * 60 * 1000);
const MAX_TELEMETRY_PAYLOAD_BYTES = clampSize(Number(process.env.AUREL_TELEMETRY_MAX_PAYLOAD_BYTES ?? 32_768), 1024, 262_144);
const MAX_AUREL_RESPONSE_BYTES = 1024 * 1024;
const MAX_AUREL_REQUEST_BYTES = 1024 * 1024;
const MAX_AUREL_STRING_CHARS = 65_536;
const MAX_AUREL_ARRAY_ITEMS = 512;
const MAX_AUREL_OBJECT_KEYS = 512;

const splitIndex = process.argv.indexOf("--");
if (splitIndex < 0 || splitIndex === process.argv.length - 1) {
  console.error("Usage: node aurel-mcp-proxy.mjs -- <upstream-command> [args...]");
  process.exit(64);
}

const upstream = spawn(process.argv[splitIndex + 1], process.argv.slice(splitIndex + 2), {
  stdio: ["pipe", "pipe", "inherit"],
  env: process.env,
});

const pending = new Map();
const stdinParser = createMcpParser(async (message) => {
  if (message?.method !== "tools/call") {
    writeMcp(upstream.stdin, message);
    return;
  }

const toolName = String(message.params?.name ?? "unknown");
  if (!shouldInterceptTool(toolName)) {
    writeMcp(upstream.stdin, message);
    return;
  }

  const action = {
    version: "1",
    integration: process.env.AUREL_MCP_INTEGRATION ?? "mcp",
    action: {
      id: String(message.id ?? randomId("mcp-call")),
      name: toolName,
      type: "mcp.tools/call",
      arguments: message.params?.arguments ?? {},
    },
    agent: {
      sessionId: process.env.AUREL_SESSION_ID,
      runId: process.env.AUREL_RUN_ID,
    },
    context: {
      metadata: {
        upstreamCommand: process.argv[splitIndex + 1],
      },
    },
    timestamp: new Date().toISOString(),
  };

  const started = performance.now();
  let decision;
  try {
    decision = parseDecision(await aurelPost("/api/v1/actions/evaluate", action));
  } catch (error) {
    if ((process.env.AUREL_FAIL_MODE ?? "closed") === "open" && !shouldBlockFailOpenOutage(toolName)) {
      console.error(`[aurel-mcp] fail-open: ${error instanceof Error ? error.message : String(error)}`);
      setPending(message.id, { action, preflightLatencyMs: elapsed(started) });
      writeMcp(upstream.stdin, message);
      return;
    }
    writeMcp(process.stdout, jsonRpcError(message.id, -32051, UNAVAILABLE_MESSAGE));
    return;
  }

  const preflightLatencyMs = elapsed(started);
  if (decision.decision === "allow") {
    setPending(message.id, { action, traceId: decision.traceId, preflightLatencyMs });
    writeMcp(upstream.stdin, message);
    return;
  }

  if (decision.decision === "rewrite" && decision.rewrittenArguments !== undefined) {
    setPending(message.id, {
      action,
      traceId: decision.traceId,
      preflightLatencyMs,
      executedArguments: decision.rewrittenArguments,
      originalArguments: action.action.arguments,
      rewriteApplied: true,
    });
    writeMcp(upstream.stdin, {
      ...message,
      params: {
        ...message.params,
        arguments: decision.rewrittenArguments,
      },
    });
    return;
  }

  void sendOutcome(
    action,
    decision.traceId,
    decision.decision === "require_approval" ? "approval_requested" : "blocked",
    preflightLatencyMs,
    undefined,
    { decision }
  );
  const reason =
    decision.decision === "require_approval"
      ? "Aurel requires human approval before this MCP tool can run."
      : BLOCKED_MESSAGE;
  writeMcp(process.stdout, jsonRpcError(message.id, -32050, reason));
}, {
  onError(error) {
    console.error(`[aurel-mcp] invalid host message: ${error instanceof Error ? error.message : String(error)}`);
    writeMcp(process.stdout, jsonRpcError(null, -32700, INVALID_MCP_MESSAGE));
  },
});

const upstreamParser = createMcpParser(async (message) => {
  const state = takePending(message?.id);
  if (state) {
    void sendOutcome(
      state.action,
      state.traceId,
      message?.error ? "failure" : "success",
      state.preflightLatencyMs,
      message?.error ? "mcp_error" : undefined,
      state
    );
  }
  writeMcp(process.stdout, message);
}, {
  onError(error) {
    console.error(`[aurel-mcp] invalid upstream message: ${error instanceof Error ? error.message : String(error)}`);
  },
});

process.stdin.on("data", (chunk) => void stdinParser.push(chunk));
upstream.stdout.on("data", (chunk) => void upstreamParser.push(chunk));
upstream.on("exit", (code) => process.exit(code ?? 0));

async function sendOutcome(action, traceId, status, preflightLatencyMs, errorCategory, state = {}) {
  if (!envBool("AUREL_TELEMETRY_ENABLED", true)) return;
  const postStarted = performance.now();
  try {
    await retryTelemetry(() => aurelPost("/api/v1/actions/telemetry", {
      version: "1",
      integration: action.integration,
      actionId: action.action.id,
      traceId,
      agent: action.agent,
      outcome: { status, errorCategory },
      timings: {
        aurelPreflightLatencyMs: preflightLatencyMs,
        aurelPostflightLatencyMs: elapsed(postStarted),
      },
      metadata: {
        tool: action.action.name,
        args: redact(state.executedArguments ?? action.action.arguments),
        originalArgs: state.rewriteApplied ? redact(state.originalArguments) : undefined,
        rewriteApplied: state.rewriteApplied === true,
        resultIncluded: false,
        decision: state.decision?.decision,
        riskScore: state.decision?.riskScore,
        category: state.decision?.category,
        ruleIds: state.decision?.ruleIds,
      },
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error(`[aurel-mcp] telemetry failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function setPending(id, state) {
  const existing = pending.get(id);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(() => pending.delete(id), PENDING_TTL_MS);
  timer.unref?.();
  pending.set(id, { ...state, timer });
}

function takePending(id) {
  const state = pending.get(id);
  if (!state) return undefined;
  pending.delete(id);
  if (state.timer) clearTimeout(state.timer);
  const cleanState = { ...state };
  delete cleanState.timer;
  return cleanState;
}

async function retryTelemetry(fn) {
  const delays = [50, 150, 350];
  let lastError;
  for (let index = 0; index < delays.length; index += 1) {
    try {
      await fn();
      return;
    } catch (error) {
      lastError = error;
      if (index + 1 < delays.length) await new Promise((resolve) => setTimeout(resolve, delays[index]));
    }
  }
  throw lastError;
}

function createMcpParser(onMessage, options = {}) {
  let buffer = Buffer.alloc(0);
  return {
    async push(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) {
          if (buffer.length > MAX_MCP_FRAME_BYTES) {
            options.onError?.(new Error("MCP frame header exceeded maximum size"));
            buffer = Buffer.alloc(0);
          }
          return;
        }
        try {
          const header = buffer.slice(0, headerEnd).toString("ascii");
          const match = /content-length:\s*(\d+)/i.exec(header);
          if (!match) throw new Error("MCP frame is missing Content-Length");
          const length = Number(match[1]);
          if (!Number.isSafeInteger(length) || length < 0) throw new Error("MCP frame has invalid Content-Length");
          if (length > MAX_MCP_FRAME_BYTES) throw new Error("MCP frame body exceeded maximum size");
          const bodyStart = headerEnd + 4;
          const bodyEnd = bodyStart + length;
          if (buffer.length < bodyEnd) return;
          const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
          buffer = buffer.slice(bodyEnd);
          const parsed = JSON.parse(body);
          if (!parsed || typeof parsed !== "object") throw new Error("MCP frame body must be a JSON object");
          await onMessage(parsed);
        } catch (error) {
          buffer = Buffer.alloc(0);
          options.onError?.(error);
          return;
        }
      }
    },
  };
}

function writeMcp(stream, message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  stream.write(`Content-Length: ${body.length}\r\n\r\n`);
  stream.write(body);
}

async function aurelPost(path, payload) {
  const apiUrl = normalizeApiUrl(process.env.AUREL_API_URL ?? process.env.INTENTGUARD_API_URL ?? "https://api.intentguard.io");
  const apiKey = process.env.AUREL_API_KEY ?? process.env.INTENTGUARD_API_KEY;
  if (!apiKey) throw new Error("Aurel API key is not configured");
  const timeoutMs = clampTimeout(Number(process.env.AUREL_TIMEOUT_MS ?? 1500));
  const controller = new AbortController();
  const timeoutError = new Error(`Aurel request timed out after ${timeoutMs}ms`);
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      fetch(`${apiUrl}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "idempotency-key": idempotencyKeyFor(path, payload),
          "user-agent": "aurel-mcp-proxy/0.1.0",
        },
        body: stringifyAurelPayload(payload),
      }),
      timeoutPromise,
    ]);
    const body = await readJsonResponse(response, timeoutPromise);
    if (!response.ok) throw new Error(`Aurel HTTP ${response.status}`);
    if (!body || typeof body !== "object") throw new Error("Aurel returned invalid JSON");
    return body;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason instanceof Error ? controller.signal.reason : timeoutError;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function readJsonResponse(response, timeoutPromise) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_AUREL_RESPONSE_BYTES) {
    throw new Error("Aurel response exceeded maximum size");
  }

  const text = await readLimitedText(response, timeoutPromise);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
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
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_AUREL_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Aurel response exceeded maximum size");
      }
      chunks.push(value);
    }
  } finally {
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

function stringifyAurelPayload(value) {
  const serialized = JSON.stringify(toSerializable(value, new WeakSet(), 0));
  if (Buffer.byteLength(serialized, "utf8") <= MAX_AUREL_REQUEST_BYTES) return serialized;
  const fallback = JSON.stringify(toSerializable(boundActionArguments(value), new WeakSet(), 0));
  if (Buffer.byteLength(fallback, "utf8") <= MAX_AUREL_REQUEST_BYTES) return fallback;
  throw new Error("Aurel request payload exceeded maximum size");
}

function toSerializable(value, seen, depth) {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return truncatePayloadString(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return null;
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (depth > 12) return "[MaxDepth]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    try {
      const entries = value.slice(0, MAX_AUREL_ARRAY_ITEMS).map((entry) => toSerializable(entry, seen, depth + 1));
      if (value.length > MAX_AUREL_ARRAY_ITEMS) entries.push(`[${value.length - MAX_AUREL_ARRAY_ITEMS} items truncated]`);
      return entries;
    } finally {
      seen.delete(value);
    }
  }
  try {
    const output = Object.create(null);
    let keys;
    try {
      keys = Object.keys(value);
    } catch {
      return "[UnserializableObject]";
    }
    for (const key of keys.slice(0, MAX_AUREL_OBJECT_KEYS)) {
      let entry;
      try {
        entry = value[key];
      } catch {
        output[key] = "[UnserializableProperty]";
        continue;
      }
      output[key] = toSerializable(entry, seen, depth + 1);
    }
    if (keys.length > MAX_AUREL_OBJECT_KEYS) output.__truncatedKeys = keys.length - MAX_AUREL_OBJECT_KEYS;
    return output;
  } finally {
    seen.delete(value);
  }
}

function truncatePayloadString(value) {
  return value.length > MAX_AUREL_STRING_CHARS ? `${value.slice(0, MAX_AUREL_STRING_CHARS)}...[truncated]` : value;
}

function boundActionArguments(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { truncated: true, reason: "payload_limit" };
  if (!value.action || typeof value.action !== "object" || Array.isArray(value.action)) {
    return { truncated: true, reason: "payload_limit" };
  }
  return {
    ...value,
    action: {
      ...value.action,
      arguments: { truncated: true, reason: "payload_limit" },
    },
  };
}

function parseDecision(body) {
  if (!body || typeof body !== "object" || typeof body.decision !== "string") {
    throw new Error("Aurel returned a malformed decision");
  }
  const normalized = body.decision === "flag" ? { ...body, decision: "require_approval" } : body;
  if (!["allow", "block", "require_approval", "rewrite", "quarantine"].includes(normalized.decision)) {
    throw new Error(`Aurel returned unsupported decision: ${body.decision}`);
  }
  validateDecisionMetadata(normalized);
  return normalized;
}

function validateDecisionMetadata(body) {
  if (body.riskScore !== undefined && (typeof body.riskScore !== "number" || !Number.isFinite(body.riskScore) || body.riskScore < 0 || body.riskScore > 100)) {
    throw new Error("Aurel returned an invalid risk score");
  }
  for (const field of ["reason", "category", "traceId", "policyVersion"]) {
    const value = body[field];
    if (value !== undefined && (typeof value !== "string" || value.length > 4096)) {
      throw new Error(`Aurel returned an invalid ${field}`);
    }
  }
  if (
    body.ruleIds !== undefined &&
    (!Array.isArray(body.ruleIds) || body.ruleIds.length > 128 || body.ruleIds.some((ruleId) => typeof ruleId !== "string" || ruleId.length > 512))
  ) {
    throw new Error("Aurel returned invalid rule IDs");
  }
}

function elapsed(start) {
  return Math.round(performance.now() - start);
}

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function idempotencyKeyFor(path, payload) {
  if (path.endsWith("/evaluate") && payload && typeof payload === "object" && payload.action && typeof payload.action.id === "string") {
    return idempotencyKey("action-evaluate", payload.action.id);
  }
  if (path.endsWith("/telemetry") && payload && typeof payload === "object" && typeof payload.actionId === "string") {
    const status = payload.outcome && typeof payload.outcome.status === "string" ? payload.outcome.status : "unknown";
    return idempotencyKey("action-telemetry", payload.actionId, status);
  }
  return idempotencyKey("aurel-request", path);
}

function idempotencyKey(prefix, ...parts) {
  return [prefix, ...parts.map((part) => encodeURIComponent(String(part)).slice(0, 256))].join(":");
}

function isAurelInternal(toolName) {
  return /^aurel(?:_|\.|-)/i.test(toolName);
}

function shouldInterceptTool(toolName) {
  if (!envBool("AUREL_ENABLED", true)) return false;
  if (isAurelInternal(toolName)) return false;
  const exclude = envList("AUREL_TOOLS_EXCLUDE");
  if (exclude.includes(toolName)) return false;
  const include = envList("AUREL_TOOLS_INCLUDE");
  return include.length === 0 || include.includes(toolName);
}

function shouldBlockFailOpenOutage(toolName) {
  return process.env.AUREL_FAIL_OPEN_PRIVILEGED_ACTIONS !== "allow" && isPrivilegedToolName(toolName);
}

function isPrivilegedToolName(toolName) {
  return /(?:^|[._:-])(?:bash|shell|terminal|exec|execute|process|spawn|run_command|file_write|write_file|delete_file|remove_file|patch|apply_patch|git_push|network|browser|http|fetch|email|send_email|message|database|db|sql|cloud|package|install|schedule|subagent|delegate|mcp|api|payment|finance|permission|auth|credential)(?:$|[._:-])/i.test(
    toolName
  );
}

function envList(name) {
  return String(process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envBool(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return fallback;
}

function redact(value, seen = new WeakSet(), depth = 0) {
  const shouldRedact = envBool("AUREL_REDACTION_ENABLED", true);
  return bound(redactValue(value, shouldRedact, seen, depth));
}

function redactValue(value, shouldRedact, seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return clean(value, 4096);
  if (typeof value === "undefined") return null;
  if (depth > 8) return "[MaxDepth]";
  if (typeof value !== "object") return `[${typeof value}]`;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    try {
      return value.slice(0, 50).map((item) => redactValue(item, shouldRedact, seen, depth + 1));
    } finally {
      seen.delete(value);
    }
  }
  try {
    const out = Object.create(null);
    let keys;
    try {
      keys = Object.keys(value);
    } catch {
      return "[UnserializableObject]";
    }
    for (const key of keys.slice(0, 100)) {
      const safeKey = clean(key, 256);
      if (shouldRedact && /password|passwd|secret|token|api[_-]?key|apikey|authorization|cookie|session|private[_-]?key|credential|access[_-]?token|refresh[_-]?token/i.test(key)) {
        out[safeKey] = "[REDACTED]";
        continue;
      }
      let item;
      try {
        item = value[key];
      } catch {
        out[safeKey] = "[UnserializableProperty]";
        continue;
      }
      out[safeKey] = redactValue(item, shouldRedact, seen, depth + 1);
    }
    return bound(out);
  } finally {
    seen.delete(value);
  }
}

function bound(value) {
  const encoded = Buffer.from(JSON.stringify(value) ?? "null", "utf8");
  if (encoded.length <= MAX_TELEMETRY_PAYLOAD_BYTES) return value;
  return { truncated: true, reason: "payload_limit", preview: encoded.subarray(0, Math.min(4096, MAX_TELEMETRY_PAYLOAD_BYTES)).toString("utf8") };
}

function clean(value, maxLength) {
  const sanitized = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "\uFFFD");
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}...[truncated]` : sanitized;
}

function normalizeApiUrl(value) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Aurel API URL must use http or https");
  if (parsed.username || parsed.password) throw new Error("Aurel API URL must not contain credentials");
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

function clampTimeout(value) {
  return Math.min(30_000, Math.max(100, Number.isFinite(value) ? value : 1500));
}

function clampSize(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 1_048_576));
}
