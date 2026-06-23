import { Bot, InputFile, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { downloadMedia } from "../utils/downloader.js";
import { deleteFile, getFileSizeMb } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";

export function registerSpotifyHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^sp:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, encodedUrl] = ctx.match;
    const url = Buffer.from(encodedUrl, "base64url").toString("utf8");

    const statusMsg = await ctx.editMessageText(
      `⬇️ <b>در حال دانلود از Spotify...</b>\n\n` +
      `⏳ لطفاً صبر کنید...`,
      { parse_mode: "HTML" },
    );

    let lastUpdateTime = Date.now();

    try {
      const result = await downloadMedia({
        url,
        format: "mp3",
        onProgress: async (pct) => {
          const now = Date.now();
          if (now - lastUpdateTime < 3000) return;
          lastUpdateTime = now;
          try {
            await ctx.editMessageText(
              `⬇️ <b>در حال دانلود از Spotify...</b>\n\n` +
              `${"▓".repeat(Math.floor(pct / 10))}${"░".repeat(10 - Math.floor(pct / 10))} ${pct}%`,
              { parse_mode: "HTML" },
            );
          } catch { /* ignore */ }
        },
      });

      const fileSizeMb = getFileSizeMb(result.filePath);
      if (fileSizeMb > config.maxFileSizeMb) {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b>\n` +
          `حجم: ${fileSizeMb.toFixed(1)} MB\n\n` +
          `برای پلی‌لیست‌ها لطفاً لینک تک آهنگ ارسال کنید.`,
          { parse_mode: "HTML" },
        );
        deleteFile(result.filePath);
        return;
      }

      await ctx.editMessageText(`📤 <b>در حال ارسال...</b>`, { parse_mode: "HTML" });

      const file = new InputFile(createReadStream(result.filePath), basename(result.filePath));
      await ctx.replyWithAudio(file, {
        title: result.title,
        caption: `🎵 <b>${result.title}</b>\n\nدانلود شده از Spotify`,
        parse_mode: "HTML",
      });

      await ctx.editMessageText(`✅ <b>دانلود کامل شد!</b>`, { parse_mode: "HTML" });
      deleteFile(result.filePath);
      logger.info({ url, fileSizeMb }, "Spotify download sent");
    } catch (err) {
      logger.error({ err, url }, "Spotify download failed");
      await ctx.editMessageText(
        `❌ <b>خطا در دانلود از Spotify</b>\n\n` +
        `لطفاً لینک تک آهنگ (track) ارسال کنید.\n` +
        `پلی‌لیست‌ها باید یک به یک دانلود شوند.`,
        { parse_mode: "HTML" },
      );
    }
  });
}

export function buildSpotifyKeyboard(url: string): InlineKeyboard {
  const encoded = Buffer.from(url).toString("base64url");
  return new InlineKeyboard().text("🎵 دانلود MP3", `sp:${encoded}`);
}
