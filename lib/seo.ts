export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://aurels.dev";

export const AUREL = {
  name: "Aurels",
  legalName: "Aurels",
  tagline: "The intent firewall for autonomous actions",
  description:
    "Aurels is a runtime intent firewall for autonomous actions. It secures the intent before a decision passes, blocking prompt injections, mission drift, suspicious provenance, and policy violations before agents execute high-consequence work.",
  shortDescription:
    "Runtime intent firewall that verifies autonomous action intent before execution.",
  email: "aurels.dev@gmail.com",
  github: "https://github.com/Samy-NT/intentguard",
  keywords: [
    "Aurels",
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
  { path: "/plugins", priority: 0.88, changeFrequency: "weekly" },
  { path: "/startup", priority: 0.88, changeFrequency: "weekly" },
  { path: "/use-cases", priority: 0.85, changeFrequency: "monthly" },
  { path: "/capabilities", priority: 0.9, changeFrequency: "monthly" },
  { path: "/capabilities/ai-observability", priority: 0.82, changeFrequency: "monthly" },
  { path: "/capabilities/aispm", priority: 0.82, changeFrequency: "monthly" },
  { path: "/capabilities/exposure-management", priority: 0.82, changeFrequency: "monthly" },
  { path: "/capabilities/boundaries", priority: 0.82, changeFrequency: "monthly" },
  { path: "/capabilities/agentic-identity", priority: 0.82, changeFrequency: "monthly" },
  { path: "/capabilities/mcp-security", priority: 0.82, changeFrequency: "monthly" },
  { path: "/capabilities/aidr", priority: 0.82, changeFrequency: "monthly" },
  { path: "/use-cases/agent-type/agentic-saas", priority: 0.8, changeFrequency: "monthly" },
  { path: "/use-cases/agent-type/coding-personal-agents", priority: 0.8, changeFrequency: "monthly" },
  { path: "/use-cases/agent-type/cloud-and-homegrown", priority: 0.8, changeFrequency: "monthly" },
  { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
  { path: "/mentions-legales", priority: 0.55, changeFrequency: "yearly" },
  { path: "/politique-de-confidentialite", priority: 0.55, changeFrequency: "yearly" },
] as const;
