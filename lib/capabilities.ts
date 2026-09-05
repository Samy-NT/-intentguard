export type Capability = {
  slug: string;
  shortLabel: string;
  name: string;
  eyebrow: string;
  summary: string;
  outcome: string;
  controls: string[];
  signals: string[];
  bestFor: string;
};

export type AgentType = {
  slug: string;
  name: string;
  eyebrow: string;
  summary: string;
  coverage: string[];
  firstStep: string;
  audience: string;
  actionExamples: string[];
  riskPatterns: string[];
  rollout: { step: string; title: string; text: string }[];
};

export const capabilities: Capability[] = [
  {
    slug: "ai-observability",
    shortLabel: "AI Observability",
    name: "See every agent, action, and dependency",
    eyebrow: "01 / visibility layer",
    summary: "Build a living inventory of agents and the tools, data, identities, and decisions they touch.",
    outcome: "Replace unknown agent activity with an explainable operating picture.",
    controls: ["Agent and MCP inventory across SaaS, endpoints, and custom runtimes", "Execution traces with tool calls, memory writes, and data access", "Ownership, deployment channel, and activity history attached to each agent"],
    signals: ["New or unsanctioned agent detected", "Sensitive resource accessed outside its normal lane", "Agent behavior drifts from its approved mission"],
    bestFor: "Security and platform teams establishing an agent baseline",
  },
  {
    slug: "aispm",
    shortLabel: "AISPM",
    name: "Turn agent posture into enforceable policy",
    eyebrow: "02 / posture management",
    summary: "Evaluate configurations, permissions, integrations, and policy drift before an agent reaches production.",
    outcome: "Catch risky setup as a preventable finding instead of an incident.",
    controls: ["Preflight checks for permissions, tools, models, and environment", "Policy packs for production, sandbox, and regulated workspaces", "Remediation queues with evidence and policy versioning"],
    signals: ["Over-broad tool or data permission", "Unapproved integration or deployment channel", "Configuration changed after approval"],
    bestFor: "Teams governing agents across multiple environments",
  },
  {
    slug: "exposure-management",
    shortLabel: "Exposure Management",
    name: "Prioritize what agents can actually reach",
    eyebrow: "03 / exposure graph",
    summary: "Connect agent actions to sensitive data, tools, identities, and reachable paths so risk reflects real exposure.",
    outcome: "Focus remediation on the paths that can cause harm, not a flat list of findings.",
    controls: ["Agent-to-resource relationship graph", "Sensitive data and oversharing lens", "Reachability scoring for high-consequence actions"],
    signals: ["Sensitive data reachable through a low-trust agent", "Multiple agents share an unbounded resource", "A new tool creates a path to a high-impact system"],
    bestFor: "Security teams reducing agent attack surface",
  },
  {
    slug: "boundaries",
    shortLabel: "Boundaries",
    name: "Keep runtime actions inside the mission",
    eyebrow: "04 / runtime enforcement",
    summary: "Define hard limits for targets, amounts, data classes, tools, and side effects before an action executes.",
    outcome: "Make the safe operating lane explicit and enforce it at the last responsible moment.",
    controls: ["Per-agent and per-workspace action boundaries", "Target, amount, volume, and data-scope constraints", "Allow, flag, or block decisions before downstream execution"],
    signals: ["Mission drift or unexpected target", "Velocity spike or repeated retry pattern", "Action exceeds a declared boundary"],
    bestFor: "Product teams protecting high-consequence tool calls",
  },
  {
    slug: "agentic-identity",
    shortLabel: "Agentic Identity",
    name: "Give every agent a verifiable operating identity",
    eyebrow: "05 / identity and access",
    summary: "Bind actions to an agent identity, owner, purpose, and least-privilege credential instead of a shared secret.",
    outcome: "Make accountability and access control first-class for autonomous work.",
    controls: ["Stable agent identity with owner and purpose metadata", "Scoped, short-lived credentials and delegated access", "Identity-aware audit records and approval handoffs"],
    signals: ["Credential used outside its declared agent", "Owner or purpose missing from a sensitive action", "Delegation chain cannot be verified"],
    bestFor: "Enterprises introducing identity controls for autonomous systems",
  },
  {
    slug: "mcp-security",
    shortLabel: "MCP Security",
    name: "Make every tool server a controlled surface",
    eyebrow: "06 / tool protocol security",
    summary: "Discover MCP servers, validate their tools, and gate calls with provenance, scope, and runtime policy.",
    outcome: "Keep tool connectivity useful without turning an agent into an unbounded remote operator.",
    controls: ["MCP server and tool inventory", "Allowlisted tool schemas and argument constraints", "Server provenance, approval state, and call telemetry"],
    signals: ["Unknown server or tool introduced", "Tool arguments exceed the approved schema", "Prompt or server content attempts to redirect execution"],
    bestFor: "Developers and security teams shipping MCP-enabled agents",
  },
  {
    slug: "aidr",
    shortLabel: "AIDR",
    name: "Detect, contain, and learn from agent incidents",
    eyebrow: "07 / detection and response",
    summary: "Correlate agent signals into incidents and trigger response playbooks while preserving the decision evidence.",
    outcome: "Move from alert fatigue to fast, explainable containment.",
    controls: ["Risk-based detections across identity, posture, exposure, and behavior", "Containment playbooks for credentials, tools, and workspaces", "Signed incident timeline with review and recovery state"],
    signals: ["Prompt injection or suspicious provenance", "Coordinated anomalous actions across agents", "Repeated policy violations after remediation"],
    bestFor: "SOC and platform teams operating agents at scale",
  },
];

