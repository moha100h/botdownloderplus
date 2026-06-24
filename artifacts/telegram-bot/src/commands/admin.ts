import { Bot } from "grammy";
import { BotContext } from "../bot.js";
import { adminOnly } from "../middlewares/adminOnly.js";
import { getRateLimitStats } from "../middlewares/rateLimiter.js";
import { cleanupOldFiles } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { config } from "../config.js";
import { getYouTubeCookiesFile, hasYouTubeCookies, hasInstagramCookies } from "../utils/downloader.js";

export function registerAdminCommands(bot: Bot<BotContext>): void {
  // adminOnly روی هر دستور جداگانه اعمال می‌شود
  // تا زنجیره middleware برای کاربران عادی قطع نشود

  bot.command("stats", adminOnly, async (ctx) => {
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

  bot.command("cleanup", adminOnly, async (ctx) => {
    cleanupOldFiles();
    await ctx.reply("🧹 <b>فایل‌های موقت قدیمی پاک شدند.</b>", { parse_mode: "HTML" });
    logger.info({ adminId: ctx.from?.id }, "Manual cleanup triggered");
  });

  bot.command("broadcast", adminOnly, async (ctx) => {
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

  bot.command("ban", adminOnly, async (ctx) => {
    await ctx.reply(
      "🚫 <b>مدیریت کاربران</b>\n\n" +
      "این قابلیت در نسخه بعدی اضافه خواهد شد.",
      { parse_mode: "HTML" },
    );
  });

  bot.command("cookiestatus", adminOnly, async (ctx) => {
    const ytDiskPath = join(config.downloadDir, ".youtube-cookies.txt");
    const igDiskPath = join(config.downloadDir, ".instagram-cookies.txt");

    const ytExists  = existsSync(ytDiskPath);
    const ytSize    = ytExists ? statSync(ytDiskPath).size : 0;
    const igExists  = existsSync(igDiskPath);
    const igSize    = igExists ? statSync(igDiskPath).size : 0;

    const ytEnv  = config.youtubeCookies.length > 0;
    const igEnv  = config.instagramCookies.length > 0;

    const ytOk = (ytExists && ytSize > 10) || ytEnv;
    const igOk = (igExists && igSize > 10) || igEnv;

    const statusLine = (ok: boolean, label: string, size: number, fromEnv: boolean) =>
      ok
        ? `✅ <b>${label}</b> — ${fromEnv && size === 0 ? "از متغیر محیطی" : `فایل دیسک (${(size / 1024).toFixed(1)} KB)`}`
        : `❌ <b>${label}</b> — کوکی تنظیم نشده`;

    const statusMsg = [
      "🍪 <b>وضعیت کوکی‌ها</b>\n",
      statusLine(ytOk, "YouTube / Spotify", ytSize, ytEnv && !ytExists),
      statusLine(igOk, "Instagram", igSize, igEnv && !igExists),
      "",
      ytOk
        ? "🔄 در حال تست اتصال به YouTube..."
        : "⚠️ برای YouTube و Spotify کوکی لازم است.\nفایل cookies.txt را با caption <code>setcookies youtube</code> بفرستید.",
    ].join("\n");

    const sent = await ctx.reply(statusMsg, { parse_mode: "HTML" });

    if (!ytOk) return;

    // live test: try fetching video info with yt-dlp
    try {
      const cookiesFile = getYouTubeCookiesFile();
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);

      const ytdlpBin = join(config.downloadDir, ".yt-dlp-bin");
      const binToUse = existsSync(ytdlpBin) ? ytdlpBin : "yt-dlp";

      const cmdArgs = [
        "--skip-download",
        "--quiet",
        "--print", "title",
        "--extractor-args", "youtube:player_client=web",
        ...(cookiesFile ? ["--cookies", cookiesFile] : []),
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ];

      const { stdout } = await execFileAsync(binToUse, cmdArgs, { timeout: 20_000 });
      const title = stdout.trim() || "OK";

      await ctx.api.editMessageText(
        ctx.chat.id,
        sent.message_id,
        statusMsg.replace("🔄 در حال تست اتصال به YouTube...", `✅ <b>تست موفق!</b>\nعنوان ویدیو: <i>${title}</i>`),
        { parse_mode: "HTML" },
      );
    } catch (testErr: any) {
      const errMsg = (testErr?.stderr ?? testErr?.message ?? "").toString().slice(0, 200);
      const isBotCheck = /Sign in to confirm|bot detection/i.test(errMsg);
      await ctx.api.editMessageText(
        ctx.chat.id,
        sent.message_id,
        statusMsg.replace(
          "🔄 در حال تست اتصال به YouTube...",
          isBotCheck
            ? "❌ <b>کوکی نامعتبر یا منقضی است!</b>\n\nکوکی جدید از مرورگر بگیرید و مجدداً بفرستید."
            : `⚠️ <b>تست ناموفق:</b>\n<code>${errMsg}</code>`,
        ),
        { parse_mode: "HTML" },
      );
    }
  });

  // /setcookies youtube <محتوای کوکی>  — ذخیره کوکی YouTube در فایل
  // /setcookies instagram <محتوای کوکی> — ذخیره کوکی Instagram در فایل
  bot.command("setcookies", adminOnly, async (ctx) => {
    const text = ctx.message?.text?.replace(/^\/setcookies\s*/, "").trim() ?? "";
    const [platform, ...rest] = text.split(/\s+/);
    const cookieContent = rest.join("\n").trim();

    if (!platform || !["youtube", "instagram"].includes(platform)) {
      await ctx.reply(
        "🍪 <b>تنظیم کوکی</b>\n\n" +
        "استفاده:\n" +
        "<code>/setcookies youtube [محتوای cookies.txt]</code>\n" +
        "<code>/setcookies instagram [محتوای cookies.txt]</code>\n\n" +
        "یا فایل cookies.txt را به‌صورت <b>document</b> با caption زیر ارسال کنید:\n" +
        "<code>setcookies youtube</code>\n" +
        "<code>setcookies instagram</code>",
        { parse_mode: "HTML" },
      );
      return;
    }

    if (!cookieContent) {
      await ctx.reply(
        `⚠️ محتوای کوکی خالی است.\n\nفایل cookies.txt را به‌عنوان document با caption:\n<code>setcookies ${platform}</code>\nارسال کنید.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    try {
      mkdirSync(config.downloadDir, { recursive: true });
      const fileName = platform === "youtube" ? ".youtube-cookies.txt" : ".instagram-cookies.txt";
      const filePath = join(config.downloadDir, fileName);
      let contents = cookieContent;
      if (!contents.startsWith("# Netscape HTTP Cookie File") && !contents.startsWith("# HTTP Cookie File")) {
        contents = `# Netscape HTTP Cookie File\n${contents}`;
      }
      writeFileSync(filePath, contents.endsWith("\n") ? contents : `${contents}\n`, { mode: 0o600 });
      logger.info({ platform, filePath }, "Cookies updated via bot command");
      await ctx.reply(
        `✅ <b>کوکی ${platform} با موفقیت ذخیره شد!</b>\n\nبات اکنون از این کوکی برای دانلود استفاده می‌کند.`,
        { parse_mode: "HTML" },
      );
    } catch (err: any) {
      logger.error({ err }, "Failed to save cookies");
      await ctx.reply(`❌ خطا در ذخیره کوکی: ${err?.message}`, { parse_mode: "HTML" });
    }
  });

  // پشتیبانی از ارسال فایل کوکی به‌صورت document
  bot.on("message:document", adminOnly, async (ctx) => {
    const caption = ctx.message.caption?.trim() ?? "";
    const match = caption.match(/^setcookies\s+(youtube|instagram)$/i);
    if (!match) return;

    const platform = match[1].toLowerCase();
    const file = ctx.message.document;

    if (!file.file_name?.endsWith(".txt")) {
      await ctx.reply("⚠️ فقط فایل‌های .txt پذیرفته می‌شوند.", { parse_mode: "HTML" });
      return;
    }

    if (file.file_size && file.file_size > 200_000) {
      await ctx.reply("⚠️ فایل کوکی نباید بیشتر از ۲۰۰ کیلوبایت باشد.", { parse_mode: "HTML" });
      return;
    }

    try {
      const fileInfo = await ctx.api.getFile(file.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const contents = await res.text();

      mkdirSync(config.downloadDir, { recursive: true });
      const fileName = platform === "youtube" ? ".youtube-cookies.txt" : ".instagram-cookies.txt";
      const filePath = join(config.downloadDir, fileName);
      let finalContents = contents;
      if (!finalContents.startsWith("# Netscape HTTP Cookie File") && !finalContents.startsWith("# HTTP Cookie File")) {
        finalContents = `# Netscape HTTP Cookie File\n${finalContents}`;
      }
      writeFileSync(filePath, finalContents.endsWith("\n") ? finalContents : `${finalContents}\n`, { mode: 0o600 });
      logger.info({ platform, filePath }, "Cookies file uploaded via bot");
      await ctx.reply(
        `✅ <b>فایل کوکی ${platform} با موفقیت ذخیره شد!</b>\n\nبات اکنون از این کوکی برای دانلود استفاده می‌کند.`,
        { parse_mode: "HTML" },
      );
    } catch (err: any) {
      logger.error({ err }, "Failed to save cookie file");
      await ctx.reply(`❌ خطا: ${err?.message}`, { parse_mode: "HTML" });
    }
  });
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
