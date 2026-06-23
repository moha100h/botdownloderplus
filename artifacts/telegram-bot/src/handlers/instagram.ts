import { Bot, InputFile, InlineKeyboard, InputMediaBuilder } from "grammy";
import type { InputMediaPhoto, InputMediaVideo } from "grammy/types";
import { BotContext } from "../bot.js";
import { downloadInstagram, hasInstagramCookies, InstagramAuthError, type IgMediaItem } from "../utils/downloader.js";
import { scheduleFileDeletion } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";
import { storeUrl, getUrl } from "../utils/urlCache.js";
import { createCancelJob, endCancelJob, cancelKeyboard, isCancelledError } from "../utils/cancellation.js";

export function registerInstagramHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^ig:dl:([0-9a-f]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, id] = ctx.match;
    const url = getUrl(id);

    if (!url) {
      await ctx.editMessageText("⌛ این لینک منقضی شده است. لطفاً دوباره لینک را ارسال کنید.", { parse_mode: "HTML" });
      return;
    }

    const { jobId, signal } = createCancelJob();
    const kb = cancelKeyboard(jobId);

    let lastUpdateTime = Date.now();
    let downloadedItems: IgMediaItem[] = [];

    try {
      await ctx.editMessageText(
        `⬇️ <b>در حال دانلود از Instagram...</b>\n\n⏳ لطفاً صبر کنید...`,
        { parse_mode: "HTML", reply_markup: kb },
      );

      const { items, title } = await downloadInstagram({
        url,
        signal,
        onProgress: async (pct) => {
          const now = Date.now();
          if (now - lastUpdateTime < 3000) return;
          lastUpdateTime = now;
          const filled = Math.floor(pct / 10);
          try {
            await ctx.editMessageText(
              `⬇️ <b>در حال دانلود از Instagram...</b>\n\n` +
              `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`,
              { parse_mode: "HTML", reply_markup: kb },
            );
          } catch { }
        },
      });
      downloadedItems = items;

      // Keep only items within the size limit; warn if some are skipped.
      const sendable = items.filter((it) => it.fileSizeMb <= config.maxFileSizeMb);
      const skipped = items.length - sendable.length;

      if (sendable.length === 0) {
        await ctx.editMessageText(
          `⚠️ <b>فایل‌ها بیش از حد بزرگ هستند</b>\nمحدودیت: ${config.maxFileSizeMb} MB`,
          { parse_mode: "HTML" },
        );
        return;
      }

      await ctx.editMessageText(
        `📤 <b>در حال ارسال ${sendable.length} فایل...</b>`,
        { parse_mode: "HTML" },
      );

      const caption = `📸 <b>Instagram</b>${title && title !== "Instagram" ? `\n\n${title}` : ""}`;

      let sentCount = 0;
      if (sendable.length === 1) {
        // Single item — send directly so the caption is attached.
        const it = sendable[0];
        const file = new InputFile(createReadStream(it.filePath), basename(it.filePath));
        if (it.type === "video") {
          await ctx.replyWithVideo(file, { caption, parse_mode: "HTML" });
        } else {
          await ctx.replyWithPhoto(file, { caption, parse_mode: "HTML" });
        }
        sentCount = 1;
      } else {
        // Carousel — send as media groups (albums) of up to 10 items each.
        for (let i = 0; i < sendable.length; i += 10) {
          if (signal.aborted) break;
          const chunk = sendable.slice(i, i + 10);
          const media: (InputMediaPhoto | InputMediaVideo)[] = chunk.map((it, idx) => {
            const file = new InputFile(createReadStream(it.filePath), basename(it.filePath));
            // Caption only on the first item of the first group.
            const cap = i === 0 && idx === 0 ? caption : undefined;
            return it.type === "video"
              ? InputMediaBuilder.video(file, cap ? { caption: cap, parse_mode: "HTML" } : undefined)
              : InputMediaBuilder.photo(file, cap ? { caption: cap, parse_mode: "HTML" } : undefined);
          });
          await ctx.replyWithMediaGroup(media);
          sentCount += chunk.length;
        }
      }

      if (signal.aborted) {
        await ctx.editMessageText(
          `🛑 <b>دانلود لغو شد.</b>${sentCount > 0 ? `\n${sentCount} فایل قبل از لغو ارسال شد.` : ""}`,
          { parse_mode: "HTML" },
        );
        logger.info({ url, sentCount }, "Instagram send cancelled mid-flight");
        return;
      }

      const doneMsg = skipped > 0
        ? `✅ <b>دانلود کامل شد!</b>\n${sentCount} فایل ارسال شد (${skipped} فایل به دلیل حجم زیاد ارسال نشد).`
        : `✅ <b>دانلود کامل شد!</b>\n${sentCount} فایل ارسال شد.`;
      await ctx.editMessageText(doneMsg, { parse_mode: "HTML" });
      logger.info({ url, count: sentCount, skipped }, "Instagram download sent");
    } catch (err) {
      if (isCancelledError(err)) {
        await ctx.editMessageText(`🛑 <b>دانلود لغو شد.</b>`, { parse_mode: "HTML" });
      } else if (err instanceof InstagramAuthError || (err as { code?: string })?.code === "IG_AUTH") {
        await ctx.editMessageText(
          hasInstagramCookies()
            ? `❌ <b>دانلود از Instagram ناموفق بود</b>\n\nاحتمالاً کوکی ورود منقضی شده است. لطفاً به ادمین اطلاع دهید تا کوکی را به‌روزرسانی کند.`
            : `❌ <b>دانلود از Instagram نیاز به ورود دارد</b>\n\nاینستاگرام درخواست‌های بدون ورود را مسدود می‌کند. ادمین باید کوکی ورود (INSTAGRAM_COOKIES) را تنظیم کند.`,
          { parse_mode: "HTML" },
        );
      } else {
        logger.error({ err, url }, "Instagram download failed");
        await ctx.editMessageText(
          `❌ <b>خطا در دانلود از Instagram</b>\n\nممکن است پست خصوصی باشد یا لینک منقضی شده باشد.`,
          { parse_mode: "HTML" },
        );
      }
    } finally {
      endCancelJob(jobId);
      // Always queue cleanup of every downloaded file (auto-delete after 120s)
      for (const it of downloadedItems) scheduleFileDeletion(it.filePath, 120_000);
    }
  });
}

export function buildInstagramKeyboard(url: string): InlineKeyboard {
  const id = storeUrl(url);
  // One button downloads everything in the post/reel/story (handles carousels).
  return new InlineKeyboard().text("⬇️ دانلود", `ig:dl:${id}`);
}