export const agentTypes: AgentType[] = [
  {
    slug: "agentic-saas",
    name: "Agentic SaaS",
    eyebrow: "01 / managed platforms",
    summary: "Protect agents embedded in the SaaS platforms your teams already use, without losing ownership or policy context.",
    coverage: ["Inventory agents and owners across business platforms", "Apply environment-aware posture and permission checks", "Gate sensitive actions with identity, boundary, and audit context"],
    firstStep: "Connect a SaaS workspace and establish the first approved agent baseline.",
    audience: "Security, IT, and platform teams governing agents inside business SaaS.",
    actionExamples: ["Approve or reject an invoice payment", "Change a CRM account or entitlement", "Send a customer message or export a report"],
    riskPatterns: ["A connector inherits a broader permission set than the agent needs", "A production workflow executes outside its approved business hours", "An instruction hidden in a record redirects the agent to a new recipient"],
    rollout: [
      { step: "01", title: "Inventory", text: "Map workspaces, owners, agents, connectors, and the data each workflow can reach." },
      { step: "02", title: "Set the lane", text: "Define allowed tools, targets, spend caps, approval thresholds, and escalation routes." },
      { step: "03", title: "Enforce", text: "Place the verification call immediately before the SaaS side effect and retain signed evidence." },
    ],
  },
  {
    slug: "coding-personal-agents",
    name: "Personal & Coding Agents",
    eyebrow: "02 / developer surfaces",
    summary: "Bring local coding assistants, desktop agents, and personal MCP servers into the same intent and tool-security model.",
    coverage: ["Register local agents and MCP servers", "Constrain file, shell, repository, and deployment tools", "Capture provenance and runtime traces without blocking safe iteration"],
    firstStep: "Install the Aurels plugin and wrap the first high-consequence local tool.",
    audience: "Developers and security-minded teams using coding assistants, desktop agents, or local MCP servers.",
    actionExamples: ["Write or delete files in a repository", "Run a migration, shell command, or package publish", "Open a pull request or deploy to production"],
    riskPatterns: ["A tool call targets secrets, production files, or an untrusted repository", "Prompt injection turns a read task into a destructive shell command", "A local agent publishes or deploys without an approval boundary"],
    rollout: [
      { step: "01", title: "Install", text: "Add the plugin or SDK wrapper to the local runtime without changing the agent's normal workflow." },
      { step: "02", title: "Constrain", text: "Block sensitive paths and commands, require approval for deploys, and record tool provenance." },
      { step: "03", title: "Review", text: "Use traces and signed decisions to tune safe automation instead of relying on broad allowlists." },
    ],
  },
  {
    slug: "cloud-and-homegrown",
    name: "Cloud & Homegrown",
    eyebrow: "03 / custom runtimes",
    summary: "Extend the same controls to agents built on cloud platforms, internal frameworks, and bespoke orchestration layers.",
    coverage: ["Use API and SDK adapters at the execution boundary", "Unify policy, identity, posture, and telemetry across clouds", "Export signed decisions to audit, SIEM, and operational workflows"],
    firstStep: "Add an Aurels verification call immediately before the first external side effect.",
    audience: "Platform engineers building custom agents across cloud services, internal APIs, and orchestration frameworks.",
    actionExamples: ["Provision or modify cloud infrastructure", "Move data between internal and external systems", "Trigger a multi-step workflow with financial or operational impact"],
    riskPatterns: ["A custom agent bypasses the shared policy layer through a new adapter", "A service identity can reach multiple tenants or environments", "Retries duplicate an external side effect after a timeout"],
    rollout: [
      { step: "01", title: "Instrument", text: "Send the proposed action, identity, mission scope, and trace to the versioned verification API." },
      { step: "02", title: "Unify", text: "Reuse one policy model across clouds, frameworks, queues, and human approval surfaces." },
      { step: "03", title: "Operate", text: "Stream signed decisions and bounded telemetry to your SIEM, audit store, and incident workflows." },
    ],
  },
];

export function getCapability(slug: string) {
  return capabilities.find((item) => item.slug === slug);
}

export function getAgentType(slug: string) {
  return agentTypes.find((item) => item.slug === slug);
}
