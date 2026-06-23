import { Bot } from "grammy";
import { BotContext } from "../bot.js";

export function registerStartCommand(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    const firstName = ctx.from?.first_name ?? "کاربر";
    await ctx.reply(
      `🎵 <b>به ربات دانلودر خوش آمدید!</b>\n\n` +
      `سلام ${firstName}! 👋\n\n` +
      `این ربات به شما کمک می‌کند تا محتوای مورد علاقه‌تان را از پلتفرم‌های مختلف دانلود کنید.\n\n` +
      `<b>📥 پلتفرم‌های پشتیبانی شده:</b>\n\n` +
      `▶️ <b>YouTube</b>\n` +
      `   • ویدئو در کیفیت‌های مختلف (360p, 720p, 1080p)\n` +
      `   • موزیک به فرمت MP3 با بالاترین کیفیت\n\n` +
      `🟢 <b>Spotify</b>\n` +
      `   • آهنگ به فرمت MP3 320kbps\n\n` +
      `📸 <b>Instagram</b>\n` +
      `   • ویدئو و Reels\n` +
      `   • عکس\n\n` +
      `📻 <b>Radio Javan</b>\n` +
      `   • MP3 و ویدئوکلیپ\n\n` +
      `<b>🚀 نحوه استفاده:</b>\n` +
      `فقط کافیست لینک را در چت ارسال کنید!\n\n` +
      `<i>برای راهنمای بیشتر /help را بزنید.</i>`,
      { parse_mode: "HTML" },
    );
  });
}
