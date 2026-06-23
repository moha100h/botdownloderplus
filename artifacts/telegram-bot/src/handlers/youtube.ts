import { Bot, InlineKeyboard, InputFile } from "grammy";
import { BotContext } from "../bot.js";
import { downloadMedia } from "../utils/downloader.js";
import { scheduleFileDeletion, getFileSizeMb } from "../utils/fileUtils.js";
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

const FORMAT_FALLBACK: Record<string, string | null> = {
  mp4_1080: "mp4_720",
  mp4_720:  "mp4_360",
  mp4_360:  "mp3",
  mp3:      null,
};

export function registerYouTubeHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery(/^yt:(mp3|mp4_360|mp4_720|mp4_1080):([0-9a-f]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, format, id] = ctx.match;
    const url = getUrl(id);

    if (!url) {
      await ctx.editMessageText("⌛ این لینک منقضی شده. لطفاً دوباره لینک را ارسال کنید.", { parse_mode: "HTML" });
      return;
    }

    await tryDownload(ctx, url, format, id);
  });
}

async function tryDownload(
  ctx: any,
  url: string,
  format: string,
  id: string,
  attempt = 1,
): Promise<void> {
  const label = FORMAT_LABEL[format] ?? format;

  await ctx.editMessageText(
    `▶️ <b>YouTube — در حال دانلود</b>\nفرمت: ${label}${attempt > 1 ? ` (تلاش ${attempt})` : ""}\n\n⏳ لطفاً صبر کنید...`,
    { parse_mode: "HTML" },
  );

  let lastUpdateTime = Date.now();
  let downloadedPath: string | null = null;

  try {
    const result = await downloadMedia({
      url,
      format: format as "mp3" | "mp4_360" | "mp4_720" | "mp4_1080",
      maxFileSizeMb: config.maxFileSizeMb,
      onProgress: async (pct) => {
        const now = Date.now();
        if (now - lastUpdateTime < 3000) return;
        lastUpdateTime = now;
        const filled = Math.floor(pct / 10);
        try {
          await ctx.editMessageText(
            `▶️ <b>YouTube — در حال دانلود</b>\nفرمت: ${label}\n\n${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`,
            { parse_mode: "HTML" },
          );
        } catch { }
      },
    });
    downloadedPath = result.filePath;

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
    logger.info({ url, format, fileSizeMb: result.fileSizeMb }, "YouTube download sent");
  } catch (err: any) {
    // File too large — auto-fallback to lower quality
    if (err?.code === "FILE_TOO_LARGE") {
      const fileSizeMb: number = err.fileSizeMb ?? 0;
      const filePath: string | undefined = err.filePath;
      if (filePath) scheduleFileDeletion(filePath, 5_000);

      const fallbackFormat = FORMAT_FALLBACK[format];
      if (fallbackFormat) {
        await ctx.editMessageText(
          `⚠️ <b>${label} خیلی بزرگ است</b> (${fileSizeMb.toFixed(1)} MB)\n\n🔄 در حال تلاش با ${FORMAT_LABEL[fallbackFormat]}...`,
          { parse_mode: "HTML" },
        );
        return tryDownload(ctx, url, fallbackFormat, id, attempt + 1);
      } else {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b> (${fileSizeMb.toFixed(1)} MB)\n\nحتی MP3 هم از حد مجاز بیشتر است.`,
          { parse_mode: "HTML" },
        );
        return;
      }
    }

    logger.error({ err, url, format }, "YouTube download failed");

    const qualityKeyboard = new InlineKeyboard()
      .text("🎵 MP3", `yt:mp3:${id}`)
      .row()
      .text("📹 360p", `yt:mp4_360:${id}`)
      .text("📹 720p", `yt:mp4_720:${id}`);

    await ctx.editMessageText(
      `❌ <b>خطا در دانلود</b>\n\n${err?.message ?? "خطای ناشناخته"}\n\nکیفیت دیگری انتخاب کنید:`,
      { parse_mode: "HTML", reply_markup: qualityKeyboard },
    );
  } finally {
    // Always queue cleanup of the sent/downloaded file (auto-delete after 120s)
    if (downloadedPath) scheduleFileDeletion(downloadedPath, 120_000);
  }
}

export function buildYouTubeKeyboard(url: string): InlineKeyboard {
  const id = storeUrl(url);
  return new InlineKeyboard()
    .text("🎵 MP3 (صوت)", `yt:mp3:${id}`)
    .row()
    .text("📹 360p", `yt:mp4_360:${id}`)
    .text("📹 720p", `yt:mp4_720:${id}`)
    .text("📹 1080p", `yt:mp4_1080:${id}`);
}
