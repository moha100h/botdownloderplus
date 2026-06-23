import { Bot, InlineKeyboard, InputFile } from "grammy";
import { BotContext } from "../bot.js";
import { downloadMedia } from "../utils/downloader.js";
import { deleteFile, getFileSizeMb } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";
import { storeUrl, getUrl } from "../utils/urlCache.js";

const FORMAT_LABEL: Record<string, string> = {
  mp3: "🎵 MP3",
  mp4_360: "📹 360p",
  mp4_720: "📹 720p",
  mp4_1080: "📹 1080p",
};

export function registerYouTubeHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^yt:(mp3|mp4_360|mp4_720|mp4_1080):([0-9a-f]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, format, id] = ctx.match;
    const url = getUrl(id);

    if (!url) {
      await ctx.editMessageText("⌛ این لینک منقضی شده است. لطفاً دوباره لینک را ارسال کنید.", { parse_mode: "HTML" });
      return;
    }

    const label = FORMAT_LABEL[format] ?? format;

    await ctx.editMessageText(
      `⬇️ <b>در حال دانلود از YouTube...</b>\nفرمت: ${label}\n\n⏳ لطفاً صبر کنید...`,
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
          const filled = Math.floor(pct / 10);
          try {
            await ctx.editMessageText(
              `⬇️ <b>در حال دانلود از YouTube...</b>\nفرمت: ${label}\n\n` +
              `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`,
              { parse_mode: "HTML" },
            );
          } catch { }
        },
      });

      const fileSizeMb = getFileSizeMb(result.filePath);
      if (fileSizeMb > config.maxFileSizeMb) {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b>\nحجم: ${fileSizeMb.toFixed(1)} MB (حداکثر: ${config.maxFileSizeMb} MB)\n\nلطفاً کیفیت پایین‌تری انتخاب کنید.`,
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
          caption: `🎵 <b>${result.title}</b>\n\nدانلود شده از YouTube ▶️`,
          parse_mode: "HTML",
        });
      } else {
        await ctx.replyWithVideo(file, {
          caption: `🎬 <b>${result.title}</b>\n\nدانلود شده از YouTube ▶️`,
          parse_mode: "HTML",
        });
      }

      await ctx.editMessageText(`✅ <b>دانلود کامل شد!</b>`, { parse_mode: "HTML" });
      deleteFile(result.filePath);
      logger.info({ url, format, fileSizeMb }, "YouTube download sent");
    } catch (err) {
      logger.error({ err, url, format }, "YouTube download failed");
      await ctx.editMessageText(
        `❌ <b>خطا در دانلود</b>\n\nممکن است لینک معتبر نباشد یا ویدئو محدودیت داشته باشد.\nلطفاً مجدداً تلاش کنید.`,
        { parse_mode: "HTML" },
      );
    }
  });
}

export function buildYouTubeKeyboard(url: string): InlineKeyboard {
  const id = storeUrl(url);
  return new InlineKeyboard()
    .text("🎵 MP3 (بهترین کیفیت)", `yt:mp3:${id}`)
    .row()
    .text("📹 360p", `yt:mp4_360:${id}`)
    .text("📹 720p", `yt:mp4_720:${id}`)
    .text("📹 1080p", `yt:mp4_1080:${id}`);
}
