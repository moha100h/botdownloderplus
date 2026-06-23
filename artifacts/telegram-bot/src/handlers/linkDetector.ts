import { Bot } from "grammy";
import { BotContext } from "../bot.js";
import { detectPlatform, extractUrls } from "../utils/platform.js";
import { buildYouTubeKeyboard } from "./youtube.js";
import { buildSpotifyKeyboard } from "./spotify.js";
import { buildInstagramKeyboard } from "./instagram.js";
import { buildRadioJavanKeyboard } from "./radiojavan.js";
import { logger } from "../utils/logger.js";

const PLATFORM_INFO: Record<string, { icon: string; name: string }> = {
  youtube:    { icon: "▶️", name: "YouTube" },
  spotify:    { icon: "🟢", name: "Spotify" },
  instagram:  { icon: "📸", name: "Instagram" },
  radiojavan: { icon: "📻", name: "Radio Javan" },
};

export function registerLinkDetector(bot: Bot<BotContext>): void {
  bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text;
    const urls = extractUrls(text);

    if (urls.length === 0) return next();

    const url = urls[0];
    const platform = detectPlatform(url);

    if (platform === "unknown") return next();

    const info = PLATFORM_INFO[platform];
    logger.info({ userId: ctx.from.id, platform, url }, "Link detected");

    let keyboard;
    switch (platform) {
      case "youtube":    keyboard = buildYouTubeKeyboard(url);    break;
      case "spotify":    keyboard = buildSpotifyKeyboard(url);    break;
      case "instagram":  keyboard = buildInstagramKeyboard(url);  break;
      case "radiojavan": keyboard = buildRadioJavanKeyboard(url); break;
      default: return next();
    }

    await ctx.reply(
      `${info.icon} <b>لینک ${info.name} شناسایی شد!</b>\n\n` +
      `کیفیت یا فرمت مورد نظر را انتخاب کنید:`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
        reply_parameters: { message_id: ctx.message.message_id },
      },
    );
  });
}
