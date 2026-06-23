import { Bot } from "grammy";
import { BotContext } from "../bot.js";
import { MAIN_KEYBOARD } from "../keyboard.js";

export function registerHelpCommand(bot: Bot<BotContext>): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `📖 <b>راهنمای ربات دانلودر</b>\n\n` +
      `<b>روش استفاده:</b>\n` +
      `۱. لینک را در چت ارسال کنید\n` +
      `۲. فرمت دلخواه را از دکمه‌ها انتخاب کنید\n` +
      `۳. منتظر دانلود بمانید ✅\n\n` +
      `<b>⚠️ محدودیت‌ها:</b>\n` +
      `• حداکثر حجم فایل: ۵۰ مگابایت\n` +
      `• حداکثر ۵ درخواست در دقیقه\n` +
      `• پست‌های خصوصی اینستاگرام دانلود نمی‌شوند\n\n` +
      `<b>📌 نکته:</b> برای ویدئوهای بزرگ، ربات به صورت خودکار کیفیت پایین‌تر را امتحان می‌کند.`,
      { parse_mode: "HTML", reply_markup: MAIN_KEYBOARD },
    );
  });

  bot.command("about", async (ctx) => {
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
}
