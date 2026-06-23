import { Bot, InputFile, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { downloadMedia, resolveRjUrl } from "../utils/downloader.js";
import { scheduleFileDeletion, getFileSizeMb } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";
import { isRadioJavanVideo, isRjAppLink } from "../utils/platform.js";
import { storeUrl, getUrl } from "../utils/urlCache.js";

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

    await ctx.editMessageText(
      `📻 <b>Radio Javan — در حال پردازش</b>\nفرمت: ${label}\n\n🔗 در حال بررسی لینک...`,
      { parse_mode: "HTML" },
    );

    // Resolve rj.app short links → full radiojavan.com URL
    let url: string;
    try {
      url = await resolveRjUrl(rawUrl);
      logger.info({ rawUrl, url }, "RJ URL resolved");
    } catch (err) {
      logger.warn({ err, rawUrl }, "Could not resolve RJ URL, using raw");
      url = rawUrl;
    }

    await ctx.editMessageText(
      `📻 <b>Radio Javan — در حال دانلود</b>\nفرمت: ${label}\n\n⏳ لطفاً صبر کنید...`,
      { parse_mode: "HTML" },
    );

    let lastUpdateTime = Date.now();

    try {
      const result = await downloadMedia({
        url,
        format: format === "mp3" ? "mp3" : "best",
        maxFileSizeMb: config.maxFileSizeMb,
        onProgress: async (pct) => {
          const now = Date.now();
          if (now - lastUpdateTime < 3000) return;
          lastUpdateTime = now;
          const filled = Math.floor(pct / 10);
          try {
            await ctx.editMessageText(
              `📻 <b>Radio Javan — در حال دانلود</b>\nفرمت: ${label}\n\n${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`,
              { parse_mode: "HTML" },
            );
          } catch { }
        },
      });

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
      scheduleFileDeletion(result.filePath, 120_000);
      logger.info({ url, format, fileSizeMb: result.fileSizeMb }, "RadioJavan download sent");
    } catch (err: any) {
      logger.error({ err, url, rawUrl }, "RadioJavan download failed");
      await ctx.editMessageText(
        `❌ <b>خطا در دانلود از Radio Javan</b>\n\n${err?.message ?? "خطای ناشناخته"}\n\nلطفاً لینک را بررسی کنید.`,
        { parse_mode: "HTML" },
      );
    }
  });
}

export function buildRadioJavanKeyboard(url: string): InlineKeyboard {
  const id = storeUrl(url);
  // For rj.app or video links, show both; for mp3-only links just show MP3
  if (isRjAppLink(url) || isRadioJavanVideo(url)) {
    return new InlineKeyboard()
      .text("🎵 دانلود MP3", `rj:mp3:${id}`)
      .text("📹 دانلود ویدئو", `rj:video:${id}`);
  }
  return new InlineKeyboard().text("🎵 دانلود MP3", `rj:mp3:${id}`);
}
