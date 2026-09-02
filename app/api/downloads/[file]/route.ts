import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { resolveDownloadArtifact } from "@/lib/downloads";
import { type NextRequest } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const download = resolveDownloadArtifact(file);

  if (!download) {
    return Response.json({ error: "Unknown download" }, { status: 404 });
  }

  try {
    const info = await stat(download.path);
    if (!info.isFile()) throw new Error("Download artifact path is not a file");
  } catch {
    return Response.json({ error: "Download artifact has not been built yet" }, { status: 404 });
  }

  return new Response(Readable.toWeb(createReadStream(download.path)) as ReadableStream, {
    headers: {
      "Content-Type": download.type,
      "Content-Disposition": `attachment; filename="${download.label}"`,
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
