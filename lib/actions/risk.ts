import type { AurelActionRequest } from "@/lib/actions/protocol";

const HIGH_RISK_TOOL_NAMES = [
  /(?:^|[\s._:-])(shell|terminal|exec|process|command)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(write|delete|remove|patch|move|rename|chmod|chown)(?:$|[\s._:-])/i,
  /git.*push|push.*git/i,
  /(?:^|[\s._:-])(http|fetch|request|browser|network)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(auth|credential|token|secret|password|cookie)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(email|message|send|sms|slack|discord)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(database|sql|mutation|insert|update|delete)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(cloud|deploy|infra|terraform|kubectl|aws|gcloud|azure)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(install|package|npm|pip|cargo)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(subagent|delegate|handoff|spawn)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(schedule|cron|automation)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(mcp|external_api)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(payment|finance|transfer|purchase|trade|bank)(?:$|[\s._:-])/i,
  /(?:^|[\s._:-])(permission|role|policy|acl)(?:$|[\s._:-])/i,
];

const HIGH_RISK_CONTEXT = [
  /shell|terminal|exec|process|command/i,
  /write|delete|remove|patch|move|rename|chmod|chown/i,
  /git.*push|push.*git/i,
  /http|fetch|request|browser|network/i,
  /auth|credential|token|secret|password|cookie/i,
  /email|message|send|sms|slack|discord/i,
  /database|sql|mutation|insert|update|delete/i,
  /cloud|deploy|infra|terraform|kubectl|aws|gcloud|azure/i,
  /install|package|npm|pip|cargo/i,
  /subagent|delegate|handoff|spawn/i,
  /schedule|cron|automation/i,
  /mcp|external_api/i,
  /payment|finance|transfer|purchase|trade|bank/i,
  /permission|role|policy|acl/i,
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|rules|messages|directives)/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|rules|messages|directives)/i,
  /(?:system|developer)\s+prompt/i,
  /you\s+are\s+now\s+(?:in|a|an)/i,
  /exfiltrat(?:e|ion)|steal\s+(?:the\s+)?(?:secrets?|tokens?|credentials?|api\s*keys?)/i,
  /do\s+not\s+(?:log|record|audit|track)\b/i,
  /bypass\s+(?:the\s+)?(?:security|policy|guardrails?|approval|audit)/i,
];

export interface LocalRiskClassification {
  category: "low" | "medium" | "high";
  matched: string[];
  score: number;
}

export function classifyActionRisk(action: AurelActionRequest): LocalRiskClassification {
  const toolHaystack = [action.action.name, action.action.type].filter(Boolean).join(" ");
  const haystack = [
    toolHaystack,
    safeArgumentKeys(action.action.arguments).join(" "),
    safeArgumentPreview(action.action.arguments),
    action.context?.targetPaths?.join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const matchedToolNames = HIGH_RISK_TOOL_NAMES.filter((pattern) => pattern.test(` ${toolHaystack} `)).map((pattern) =>
    pattern.source.replaceAll("\\", "")
  );
  const matched = HIGH_RISK_CONTEXT.filter((pattern) => pattern.test(haystack)).map((pattern) =>
    pattern.source.replaceAll("\\", "")
  );
  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(haystack))) {
    matched.push("prompt_injection");
  }

  if (matchedToolNames.length > 0) {
    return {
      category: "high",
      matched: [...matchedToolNames, ...matched.filter((entry) => !matchedToolNames.includes(entry))],
      score: matched.includes("prompt_injection") ? 90 : 80,
    };
  }
  if (matched.includes("prompt_injection")) return { category: "high", matched, score: 90 };
  if (matched.length >= 2) return { category: "high", matched, score: 75 };
  if (matched.length === 1) return { category: "medium", matched, score: 40 };
  return { category: "low", matched, score: 5 };
}

function safeArgumentKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).slice(0, 64);
}

function safeArgumentPreview(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, 8192) ?? "";
  } catch {
    return "";
  }
}
