import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Sliding-window rate limiter backed by Upstash Redis.
 * Falls back to in-memory Map when UPSTASH_REDIS_REST_URL is not configured
 * (local dev / test environments where Redis is not available).
 */

// ── In-memory fallback ────────────────────────────────────────────────────────

const memoryStore = new Map<string, { count: number; resetAt: number }>();
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (now > entry.resetAt) {
      memoryStore.delete(key);
    }
  }
}

// Start cleanup interval
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS);
}

function memoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now > entry.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// ── Upstash Redis limiter ─────────────────────────────────────────────────────

let redisLimiter: Ratelimit | null = null;
const limiterCache = new Map<string, Ratelimit>();

function getRedisLimiter(): Ratelimit | null {
  if (redisLimiter) return redisLimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  try {
    const redis = new Redis({ url, token });
    redisLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      analytics: false,
      prefix: "ig:demo:rl",
    });
    return redisLimiter;
  } catch (e) {
    console.warn("[ratelimit] Failed to create Redis limiter, using memory fallback:", e);
    return null;
  }
}

function getNamedRedisLimiter(prefix: string, limit: number, window: `${number} ${"s" | "m" | "h" | "d"}`): Ratelimit | null {
  const cacheKey = `${prefix}:${limit}:${window}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const redis = new Redis({ url, token });
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      analytics: false,
      prefix,
    });
    limiterCache.set(cacheKey, limiter);
    return limiter;
  } catch (e) {
    console.warn(`[ratelimit] Failed to create ${prefix} limiter, using memory fallback:`, e);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix ms timestamp when the window resets */
  resetAt: number;
}

export async function checkDemoRateLimit(identifier: string): Promise<RateLimitResult> {
  const limiter = getRedisLimiter();

  if (limiter) {
    try {
      const result = await limiter.limit(identifier);
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetAt: result.reset,
      };
    } catch (e) {
      console.warn("[ratelimit] Redis error, falling back to memory:", e);
    }
  }

  // In-memory fallback: 10 requests per hour
  const WINDOW_MS = 3_600_000;
  const LIMIT = 10;
  const allowed = memoryRateLimit(identifier, LIMIT, WINDOW_MS);
  const entry = memoryStore.get(identifier)!;
  return {
    allowed,
    remaining: allowed ? LIMIT - entry.count : 0,
    resetAt: entry.resetAt,
  };
}

export async function checkWorkspaceRateLimit(
  workspaceId: string,
  limit = 600,
  windowMs = 60_000
): Promise<RateLimitResult> {
  const limiter = getNamedRedisLimiter("ig:verify:rl", limit, "60 s");

  if (limiter) {
    try {
      const result = await limiter.limit(workspaceId);
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetAt: result.reset,
      };
    } catch (e) {
      console.warn("[ratelimit] Redis error, falling back to memory:", e);
    }
  }

  const allowed = memoryRateLimit(`verify:${workspaceId}`, limit, windowMs);
  const entry = memoryStore.get(`verify:${workspaceId}`)!;
  return {
    allowed,
    remaining: allowed ? limit - entry.count : 0,
    resetAt: entry.resetAt,
  };
}
