import { createBot, setBotCommands } from "./bot.js";
import { ensureDownloadDir, cleanupOldFiles } from "./utils/fileUtils.js";
import { logger } from "./utils/logger.js";
import { config } from "./config.js";
import { getYtDlp } from "./utils/downloader.js";

async function bootstrap(): Promise<void> {
  logger.info("Starting Telegram Media Downloader Bot...");

  ensureDownloadDir();
  logger.info({ downloadDir: config.downloadDir }, "Download directory ready");

  logger.info("Initializing yt-dlp...");
  await getYtDlp();
  logger.info("yt-dlp ready");

  const bot = createBot();

  await bot.api.getMe().then((me) => {
    logger.info({ username: me.username, id: me.id }, "Bot connected");
  });

  await setBotCommands(bot);

  const cleanup = setInterval(() => cleanupOldFiles(), 30 * 60 * 1000);

  process.once("SIGINT", async () => {
    logger.info("SIGINT received, stopping bot...");
    clearInterval(cleanup);
    bot.stop();
  });

  process.once("SIGTERM", async () => {
    logger.info("SIGTERM received, stopping bot...");
    clearInterval(cleanup);
    bot.stop();
  });

  logger.info(`Bot started in long-polling mode | Admin ID: ${config.adminId}`);
  await bot.start({
    onStart: (me) => {
      logger.info(
        `@${me.username} is running! Send /start to get started.`,
      );
    },
    drop_pending_updates: true,
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fatal error during bootstrap");
  process.exit(1);
});
