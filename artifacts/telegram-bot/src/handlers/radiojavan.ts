import { Bot, InputFile, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { downloadMedia } from "../utils/downloader.js";
import { deleteFile, getFileSizeMb } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";
import { isRadioJavanVideo } from "../utils/platform.js";
import { storeUrl, getUrl } from "../utils/urlCache.js";

export function registerRadioJavanHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^rj:(mp3|video):([0-9a-f]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, format, id] = ctx.match;
    const url = getUrl(id);

    if (!url) {
      await ctx.editMessageText("⌛ این لینک منقضی شده است. لطفاً دوباره لینک را ارسال کنید.", { parse_mode: "HTML" });
      return;
    }

    const label = format === "mp3" ? "🎵 MP3" : "📹 ویدئو";

    await ctx.editMessageText(
      `⬇️ <b>در حال دانلود از Radio Javan...</b>\nفرمت: ${label}\n\n⏳ لطفاً صبر کنید...`,
      { parse_mode: "HTML" },
    );

    let lastUpdateTime = Date.now();

    try {
      const result = await downloadMedia({
        url,
        format: format === "mp3" ? "mp3" : "best",
        onProgress: async (pct) => {
          const now = Date.now();
          if (now - lastUpdateTime < 3000) return;
          lastUpdateTime = now;
          const filled = Math.floor(pct / 10);
          try {
            await ctx.editMessageText(
              `⬇️ <b>در حال دانلود از Radio Javan...</b>\n\n` +
              `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`,
              { parse_mode: "HTML" },
            );
          } catch { }
        },
      });

      const fileSizeMb = getFileSizeMb(result.filePath);
      if (fileSizeMb > config.maxFileSizeMb) {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b> (${fileSizeMb.toFixed(1)} MB)`,
          { parse_mode: "HTML" },
        );
        deleteFile(result.filePath);
        return;
      }

      await ctx.editMessageText(`📤 <b>در حال ارسال...</b>`, { parse_mode: "HTML" });

      const file = new InputFile(createReadStream(result.filePath), basename(result.filePath));

      if (format === "mp3") {
        await ctx.replyWithAudio(file, {
          title: result.title,
          caption: `🎵 <b>${result.title}</b>\n\nدانلود شده از Radio Javan 📻`,
          parse_mode: "HTML",
        });
      } else {
        await ctx.replyWithVideo(file, {
          caption: `🎬 <b>${result.title}</b>\n\nدانلود شده از Radio Javan 📻`,
          parse_mode: "HTML",
        });
      }

      await ctx.editMessageText(`✅ <b>دانلود کامل شد!</b>`, { parse_mode: "HTML" });
      deleteFile(result.filePath);
      logger.info({ url, format, fileSizeMb }, "RadioJavan download sent");
    } catch (err) {
      logger.error({ err, url }, "RadioJavan download failed");
      await ctx.editMessageText(
        `❌ <b>خطا در دانلود از Radio Javan</b>\n\nلطفاً لینک را بررسی کنید و مجدداً تلاش نمایید.`,
        { parse_mode: "HTML" },
      );
    }
  });
}

export function buildRadioJavanKeyboard(url: string): InlineKeyboard {
  const id = storeUrl(url);
  const keyboard = new InlineKeyboard().text("🎵 دانلود MP3", `rj:mp3:${id}`);
  if (isRadioJavanVideo(url)) {
    keyboard.text("📹 دانلود ویدئو", `rj:video:${id}`);
  }
  return keyboard;
}
