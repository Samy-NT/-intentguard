import { readFile } from "node:fs/promises";
import { resolveDownloadManifest } from "@/lib/downloads";

export async function GET() {
  const manifest = resolveDownloadManifest();

  try {
    const body = await readFile(manifest.path, "utf8");
    return new Response(body, {
      headers: {
        "Content-Type": manifest.type,
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Download manifest has not been built yet" }, { status: 404 });
  }
}
