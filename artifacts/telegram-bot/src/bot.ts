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

interface SessionData {
  pendingUrl?: string;
  platform?: string;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

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

  bot.on("message", async (ctx, next) => {
    const text = ctx.message?.text;
    if (text && !text.startsWith("/") && !text.includes("http")) {
      await ctx.reply(
        `❓ لینک معتبری دریافت نشد.\n\n` +
        `لطفاً یک لینک از YouTube، Spotify، Instagram یا Radio Javan ارسال کنید.\n\n` +
        `برای راهنما: /help`,
        { parse_mode: "HTML" },
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
  await bot.api.setMyCommands([
    { command: "start", description: "شروع و معرفی ربات" },
    { command: "help", description: "راهنمای استفاده" },
    { command: "about", description: "درباره ربات" },
  ]);

  await bot.api.setMyCommands(
    [
      { command: "start", description: "شروع و معرفی ربات" },
      { command: "help", description: "راهنمای استفاده" },
      { command: "about", description: "درباره ربات" },
      { command: "stats", description: "آمار ربات (ادمین)" },
      { command: "cleanup", description: "پاک‌سازی فایل‌های موقت (ادمین)" },
      { command: "broadcast", description: "ارسال پیام همگانی (ادمین)" },
    ],
    { scope: { type: "chat", chat_id: config.adminId } },
  );

  logger.info("Bot commands registered");
}
