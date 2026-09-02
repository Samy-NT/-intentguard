import { type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { buildWorkspaceOpsStatus } from "@/lib/ops-status";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  try {
    const status = await buildWorkspaceOpsStatus(auth.db, auth.workspace_id);
    return Response.json(status, { status: status.status === "fail" ? 503 : 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to build ops status" },
      { status: 500 }
    );
  }
}
