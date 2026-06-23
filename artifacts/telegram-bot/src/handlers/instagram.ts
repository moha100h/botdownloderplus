import { Bot, InputFile, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { downloadMedia } from "../utils/downloader.js";
import { deleteFile, getFileSizeMb } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";
import { storeUrl, getUrl } from "../utils/urlCache.js";

export function registerInstagramHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^ig:(video|photo):([0-9a-f]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, format, id] = ctx.match;
    const url = getUrl(id);

    if (!url) {
      await ctx.editMessageText("⌛ این لینک منقضی شده است. لطفاً دوباره لینک را ارسال کنید.", { parse_mode: "HTML" });
      return;
    }

    const label = format === "video" ? "📹 ویدئو" : "🖼 عکس";

    await ctx.editMessageText(
      `⬇️ <b>در حال دانلود از Instagram...</b>\nنوع: ${label}\n\n⏳ لطفاً صبر کنید...`,
      { parse_mode: "HTML" },
    );

    let lastUpdateTime = Date.now();

    try {
      const result = await downloadMedia({
        url,
        format: "best",
        onProgress: async (pct) => {
          const now = Date.now();
          if (now - lastUpdateTime < 3000) return;
          lastUpdateTime = now;
          const filled = Math.floor(pct / 10);
          try {
            await ctx.editMessageText(
              `⬇️ <b>در حال دانلود از Instagram...</b>\n\n` +
              `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`,
              { parse_mode: "HTML" },
            );
          } catch { }
        },
      });

      const fileSizeMb = getFileSizeMb(result.filePath);
      if (fileSizeMb > config.maxFileSizeMb) {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b> (${fileSizeMb.toFixed(1)} MB)\nمحدودیت: ${config.maxFileSizeMb} MB`,
          { parse_mode: "HTML" },
        );
        deleteFile(result.filePath);
        return;
      }

      await ctx.editMessageText(`📤 <b>در حال ارسال...</b>`, { parse_mode: "HTML" });

      const file = new InputFile(createReadStream(result.filePath), basename(result.filePath));

      if (format === "video") {
        await ctx.replyWithVideo(file, {
          caption: `📸 <b>Instagram</b>\n\n${result.title || ""}`,
          parse_mode: "HTML",
        });
      } else {
        await ctx.replyWithPhoto(file, {
          caption: `📸 <b>Instagram</b>\n\n${result.title || ""}`,
          parse_mode: "HTML",
        });
      }

      await ctx.editMessageText(`✅ <b>دانلود کامل شد!</b>`, { parse_mode: "HTML" });
      deleteFile(result.filePath);
      logger.info({ url, format, fileSizeMb }, "Instagram download sent");
    } catch (err) {
      logger.error({ err, url }, "Instagram download failed");
      await ctx.editMessageText(
        `❌ <b>خطا در دانلود از Instagram</b>\n\nممکن است پست خصوصی باشد یا لینک منقضی شده باشد.`,
        { parse_mode: "HTML" },
      );
    }
  });
}

export function buildInstagramKeyboard(url: string): InlineKeyboard {
  const id = storeUrl(url);
  return new InlineKeyboard()
    .text("📹 دانلود ویدئو", `ig:video:${id}`)
    .text("🖼 دانلود عکس", `ig:photo:${id}`);
}
