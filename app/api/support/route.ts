import { type NextRequest } from "next/server";
import { z } from "zod";
import { readBoundedJsonBody } from "@/lib/http/body";
import { checkSupportRateLimit } from "@/lib/ratelimit";
import { err, json } from "@/lib/respond";
import { fireWebhook } from "@/lib/webhooks/notify";
import { trustedClientIdentity } from "@/lib/request-identity";

const MAX_SUPPORT_BODY_BYTES = 16_000;

const SupportRequestSchema = z.object({
  name: z.string().max(128).optional(),
  email: z.string().email().max(256).optional(),
  company: z.string().max(128).optional(),
  workspace_id: z.string().max(256).optional(),
  deployment_url: z.string().url().max(2048).optional(),
  category: z.enum(["setup", "billing", "security", "incident", "integration", "other"]).default("other"),
  severity: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  subject: z.string().min(3).max(160),
  message: z.string().min(10).max(4000),
});

function supportRateLimitIdentifier(req: NextRequest): string {
  return trustedClientIdentity(req);
}

export async function POST(req: NextRequest) {
  const rateLimit = await checkSupportRateLimit(supportRateLimitIdentifier(req));
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many support requests. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
        },
      }
    );
  }

  const parsedBody = await readBoundedJsonBody(req, MAX_SUPPORT_BODY_BYTES);
  if (parsedBody instanceof Response) return parsedBody;

  const parsed = SupportRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) return err(parsed.error.issues.map((issue) => issue.message).join(", "), 422);

  const url = process.env.SUPPORT_WEBHOOK_URL;
  if (!url) return err("SUPPORT_WEBHOOK_URL is not configured", 503);

  const submitted_at = new Date().toISOString();
  const delivery = await fireWebhook(
    {
      event: "support.ticket.created",
      submitted_at,
      ticket: parsed.data,
      request: {
        user_agent: req.headers.get("user-agent"),
        origin: req.headers.get("origin"),
      },
    },
    {
      url,
      secret: process.env.SUPPORT_WEBHOOK_SECRET,
      threshold: 0,
    }
  );

  if (delivery.status !== "delivered") {
    return err(delivery.error ?? "Support ticket delivery failed", delivery.status === "blocked" ? 400 : 502);
  }

  return json({ success: true, status: "submitted", submitted_at }, 202);
}
