import { clearSessionCookieHeader } from "@/lib/dashboard-session";

export async function POST() {
  return Response.json(
    { success: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookieHeader(),
      },
    }
  );
}

export const GET = POST;
