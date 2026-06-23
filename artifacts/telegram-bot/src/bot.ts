import { Bot, Context, session, SessionFlavor } from "grammy";
import { config } from "./config.js";
import { rateLimiter } from "./middlewares/rateLimiter.js";
import { registerStartCommand } from "./commands/start.js";
import { registerHelpCommand } from "./commands/help.js";
import { registerAdminCommands } from "./commands/admin.js";
import { registerLinkDetector } from "./handlers/linkDetector.js";
import { registerYouTubeHandler } from "./handlers/youtube.js";
import { registerSpotifyHandler } from "./handlers/spotify.js";
import { registerInstagramHandler } from "./handlers/instagram.js";
import { registerRadioJavanHandler } from "./handlers/radiojavan.js";
import { logger } from "./utils/logger.js";
import { MAIN_KEYBOARD } from "./keyboard.js";

interface SessionData {
  pendingUrl?: string;
  platform?: string;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken, {
    client: config.useLocalBotApi
      ? { apiRoot: config.botApiServerUrl }
      : undefined,
  });

  bot.use(
    session<SessionData, BotContext>({
      initial: () => ({}),
    }),
  );

  bot.use(rateLimiter);

  registerAdminCommands(bot);
  registerStartCommand(bot);
  registerHelpCommand(bot);

  registerYouTubeHandler(bot);
  registerSpotifyHandler(bot);
  registerInstagramHandler(bot);
  registerRadioJavanHandler(bot);

  registerLinkDetector(bot);

  // Handle keyboard button presses
  bot.hears("📖 راهنما", async (ctx) => {
    await ctx.reply(
      `📖 <b>راهنمای ربات دانلودر</b>\n\n` +
      `<b>روش استفاده:</b>\n` +
      `۱. لینک مورد نظر را کپی کنید\n` +
      `۲. در این چت ارسال کنید\n` +
      `۳. فرمت دلخواه را از دکمه‌ها انتخاب کنید\n` +
      `۴. منتظر دانلود باشید ✅\n\n` +
      `<b>⚠️ محدودیت‌ها:</b>\n` +
      `• حداکثر حجم فایل: ۵۰ مگابایت\n` +
      `• حداکثر ۵ درخواست در دقیقه\n` +
      `• پست‌های خصوصی اینستاگرام دانلود نمی‌شوند`,
      { parse_mode: "HTML", reply_markup: MAIN_KEYBOARD },
    );
  });

  bot.hears("ℹ️ درباره", async (ctx) => {
    await ctx.reply(
      `ℹ️ <b>درباره ربات دانلودر</b>\n\n` +
      `• Grammy Framework (Telegram Bot API)\n` +
      `• yt-dlp (موتور دانلود)\n` +
      `• Node.js 24 + TypeScript\n\n` +
      `<b>✨ ویژگی‌ها:</b>\n` +
      `• دانلود از ۴ پلتفرم\n` +
      `• نمایش progress bar حین دانلود\n` +
      `• auto-fallback کیفیت برای فایل‌های بزرگ\n` +
      `• پشتیبانی از پلی‌لیست Spotify`,
      { parse_mode: "HTML", reply_markup: MAIN_KEYBOARD },
    );
  });

  bot.hears("▶️ YouTube", async (ctx) => {
    await ctx.reply(
      `▶️ <b>YouTube</b>\n\nلینک‌های پشتیبانی شده:\n` +
      `• <code>https://youtube.com/watch?v=...</code>\n` +
      `• <code>https://youtu.be/...</code>\n` +
      `• <code>https://youtube.com/shorts/...</code>\n\n` +
      `فقط لینک را بفرستید ⬇️`,
      { parse_mode: "HTML", reply_markup: MAIN_KEYBOARD },
    );
  });

  bot.hears("🟢 Spotify", async (ctx) => {
    await ctx.reply(
      `🟢 <b>Spotify</b>\n\nلینک‌های پشتیبانی شده:\n` +
      `• <code>https://open.spotify.com/track/...</code>\n` +
      `• <code>https://open.spotify.com/playlist/...</code>\n\n` +
      `فقط لینک را بفرستید ⬇️`,
      { parse_mode: "HTML", reply_markup: MAIN_KEYBOARD },
    );
  });

  bot.hears("📸 Instagram", async (ctx) => {
    await ctx.reply(
      `📸 <b>Instagram</b>\n\nلینک‌های پشتیبانی شده:\n` +
      `• <code>https://instagram.com/p/...</code>\n` +
      `• <code>https://instagram.com/reel/...</code>\n\n` +
      `فقط لینک را بفرستید ⬇️`,
      { parse_mode: "HTML", reply_markup: MAIN_KEYBOARD },
    );
  });

  bot.hears("📻 Radio Javan", async (ctx) => {
    await ctx.reply(
      `📻 <b>Radio Javan</b>\n\nلینک‌های پشتیبانی شده:\n` +
      `• <code>https://radiojavan.com/mp3s/mp3/...</code>\n` +
      `• <code>https://radiojavan.com/videos/video/...</code>\n` +
      `• <code>https://rj.app/...</code>\n\n` +
      `فقط لینک را بفرستید ⬇️`,
      { parse_mode: "HTML", reply_markup: MAIN_KEYBOARD },
    );
  });

  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message?.text;
    if (text && !text.startsWith("/") && !text.includes("http")) {
      await ctx.reply(
        `❓ لینک معتبری دریافت نشد.\n\nلطفاً یک لینک از YouTube، Spotify، Instagram یا Radio Javan ارسال کنید.`,
        { parse_mode: "HTML", reply_markup: MAIN_KEYBOARD },
      );
    }
    return next();
  });

  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error(
      { err: err.error, updateId: ctx.update.update_id, userId: ctx.from?.id },
      "Unhandled bot error",
    );
  });

  return bot;
}

export async function setBotCommands(bot: Bot<BotContext>): Promise<void> {
  // Clear all command menus — we use keyboard buttons instead
  await bot.api.deleteMyCommands();
  try {
    await bot.api.deleteMyCommands({ scope: { type: "chat", chat_id: config.adminId } });
  } catch { }
  logger.info("Bot command menu cleared");
}
