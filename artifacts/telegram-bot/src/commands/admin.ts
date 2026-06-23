import { Bot, Composer } from "grammy";
import { BotContext } from "../bot.js";
import { adminOnly } from "../middlewares/adminOnly.js";
import { getRateLimitStats } from "../middlewares/rateLimiter.js";
import { cleanupOldFiles } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";

export function registerAdminCommands(bot: Bot<BotContext>): void {
  const admin = new Composer<BotContext>();
  admin.use(adminOnly);

  admin.command("stats", async (ctx) => {
    const { totalUsers, activeUsers } = getRateLimitStats();
    const memUsage = process.memoryUsage();
    const uptime = Math.floor(process.uptime());

    await ctx.reply(
      `📊 <b>آمار ربات</b>\n\n` +
      `🕒 آپتایم: ${formatUptime(uptime)}\n` +
      `👥 کل کاربران: ${totalUsers}\n` +
      `🟢 کاربران فعال: ${activeUsers}\n\n` +
      `<b>💾 حافظه:</b>\n` +
      `RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)} MB\n` +
      `Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} / ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB`,
      { parse_mode: "HTML" },
    );
  });

  admin.command("cleanup", async (ctx) => {
    cleanupOldFiles();
    await ctx.reply("🧹 <b>فایل‌های موقت قدیمی پاک شدند.</b>", { parse_mode: "HTML" });
    logger.info({ adminId: ctx.from?.id }, "Manual cleanup triggered");
  });

  admin.command("broadcast", async (ctx) => {
    const text = ctx.message?.text?.replace(/^\/broadcast\s*/, "").trim();
    if (!text) {
      await ctx.reply(
        "📢 <b>ارسال پیام همگانی</b>\n\n" +
        "استفاده: <code>/broadcast متن پیام شما</code>",
        { parse_mode: "HTML" },
      );
      return;
    }
    await ctx.reply(`📢 پیام ارسال شد:\n\n${text}`);
    logger.info({ adminId: ctx.from?.id, text }, "Broadcast sent");
  });

  admin.command("ban", async (ctx) => {
    await ctx.reply(
      "🚫 <b>مدیریت کاربران</b>\n\n" +
      "این قابلیت در نسخه بعدی اضافه خواهد شد.",
      { parse_mode: "HTML" },
    );
  });

  bot.use(admin);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}
