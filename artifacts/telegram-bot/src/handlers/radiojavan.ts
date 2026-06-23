import { Bot, InputFile, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { downloadRadioJavan } from "../utils/radiojavan.js";
import { scheduleFileDeletion } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";
import { isRadioJavanVideo, isRjAppLink } from "../utils/platform.js";
import { storeUrl, getUrl } from "../utils/urlCache.js";
import { createCancelJob, endCancelJob, cancelKeyboard, isCancelledError } from "../utils/cancellation.js";

export function registerRadioJavanHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^rj:(mp3|video):([0-9a-f]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, format, id] = ctx.match;
    const rawUrl = getUrl(id);

    if (!rawUrl) {
      await ctx.editMessageText("⌛ این لینک منقضی شده. لطفاً دوباره لینک را ارسال کنید.", { parse_mode: "HTML" });
      return;
    }

    const label = format === "mp3" ? "🎵 MP3" : "📹 ویدئو";
    const { jobId, signal } = createCancelJob();
    const kb = cancelKeyboard(jobId);

    try {
      await ctx.editMessageText(
        `📻 <b>Radio Javan — در حال دانلود</b>\nفرمت: ${label}\n\n⏳ لطفاً صبر کنید...`,
        { parse_mode: "HTML", reply_markup: kb },
      );

      const result = await downloadRadioJavan(rawUrl, format as "mp3" | "video", signal);

      if (result.fileSizeMb > config.maxFileSizeMb) {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b> (${result.fileSizeMb.toFixed(1)} MB)\nحداکثر: ${config.maxFileSizeMb} MB`,
          { parse_mode: "HTML" },
        );
        scheduleFileDeletion(result.filePath, 5_000);
        return;
      }

      await ctx.editMessageText(`📤 <b>در حال ارسال...</b>`, { parse_mode: "HTML" });
      const file = new InputFile(createReadStream(result.filePath), basename(result.filePath));

      if (result.type === "video") {
        await ctx.replyWithVideo(file, {
          caption: `🎬 <b>${result.title}</b>\n\nدانلود شده از Radio Javan 📻`,
          parse_mode: "HTML",
        });
      } else {
        await ctx.replyWithAudio(file, {
          title: result.title,
          caption: `🎵 <b>${result.title}</b>\n\nدانلود شده از Radio Javan 📻`,
          parse_mode: "HTML",
        });
      }

      await ctx.editMessageText(`✅ <b>دانلود کامل شد!</b>`, { parse_mode: "HTML" });
      scheduleFileDeletion(result.filePath, 120_000);
      logger.info({ rawUrl, format, fileSizeMb: result.fileSizeMb }, "RadioJavan download sent");
    } catch (err: any) {
      if (isCancelledError(err)) {
        await ctx.editMessageText(`🛑 <b>دانلود لغو شد.</b>`, { parse_mode: "HTML" });
      } else {
        logger.error({ err, rawUrl }, "RadioJavan download failed");
        await ctx.editMessageText(
          `❌ <b>خطا در دانلود از Radio Javan</b>\n\n${err?.message ?? "خطای ناشناخته"}\n\nلطفاً لینک را بررسی کنید.`,
          { parse_mode: "HTML" },
        );
      }
    } finally {
      endCancelJob(jobId);
    }
  });
}

export function buildRadioJavanKeyboard(url: string): InlineKeyboard {
  const id = storeUrl(url);
  // rj.app short links and video links could be either — show both buttons.
  if (isRjAppLink(url) || isRadioJavanVideo(url)) {
    return new InlineKeyboard()
      .text("🎵 دانلود MP3", `rj:mp3:${id}`)
      .text("📹 دانلود ویدئو", `rj:video:${id}`);
  }
  return new InlineKeyboard().text("🎵 دانلود MP3", `rj:mp3:${id}`);
}
