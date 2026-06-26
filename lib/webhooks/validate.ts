import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:169.254.") ||
    normalized.startsWith("::ffff:172.16.") ||
    normalized.startsWith("::ffff:172.17.") ||
    normalized.startsWith("::ffff:172.18.") ||
    normalized.startsWith("::ffff:172.19.") ||
    normalized.startsWith("::ffff:172.2") ||
    normalized.startsWith("::ffff:172.30.") ||
    normalized.startsWith("::ffff:172.31.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

export interface WebhookUrlValidation {
  ok: boolean;
  normalizedUrl?: string;
  error?: string;
}

export async function validateWebhookUrl(rawUrl: string): Promise<WebhookUrlValidation> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Webhook URL is invalid" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "Webhook URL must use HTTPS" };
  }

  if (url.username || url.password) {
    return { ok: false, error: "Webhook URL must not include credentials" };
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    return { ok: false, error: "Webhook URL host is not allowed" };
  }

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      return { ok: false, error: "Webhook URL must not target private or local addresses" };
    }
  } else {
    let addresses;
    try {
      addresses = await lookup(hostname, { all: true, verbatim: false });
    } catch {
      return { ok: false, error: "Webhook URL hostname could not be resolved" };
    }

    if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
      return { ok: false, error: "Webhook URL resolves to a private or local address" };
    }
  }

  url.hash = "";
  return { ok: true, normalizedUrl: url.toString() };
}
