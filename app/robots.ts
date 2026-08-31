import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

const searchableAgents = [
  "*",
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Applebot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: searchableAgents.map((userAgent) => ({
      userAgent,
      allow: "/",
      disallow: ["/dashboard/", "/auth/", "/billing/", "/onboarding/", "/api/"],
    })),
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

