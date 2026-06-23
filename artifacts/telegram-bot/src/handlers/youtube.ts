import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { downloadMedia } from "../utils/downloader.js";
import { deleteFile, getFileSizeMb } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";
import { InputFile } from "grammy";

export function registerYouTubeHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^yt:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, format, encodedUrl] = ctx.match;
    const url = Buffer.from(encodedUrl, "base64url").toString("utf8");

    const formatLabel: Record<string, string> = {
      mp3: "🎵 MP3",
      mp4_360: "📹 360p",
      mp4_720: "📹 720p",
      mp4_1080: "📹 1080p",
    };

    const statusMsg = await ctx.editMessageText(
      `⬇️ <b>در حال دانلود...</b>\n` +
      `فرمت: ${formatLabel[format] ?? format}\n` +
      `<code>${url.slice(0, 60)}...</code>\n\n` +
      `⏳ لطفاً صبر کنید...`,
      { parse_mode: "HTML" },
    );

    let lastUpdateTime = Date.now();

    try {
      const result = await downloadMedia({
        url,
        format: format as "mp3" | "mp4_360" | "mp4_720" | "mp4_1080",
        onProgress: async (pct) => {
          const now = Date.now();
          if (now - lastUpdateTime < 3000) return;
          lastUpdateTime = now;
          try {
            await ctx.editMessageText(
              `⬇️ <b>در حال دانلود...</b>\n` +
              `فرمت: ${formatLabel[format] ?? format}\n\n` +
              `${"▓".repeat(Math.floor(pct / 10))}${"░".repeat(10 - Math.floor(pct / 10))} ${pct}%`,
              { parse_mode: "HTML" },
            );
          } catch { /* ignore edit errors */ }
        },
      });

      const fileSizeMb = getFileSizeMb(result.filePath);
      if (fileSizeMb > config.maxFileSizeMb) {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b>\n` +
          `حجم: ${fileSizeMb.toFixed(1)} MB (حداکثر مجاز: ${config.maxFileSizeMb} MB)\n\n` +
          `لطفاً کیفیت پایین‌تری انتخاب کنید.`,
          { parse_mode: "HTML" },
        );
        deleteFile(result.filePath);
        return;
      }

      await ctx.editMessageText(`📤 <b>در حال ارسال فایل...</b>`, { parse_mode: "HTML" });

      const file = new InputFile(createReadStream(result.filePath), basename(result.filePath));

      if (format === "mp3") {
        await ctx.replyWithAudio(file, {
          title: result.title,
          caption: `🎵 <b>${result.title}</b>\n\nدانلود شده از YouTube`,
          parse_mode: "HTML",
        });
      } else {
        await ctx.replyWithVideo(file, {
          caption: `🎬 <b>${result.title}</b>\n\nدانلود شده از YouTube`,
          parse_mode: "HTML",
        });
      }

      await ctx.editMessageText(`✅ <b>دانلود کامل شد!</b>`, { parse_mode: "HTML" });
      deleteFile(result.filePath);
      logger.info({ url, format, fileSizeMb }, "YouTube download sent");
    } catch (err) {
      logger.error({ err, url, format }, "YouTube download failed");
      await ctx.editMessageText(
        `❌ <b>خطا در دانلود</b>\n\n` +
        `ممکن است لینک معتبر نباشد یا ویدئو محدودیت داشته باشد.\n` +
        `لطفاً مجدداً تلاش کنید.`,
        { parse_mode: "HTML" },
      );
    }
  });
}

export function buildYouTubeKeyboard(url: string): InlineKeyboard {
  const encoded = Buffer.from(url).toString("base64url");
  return new InlineKeyboard()
    .text("🎵 MP3 (بهترین کیفیت)", `yt:mp3:${encoded}`)
    .row()
    .text("📹 360p", `yt:mp4_360:${encoded}`)
    .text("📹 720p", `yt:mp4_720:${encoded}`)
    .text("📹 1080p", `yt:mp4_1080:${encoded}`);
}
