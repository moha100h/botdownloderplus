import { Bot } from "grammy";
import { BotContext } from "../bot.js";

export function registerHelpCommand(bot: Bot<BotContext>): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `📖 <b>راهنمای ربات دانلودر</b>\n\n` +
      `<b>🔗 نحوه استفاده:</b>\n` +
      `لینک را در چت ارسال کنید → ربات فرمت‌های دانلود را نمایش می‌دهد → فرمت دلخواه را انتخاب کنید\n\n` +
      `<b>📥 لینک‌های پشتیبانی شده:</b>\n\n` +
      `▶️ <b>YouTube:</b>\n` +
      `<code>https://youtube.com/watch?v=...</code>\n` +
      `<code>https://youtu.be/...</code>\n` +
      `<code>https://youtube.com/shorts/...</code>\n\n` +
      `🟢 <b>Spotify:</b>\n` +
      `<code>https://open.spotify.com/track/...</code>\n\n` +
      `📸 <b>Instagram:</b>\n` +
      `<code>https://instagram.com/p/...</code>\n` +
      `<code>https://instagram.com/reel/...</code>\n\n` +
      `📻 <b>Radio Javan:</b>\n` +
      `<code>https://radiojavan.com/mp3s/mp3/...</code>\n` +
      `<code>https://radiojavan.com/videos/video/...</code>\n\n` +
      `<b>⚠️ محدودیت‌ها:</b>\n` +
      `• حداکثر حجم فایل: ۵۰ مگابایت\n` +
      `• حداکثر ۵ درخواست در دقیقه\n` +
      `• پست‌های خصوصی اینستاگرام دانلود نمی‌شوند\n\n` +
      `<b>📋 دستورات:</b>\n` +
      `/start — شروع\n` +
      `/help — راهنما\n` +
      `/about — درباره ربات`,
      { parse_mode: "HTML" },
    );
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(
      `ℹ️ <b>درباره ربات دانلودر</b>\n\n` +
      `این ربات با استفاده از جدیدترین تکنولوژی‌های سال ۲۰۲۶ ساخته شده است.\n\n` +
      `<b>🛠 تکنولوژی‌ها:</b>\n` +
      `• Grammy Framework (Telegram Bot API)\n` +
      `• yt-dlp (موتور دانلود)\n` +
      `• Node.js 24 + TypeScript\n\n` +
      `<b>✨ ویژگی‌ها:</b>\n` +
      `• دانلود سریع و بهینه\n` +
      `• پشتیبانی از ۴ پلتفرم\n` +
      `• انتخاب کیفیت\n` +
      `• مدیریت خودکار فایل‌های موقت\n` +
      `• محدودسازی نرخ درخواست`,
      { parse_mode: "HTML" },
    );
  });
}
