import { createBot, setBotCommands } from "./bot.js";
import { ensureDownloadDir, cleanupOldFiles } from "./utils/fileUtils.js";
import { logger } from "./utils/logger.js";
import { config } from "./config.js";
import { getYtDlp } from "./utils/downloader.js";

/**
 * When using a self-hosted Bot API server, wait until it not only accepts
 * connections but actually authorizes THIS bot (getMe -> ok:true). A plain
 * reachability check is insufficient: another process (e.g. a dev proxy) may
 * answer on the same port and return non-Telegram responses, which would let
 * the bot proceed and then fail hard. Verifying getMe guarantees we are talking
 * to the real Bot API server and that the bot is logged in.
 */
async function waitForLocalBotApi(): Promise<void> {
  if (!config.useLocalBotApi) return;

  const getMeUrl = `${config.botApiServerUrl}/bot${config.botToken}/getMe`;
  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(getMeUrl, { method: "GET" });
      const body = (await res.json()) as { ok?: boolean };
      if (body.ok === true) {
        logger.info({ url: config.botApiServerUrl }, "Local Bot API server ready");
        return;
      }
    } catch {
      // Not up yet, or not a valid Telegram response — keep waiting.
    }
    if (attempt === 1) {
      logger.info({ url: config.botApiServerUrl }, "Waiting for local Bot API server...");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Local Bot API server at ${config.botApiServerUrl} did not become ready (getMe failed)`,
  );
}

async function bootstrap(): Promise<void> {
  logger.info("Starting Telegram Media Downloader Bot...");

  ensureDownloadDir();
  logger.info({ downloadDir: config.downloadDir }, "Download directory ready");

  logger.info("Initializing yt-dlp...");
  await getYtDlp();
  logger.info("yt-dlp ready");

  await waitForLocalBotApi();

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
