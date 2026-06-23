import { Context, NextFunction } from "grammy";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

interface RateEntry {
  count: number;
  resetAt: number;
}

const store = new Map<number, RateEntry>();

export async function rateLimiter(ctx: Context, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return next();

  if (userId === config.adminId) return next();

  const now = Date.now();
  let entry = store.get(userId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + config.rateLimitWindowMs };
    store.set(userId, entry);
  }

  entry.count++;

  if (entry.count > config.rateLimitRequests) {
    const remainingSecs = Math.ceil((entry.resetAt - now) / 1000);
    logger.warn({ userId, count: entry.count }, "Rate limit exceeded");
    await ctx.reply(
      `⏳ تعداد درخواست‌های شما بیش از حد مجاز است.\n` +
      `لطفاً ${remainingSecs} ثانیه صبر کنید.`,
    );
    return;
  }

  await next();
}

export function getRateLimitStats(): { totalUsers: number; activeUsers: number } {
  const now = Date.now();
  let active = 0;
  for (const entry of store.values()) {
    if (now < entry.resetAt && entry.count > 0) active++;
  }
  return { totalUsers: store.size, activeUsers: active };
}
