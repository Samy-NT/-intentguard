export type IntentGuardDecision = "allow" | "flag" | "block";

export interface IntentGuardClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface VerifyIntentInput {
  intent_id: string;
  agent_id: string;
  amount: number;
  currency: string;
  recipient: string;
  merchant_id?: string;
  agent_context?: string;
  metadata?: Record<string, unknown>;
}

export interface VerifyIntentResult {
  decision: IntentGuardDecision;
  reason: string;
  triggered_rule?: string;
  risk_score: number;
  evaluated_at: string;
  intent_id: string;
}

export class IntentGuardError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "IntentGuardError";
  }
}

export class IntentGuardClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: IntentGuardClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.intentguard.io").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async verify(input: VerifyIntentInput): Promise<VerifyIntentResult> {
    return this.request<VerifyIntentResult>("/api/v1/verify", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getSettings<T = Record<string, unknown>>(): Promise<T> {
    const data = await this.request<{ settings: T }>("/api/v1/workspace/settings");
    return data.settings;
  }

  async updateSettings<T extends Record<string, unknown>>(settings: T): Promise<void> {
    await this.request<{ success: boolean }>("/api/v1/workspace/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
  }

  async exportAuditLogs(format: "json" | "csv" = "json", limit = 500): Promise<unknown> {
    const path = `/api/v1/workspace/audit-export?format=${encodeURIComponent(format)}&limit=${limit}`;
    if (format === "csv") return this.requestText(path);
    return this.request(path);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        ...init.headers,
      },
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `IntentGuard request failed with HTTP ${res.status}`;
      throw new IntentGuardError(message, res.status, body);
    }
    return body as T;
  }

  private async requestText(path: string): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { "x-api-key": this.apiKey },
    });
    const body = await res.text();
    if (!res.ok) throw new IntentGuardError(body || `HTTP ${res.status}`, res.status, body);
    return body;
  }
}

export function createIntentGuardClient(options: IntentGuardClientOptions): IntentGuardClient {
  return new IntentGuardClient(options);
}
