export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://aurel.io";

export const AUREL = {
  name: "Aurel",
  legalName: "Aurel",
  tagline: "The intent firewall for autonomous actions",
  description:
    "Aurel is a runtime intent firewall for autonomous actions. It secures the intent before a decision passes, blocking prompt injections, mission drift, suspicious provenance, and policy violations before agents execute high-consequence work.",
  shortDescription:
    "Runtime intent firewall that verifies autonomous action intent before execution.",
  email: "contact@aurel.io",
  github: "https://github.com/Samy-NT/intentguard",
  keywords: [
    "Aurel",
    "autonomous actions",
    "AI agent security",
    "intent firewall",
    "agent execution security",
    "runtime guardrails",
    "decision verification API",
    "payment guardrails",
    "prompt injection detection",
    "semantic risk analysis",
    "LangChain agent security",
    "CrewAI agent security",
  ],
} as const;

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export const publicRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/ai-index", priority: 0.95, changeFrequency: "weekly" },
  { path: "/api-reference", priority: 0.9, changeFrequency: "weekly" },
  { path: "/security", priority: 0.9, changeFrequency: "monthly" },
  { path: "/benchmark", priority: 0.9, changeFrequency: "monthly" },
  { path: "/use-cases", priority: 0.85, changeFrequency: "monthly" },
  { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
] as const;
