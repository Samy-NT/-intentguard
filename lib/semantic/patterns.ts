export type AttackVector =
  | "direct_injection"
  | "social_engineering"
  | "urgency_manipulation"
  | "authority_spoofing"
  | "mission_drift"
  | "suspicious_provenance"
  | "confidentiality_request";

export interface PatternScreenResult {
  vectors: AttackVector[];
  /** Score contribution (0–60) from deterministic pattern matching, added before Claude scoring */
  score_contribution: number;
  mission_alignment: "coherent" | "drift_detected" | "not_provided";
}

// ── Dimension 1 patterns ──────────────────────────────────────────────────────

const AUTHORITY_PATTERNS: RegExp[] = [
  /pour des raisons de conformit[eé]/i,
  /(?:compliance|finance|legal|audit|rh|direction)\s+team\s+(?:asks?|requests?|requires?|demands?|mandates?)/i,
  /l[' ]?[ée]quipe (?:finance|rh|direction|it|s[eé]curit[eé]|comptabilit[eé]) (?:demande|requiert|exige|mandate)/i,
  /(?:audit|external\s+audit|r[eé]gulateur)\s+(?:requires?|requests?|demands?|exige)/i,
  /(?:as\s+per|according\s+to)\s+(?:the\s+)?(?:regulatory|compliance|audit)\s+\w*\s*(?:requirement|request|instruction)/i,
  /mandated\s+by\s+(?:regulation|compliance|legal|audit)/i,
  /(?:validation|confirmation)\s+(?:requise?|required)\s+(?:par|by)\s+(?:le?\s+)?r[eé]gulateur/i,
  /external\s+audit\s+(?:requires?|requests?)/i,
];

const URGENCY_PATTERNS: RegExp[] = [
  /avant\s+minuit/i,
  /before\s+midnight/i,
  /d[eé]lai\s+critique/i,
  /critical\s+deadline/i,
  /action\s+imm[eé]diate/i,
  /immediate\s+action\s+(?:required|needed)/i,
  /fen[eê]tre\s+de\s+\d+\s+minutes?/i,
  /\d+[\s-]?minute\s+window/i,
  /expires?\s+in\s+\d+\s+(?:minutes?|hours?)/i,
  /time[\s-]sensitive/i,
  /must\s+(?:be\s+)?(?:processed?|completed?|done)\s+(?:urgently|immediately|asap)/i,
];

const CONFIDENTIALITY_PATTERNS: RegExp[] = [
  /ne\s+pas\s+logger?\b/i,
  /do\s+not\s+(?:log|record|track|document)\b/i,
  /don[' ]?t\s+(?:log|record|track|document)\b/i,
  /hors\s+proc[eé]dure/i,
  /outside\s+(?:normal|standard|regular|usual)\s+(?:procedure|process|channel)/i,
  /bypass\s+(?:the\s+)?(?:normal|standard|regular|usual)\s+\w+/i,
  /discr[eè]tement\b/i,
  /discreetly\b/i,
  /(?:keep|treat)\s+(?:this\s+)?(?:confidential|private|secret|off[\s-]the[\s-]record)/i,
  /off[\s-]the[\s-]record/i,
  /skip\s+(?:the\s+)?(?:log|audit|record|logging)/i,
];

// ── Dimension 3 patterns ──────────────────────────────────────────────────────

const PROVENANCE_PATTERNS: RegExp[] = [
  /(?:as\s+per|according\s+to)\s+(?:the\s+)?(?:email|pdf|document|file|attachment)\s+(?:received|attached|sent)/i,
  /(?:selon|d[' ]apr[eè]s)\s+(?:l[' ]?)?(?:email|mail|courriel|pdf|document|fichier)\s+(?:re[cç]u|joint|attach[eé])/i,
  /from\s+the\s+(?:email|pdf|document|file)\s+(?:i\s+)?(?:received|got|downloaded)/i,
  /(?:the\s+)?(?:email|pdf|document)\s+(?:says?|states?|requests?|instructs?)\s+(?:to\s+)?pay/i,
  /(?:based\s+on|per)\s+(?:the\s+)?(?:api\s+response|external\s+(?:system|service|api)|third[\s-]party\s+(?:data|api|system))/i,
  /invoice\s+(?:received|in\s+the\s+email)\s+(?:says?|requests?)/i,
  /d[' ]apr[eè]s\s+le\s+(?:pdf|fichier|document)/i,
];

// ── Dimension 2 — Mission drift ───────────────────────────────────────────────

const FINANCIAL_REDIRECT_TERMS: RegExp[] = [
  /frais?\s+bancaires?/i,
  /mise\s+[aà]\s+jour\s+(?:de\s+)?compte(?:\s+bancaire)?/i,
  /virement\s+externe/i,
  /bank\s+(?:transfer|fee[s]?|charge[s]?|account\s+update)/i,
  /wire\s+transfer/i,
  /investment\s+(?:fund|account|portfolio|service)/i,
  /portfolio\s+management/i,
  /(?:forex|foreign\s+exchange)\s+(?:transfer|fee)/i,
  /loan\s+(?:repayment|payment|processing)/i,
  /mortgage\s+payment/i,
  /financial\s+(?:institution|transfer)\s+fee/i,
];

const TECH_SCOPE_INDICATORS: RegExp[] = [
  /\bsaas\b/i,
  /software\s+(?:subscription|license|service)/i,
  /\bsubscriptions?\b/i,
  /cloud\s+(?:infrastructure|hosting|service)/i,
  /\bhosting\b/i,
  /developer\s+tool/i,
  /\bplatform\b/i,
];

const TRAVEL_SCOPE_INDICATORS: RegExp[] = [
  /\btravel\b/i,
  /\bflights?\b/i,
  /\bhotels?\b/i,
  /\bbookings?\b/i,
  /\btrips?\b/i,
  /\baccommodation\b/i,
  /\bairline\b/i,
];

// ── Helper ────────────────────────────────────────────────────────────────────

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

// ── Main export ───────────────────────────────────────────────────────────────

export function preScreenContext(
  context: string,
  missionScope?: string
): PatternScreenResult {
  const vectors: AttackVector[] = [];
  let score = 0;

  // Dimension 1 — Social engineering sub-patterns
  const hasAuthority = matchesAny(context, AUTHORITY_PATTERNS);
  const hasUrgency = matchesAny(context, URGENCY_PATTERNS);
  const hasConfidentiality = matchesAny(context, CONFIDENTIALITY_PATTERNS);

  if (hasAuthority) {
    vectors.push("authority_spoofing");
    score += 25;
  }
  if (hasUrgency) {
    vectors.push("urgency_manipulation");
    score += 20;
  }
  if (hasConfidentiality) {
    vectors.push("confidentiality_request");
    score += 30;
  }
  // social_engineering is the meta-vector when ≥2 sub-patterns fire
  const socialCount = (hasAuthority ? 1 : 0) + (hasUrgency ? 1 : 0) + (hasConfidentiality ? 1 : 0);
  if (socialCount >= 2) {
    vectors.push("social_engineering");
    score += 10; // combination bonus
  }

  // Dimension 3 — Suspicious provenance
  if (matchesAny(context, PROVENANCE_PATTERNS)) {
    vectors.push("suspicious_provenance");
    score += 15;
  }

  // Dimension 2 — Mission drift (requires missionScope)
  let mission_alignment: "coherent" | "drift_detected" | "not_provided" = "not_provided";

  if (missionScope) {
    const hasFinancialRedirect = matchesAny(context, FINANCIAL_REDIRECT_TERMS);
    const scopeIsTech = matchesAny(missionScope, TECH_SCOPE_INDICATORS);
    const scopeIsTravel = matchesAny(missionScope, TRAVEL_SCOPE_INDICATORS);

    if (hasFinancialRedirect && (scopeIsTech || scopeIsTravel)) {
      vectors.push("mission_drift");
      score += 40;
      mission_alignment = "drift_detected";
    } else {
      mission_alignment = "coherent";
    }
  }

  return {
    vectors,
    score_contribution: Math.min(60, score),
    mission_alignment,
  };
}
