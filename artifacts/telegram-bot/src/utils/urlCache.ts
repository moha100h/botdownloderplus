import { randomBytes } from "crypto";

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

function cleanExpired(): void {
  const now = Date.now();
  for (const [id, entry] of cache.entries()) {
    if (entry.expiresAt < now) cache.delete(id);
  }
}

export function storeUrl(url: string): string {
  cleanExpired();
  const id = randomBytes(4).toString("hex");
  cache.set(id, { url, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function getUrl(id: string): string | undefined {
  const entry = cache.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(id);
    return undefined;
  }
  return entry.url;
}
