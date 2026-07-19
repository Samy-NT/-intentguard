import { type NextRequest } from "next/server";

export function requireCronSecret(req: NextRequest): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") return null;
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });

  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
