import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";

export function registerHelpCommand(bot: Bot<BotContext>): void {
  bot.command("help", async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text("🏠 منو اصلی", "menu:back")
      .text("ℹ️ درباره ربات", "menu:about");

    await ctx.reply(
      `📖 <b>راهنمای ربات دانلودر</b>\n\n` +
      `<b>روش استفاده:</b>\n` +
      `۱. لینک مورد نظر را کپی کنید\n` +
      `۲. در این چت ارسال کنید\n` +
      `۳. فرمت دلخواه را از دکمه‌ها انتخاب کنید\n` +
      `۴. منتظر دانلود باشید ✅\n\n` +
      `<b>📥 لینک‌های پشتیبانی شده:</b>\n\n` +
      `▶️ <b>YouTube:</b>\n` +
      `<code>https://youtube.com/watch?v=...</code>\n` +
      `<code>https://youtu.be/...</code>\n\n` +
      `🟢 <b>Spotify:</b>\n` +
      `<code>https://open.spotify.com/track/...</code>\n\n` +
      `📸 <b>Instagram:</b>\n` +
      `<code>https://instagram.com/p/...</code>\n` +
      `<code>https://instagram.com/reel/...</code>\n\n` +
      `📻 <b>Radio Javan:</b>\n` +
      `<code>https://radiojavan.com/mp3s/mp3/...</code>\n\n` +
      `<b>⚠️ محدودیت‌ها:</b>\n` +
      `• حداکثر حجم فایل: ۵۰ مگابایت\n` +
      `• حداکثر ۵ درخواست در دقیقه\n` +
      `• پست‌های خصوصی اینستاگرام دانلود نمی‌شوند`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.command("about", async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text("🏠 منو اصلی", "menu:back")
      .text("📖 راهنما", "menu:help");

    await ctx.reply(
      `ℹ️ <b>درباره ربات دانلودر</b>\n\n` +
      `ساخته شده با جدیدترین تکنولوژی‌ها:\n\n` +
      `• Grammy Framework (Telegram Bot API)\n` +
      `• yt-dlp (موتور دانلود قدرتمند)\n` +
      `• Node.js 24 + TypeScript\n\n` +
      `<b>✨ ویژگی‌ها:</b>\n` +
      `• دانلود سریع با نمایش پیشرفت\n` +
      `• پشتیبانی از ۴ پلتفرم\n` +
      `• انتخاب کیفیت برای YouTube\n` +
      `• مدیریت خودکار حافظه`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });
}
