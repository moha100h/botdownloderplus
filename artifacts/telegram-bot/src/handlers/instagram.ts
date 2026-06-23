import { Bot, InputFile, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { downloadMedia } from "../utils/downloader.js";
import { deleteFile, getFileSizeMb } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";

export function registerInstagramHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^ig:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, format, encodedUrl] = ctx.match;
    const url = Buffer.from(encodedUrl, "base64url").toString("utf8");

    const isVideo = format === "video";
    const label = isVideo ? "📹 ویدئو" : "🖼 عکس";

    const statusMsg = await ctx.editMessageText(
      `⬇️ <b>در حال دانلود از Instagram...</b>\n` +
      `نوع: ${label}\n\n` +
      `⏳ لطفاً صبر کنید...`,
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
          try {
            await ctx.editMessageText(
              `⬇️ <b>در حال دانلود از Instagram...</b>\n\n` +
              `${"▓".repeat(Math.floor(pct / 10))}${"░".repeat(10 - Math.floor(pct / 10))} ${pct}%`,
              { parse_mode: "HTML" },
            );
          } catch { /* ignore */ }
        },
      });

      const fileSizeMb = getFileSizeMb(result.filePath);
      if (fileSizeMb > config.maxFileSizeMb) {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b> (${fileSizeMb.toFixed(1)} MB)\n\n` +
          `محدودیت تلگرام: ${config.maxFileSizeMb} MB`,
          { parse_mode: "HTML" },
        );
        deleteFile(result.filePath);
        return;
      }

      await ctx.editMessageText(`📤 <b>در حال ارسال...</b>`, { parse_mode: "HTML" });

      const file = new InputFile(createReadStream(result.filePath), basename(result.filePath));

      if (isVideo) {
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
        `❌ <b>خطا در دانلود از Instagram</b>\n\n` +
        `ممکن است پست خصوصی باشد یا لینک منقضی شده باشد.`,
        { parse_mode: "HTML" },
      );
    }
  });
}

export function buildInstagramKeyboard(url: string): InlineKeyboard {
  const encoded = Buffer.from(url).toString("base64url");
  return new InlineKeyboard()
    .text("📹 دانلود ویدئو", `ig:video:${encoded}`)
    .text("🖼 دانلود عکس", `ig:photo:${encoded}`);
}
