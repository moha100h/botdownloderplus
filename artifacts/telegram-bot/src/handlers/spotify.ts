import { Bot, InputFile, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";
import { downloadSpotifyTrack, downloadSpotifyPlaylist } from "../utils/downloader.js";
import { scheduleFileDeletion, getFileSizeMb } from "../utils/fileUtils.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { createReadStream } from "fs";
import { basename } from "path";
import { storeUrl, getUrl } from "../utils/urlCache.js";
import { isSpotifyPlaylist } from "../utils/platform.js";
import { createCancelJob, endCancelJob, cancelKeyboard, isCancelledError } from "../utils/cancellation.js";

export function registerSpotifyHandler(bot: Bot<BotContext>): void {
  // Single track download
  bot.callbackQuery(/^sp:([0-9a-f]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, id] = ctx.match;
    const url = getUrl(id);

    if (!url) {
      await ctx.editMessageText("⌛ این لینک منقضی شده. لطفاً دوباره لینک را ارسال کنید.", { parse_mode: "HTML" });
      return;
    }

    const { jobId, signal } = createCancelJob();
    const kb = cancelKeyboard(jobId);

    let lastUpdateTime = Date.now();
    let downloadedPath: string | null = null;

    try {
      await ctx.editMessageText(
        `🟢 <b>Spotify</b>\n\n🔍 در حال دریافت اطلاعات آهنگ...`,
        { parse_mode: "HTML", reply_markup: kb },
      );

      const result = await downloadSpotifyTrack(url, {
        signal,
        onStatus: async (msg) => {
          try { await ctx.editMessageText(`🟢 <b>Spotify</b>\n\n${msg}`, { parse_mode: "HTML", reply_markup: kb }); } catch { }
        },
        onProgress: async (pct) => {
          const now = Date.now();
          if (now - lastUpdateTime < 3000) return;
          lastUpdateTime = now;
          const filled = Math.floor(pct / 10);
          try {
            await ctx.editMessageText(
              `🟢 <b>Spotify — در حال دانلود...</b>\n\n${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`,
              { parse_mode: "HTML", reply_markup: kb },
            );
          } catch { }
        },
      });
      downloadedPath = result.filePath;

      if (result.fileSizeMb > config.maxFileSizeMb) {
        await ctx.editMessageText(
          `⚠️ <b>فایل بیش از حد بزرگ است</b> (${result.fileSizeMb.toFixed(1)} MB)`,
          { parse_mode: "HTML" },
        );
        return;
      }

      await ctx.editMessageText(`📤 <b>در حال ارسال...</b>`, { parse_mode: "HTML" });
      const file = new InputFile(createReadStream(result.filePath), basename(result.filePath));
      await ctx.replyWithAudio(file, {
        title: result.title,
        caption: `🎵 <b>${result.title}</b>\n\nدانلود شده از Spotify 🟢`,
        parse_mode: "HTML",
      });

      await ctx.editMessageText(`✅ <b>دانلود کامل شد!</b>`, { parse_mode: "HTML" });
      logger.info({ url, fileSizeMb: result.fileSizeMb }, "Spotify track sent");
    } catch (err: any) {
      if (isCancelledError(err)) {
        await ctx.editMessageText(`🛑 <b>دانلود لغو شد.</b>`, { parse_mode: "HTML" });
      } else {
        logger.error({ err, url }, "Spotify download failed");
        const rawMsg: string = err?.message ?? "";
        const isBotCheck = /Sign in to confirm|cookies|bot detection/i.test(rawMsg);
        const userMsg = isBotCheck
          ? "⚠️ YouTube برای دانلود Spotify کوکی لازم دارد.\n\nفایل <b>cookies.txt</b> را با caption <code>setcookies youtube</code> به بات بفرستید."
          : rawMsg.slice(0, 300) || "خطای ناشناخته";
        await ctx.editMessageText(
          `❌ <b>خطا در دانلود از Spotify</b>\n\n${userMsg}`,
          { parse_mode: "HTML" },
        );
      }
    } finally {
      endCancelJob(jobId);
      // Always queue cleanup of the downloaded file (auto-delete after 120s)
      if (downloadedPath) scheduleFileDeletion(downloadedPath, 120_000);
    }
  });

  // Playlist download
  bot.callbackQuery(/^sppl:([0-9a-f]{8})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const [, id] = ctx.match;
    const url = getUrl(id);

    if (!url) {
      await ctx.editMessageText("⌛ این لینک منقضی شده. لطفاً دوباره لینک را ارسال کنید.", { parse_mode: "HTML" });
      return;
    }

    const { jobId, signal } = createCancelJob();
    const kb = cancelKeyboard(jobId);

    let sentCount = 0;

    try {
      await ctx.editMessageText(
        `📋 <b>دانلود پلی‌لیست Spotify</b>\n\n🔍 در حال پردازش...`,
        { parse_mode: "HTML", reply_markup: kb },
      );

      await downloadSpotifyPlaylist(url, {
        signal,
        onStatus: async (msg) => {
          try { await ctx.editMessageText(`📋 <b>پلی‌لیست Spotify</b>\n\n${msg}`, { parse_mode: "HTML", reply_markup: kb }); } catch { }
        },
        onTrackDone: async (result, index, total) => {
          if (result.fileSizeMb > config.maxFileSizeMb) {
            scheduleFileDeletion(result.filePath, 5_000);
            return;
          }
          try {
            await ctx.editMessageText(
              `📋 <b>پلی‌لیست Spotify</b>\n\n📤 ارسال آهنگ ${index} از ${total}...`,
              { parse_mode: "HTML", reply_markup: kb },
            );
            const file = new InputFile(createReadStream(result.filePath), basename(result.filePath));
            await ctx.replyWithAudio(file, {
              title: result.title,
              caption: `🎵 <b>${result.title}</b> (${index}/${total})\n🟢 Spotify Playlist`,
              parse_mode: "HTML",
            });
            sentCount++;
          } catch (sendErr) {
            logger.warn({ sendErr, index }, "Failed to send playlist track");
          }
          scheduleFileDeletion(result.filePath, 120_000);
        },
      });

      if (signal.aborted) {
        await ctx.editMessageText(
          `🛑 <b>پلی‌لیست لغو شد.</b>\n\n${sentCount} آهنگ ارسال شده بود.`,
          { parse_mode: "HTML" },
        );
      } else {
        await ctx.editMessageText(
          `✅ <b>پلی‌لیست کامل شد!</b>\n\n${sentCount} آهنگ با موفقیت ارسال شد.`,
          { parse_mode: "HTML" },
        );
      }
    } catch (err: any) {
      if (isCancelledError(err)) {
        await ctx.editMessageText(
          `🛑 <b>پلی‌لیست لغو شد.</b>\n\n${sentCount} آهنگ ارسال شده بود.`,
          { parse_mode: "HTML" },
        );
      } else {
        logger.error({ err, url }, "Spotify playlist download failed");
        await ctx.editMessageText(
          `❌ <b>خطا در دانلود پلی‌لیست</b>\n\n${err?.message ?? "خطای ناشناخته"}\n\nلطفاً مجدداً تلاش کنید.`,
          { parse_mode: "HTML" },
        );
      }
    } finally {
      endCancelJob(jobId);
    }
  });
}

export function buildSpotifyKeyboard(url: string): InlineKeyboard {
  const id = storeUrl(url);
  if (isSpotifyPlaylist(url)) {
    return new InlineKeyboard()
      .text("🎵 دانلود یک آهنگ (ترک اول)", `sp:${id}`)
      .row()
      .text("📋 دانلود کل پلی‌لیست", `sppl:${id}`);
  }
  return new InlineKeyboard().text("🎵 دانلود MP3", `sp:${id}`);
}
