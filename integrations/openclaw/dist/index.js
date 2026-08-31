import { createAurelHttpClient, createOpenClawAurelHandlers, loadConfig } from "./security.js";
const definePluginEntry = await loadDefinePluginEntry();
async function loadDefinePluginEntry() {
    try {
        const sdk = await import("openclaw/plugin-sdk/plugin-entry");
        if (typeof sdk.definePluginEntry === "function")
            return sdk.definePluginEntry;
    }
    catch (_a) {
        // Older OpenClaw builds did not expose this SDK subpath. The entry object
        // shape is still plain data, so keep the package importable for diagnostics.
    }
    try {
        const sdk = await import("openclaw/plugin-sdk");
        if (typeof sdk.definePluginEntry === "function")
            return sdk.definePluginEntry;
    }
    catch (_b) {
        // Local tests may run without OpenClaw installed in this repo.
    }
    return (entry) => entry;
}
function readPluginConfig(api) {
    if (api && typeof api === "object") {
        const candidate = api;
        if (typeof candidate.getConfig === "function")
            return candidate.getConfig();
        return candidate.config;
    }
    return {};
}
const entry = definePluginEntry({
    id: "aurel",
    name: "Aurel Security Middleware",
    description: "Intercept OpenClaw tool calls and enforce Aurel security policy before execution.",
    register(api) {
        var _a, _b;
        const useLegacyRegisterHook = typeof api.on !== "function" && typeof api.registerHook === "function";
        const registerHook = typeof api.on === "function" ? api.on.bind(api) : typeof api.registerHook === "function" ? api.registerHook.bind(api) : undefined;
        if (!registerHook) {
            (_a = api.registerCommand) === null || _a === void 0 ? void 0 : _a.call(api, {
                name: "aurel",
                description: "Show Aurel plugin status.",
                requireAuth: true,
                handler: () => ({
                    text: [
                        "Aurel: unavailable",
                        "Protection: disabled",
                        "Reason: this OpenClaw runtime does not expose api.on tool-call hooks.",
                    ].join("\n"),
                }),
            });
            throw new Error("Aurel requires an OpenClaw runtime with api.on or registerHook tool-call hooks.");
        }
        const config = loadConfig(readPluginConfig(api));
        const client = createAurelHttpClient(config);
        const handlers = createOpenClawAurelHandlers(config, client);
        const options = Object.assign({ registrationId: "aurel-tool-security", priority: 100, timeoutMs: config.timeoutMs + 250 }, (config.tools.include.length > 0 ? { matcher: config.tools.include } : {}));
        const beforeToolCall = useLegacyRegisterHook
            ? async (event, ctx) => legacySafeBeforeToolCall(await handlers.beforeToolCall(event, ctx))
            : handlers.beforeToolCall;
        registerHook("before_tool_call", beforeToolCall, options);
        registerHook("after_tool_call", handlers.afterToolCall, options);
        (_b = api.registerCommand) === null || _b === void 0 ? void 0 : _b.call(api, {
            name: "aurel",
            description: "Show Aurel plugin status.",
            requireAuth: true,
            handler: () => {
                var _a, _b;
                const status = handlers.status();
                return {
                    text: [
                        `Aurel: ${config.apiKey ? "configured" : "missing api key"}`,
                        `Protection: ${status.enabled ? "enabled" : "disabled"}`,
                        `Fail mode: ${status.failMode}`,
                        `Telemetry: ${status.telemetry ? "enabled" : "disabled"}`,
                        `Last decision: ${(_b = (_a = status.lastDecision) === null || _a === void 0 ? void 0 : _a.decision) !== null && _b !== void 0 ? _b : "none"}`,
                    ].join("\n"),
                };
            },
        });
    },
});
export default entry;
function legacySafeBeforeToolCall(result) {
    if (result && typeof result === "object" && "requireApproval" in result) {
        return {
            block: true,
            blockReason: "Aurel requires human approval before this action can run.",
        };
    }
    return result;
}
