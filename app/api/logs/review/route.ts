import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateRequest, requireRole } from "@/lib/auth";

const ReviewSchema = z.object({
  id: z.string().uuid(),
  review_status: z.enum(["approved", "rejected"]),
  review_note: z.string().max(1000).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;
  const { db, workspace_id } = auth;
  const forbidden = requireRole(auth, "operator");
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 422 });
  }

  const { data, error } = await db
    .from("verify_logs")
    .update({
      review_status: parsed.data.review_status,
      review_note: parsed.data.review_note ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspace_id)
    .eq("id", parsed.data.id)
    .eq("decision", "flag")
    .select("id, review_status, review_note, reviewed_at")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Flagged log not found" }, { status: 404 });

  return Response.json({ log: data });
}
