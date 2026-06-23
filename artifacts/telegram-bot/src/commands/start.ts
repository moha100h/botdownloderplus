import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../bot.js";

export function registerStartCommand(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    const firstName = ctx.from?.first_name ?? "کاربر";

    const keyboard = new InlineKeyboard()
      .text("📖 راهنمای استفاده", "menu:help")
      .text("ℹ️ درباره ربات", "menu:about")
      .row()
      .text("▶️ YouTube", "menu:yt")
      .text("🟢 Spotify", "menu:sp")
      .row()
      .text("📸 Instagram", "menu:ig")
      .text("📻 Radio Javan", "menu:rj");

    await ctx.reply(
      `🎵 <b>به ربات دانلودر خوش آمدید!</b>\n\n` +
      `سلام <b>${firstName}</b>! 👋\n\n` +
      `لینک هر محتوایی از پلتفرم‌های زیر را ارسال کنید:\n\n` +
      `▶️ YouTube &nbsp;|&nbsp; 🟢 Spotify\n` +
      `📸 Instagram &nbsp;|&nbsp; 📻 Radio Javan\n\n` +
      `<i>فقط لینک را بفرستید — ربات بقیه کارها را انجام می‌دهد!</i>`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      },
    );
  });

  bot.callbackQuery("menu:help", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text("🏠 بازگشت به منو", "menu:back");
    await ctx.editMessageText(
      `📖 <b>راهنمای استفاده</b>\n\n` +
      `<b>روش استفاده:</b>\n` +
      `۱. لینک مورد نظر را کپی کنید\n` +
      `۲. در این چت ارسال کنید\n` +
      `۳. فرمت دلخواه را از دکمه‌ها انتخاب کنید\n` +
      `۴. منتظر دانلود باشید ✅\n\n` +
      `<b>⚠️ محدودیت‌ها:</b>\n` +
      `• حداکثر حجم فایل: ۵۰ مگابایت\n` +
      `• حداکثر ۵ درخواست در دقیقه\n` +
      `• پست‌های خصوصی اینستاگرام دانلود نمی‌شوند`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery("menu:about", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text("🏠 بازگشت به منو", "menu:back");
    await ctx.editMessageText(
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

  bot.callbackQuery("menu:yt", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text("🏠 بازگشت به منو", "menu:back");
    await ctx.editMessageText(
      `▶️ <b>YouTube</b>\n\n` +
      `لینک‌های پشتیبانی شده:\n` +
      `• <code>https://youtube.com/watch?v=...</code>\n` +
      `• <code>https://youtu.be/...</code>\n` +
      `• <code>https://youtube.com/shorts/...</code>\n\n` +
      `<b>فرمت‌های دانلود:</b>\n` +
      `🎵 MP3 | 📹 360p | 📹 720p | 📹 1080p`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery("menu:sp", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text("🏠 بازگشت به منو", "menu:back");
    await ctx.editMessageText(
      `🟢 <b>Spotify</b>\n\n` +
      `لینک‌های پشتیبانی شده:\n` +
      `• <code>https://open.spotify.com/track/...</code>\n\n` +
      `<b>فرمت دانلود:</b>\n` +
      `🎵 MP3 با بالاترین کیفیت\n\n` +
      `<i>توجه: فقط آهنگ‌های منفرد (track) پشتیبانی می‌شوند.</i>`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery("menu:ig", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text("🏠 بازگشت به منو", "menu:back");
    await ctx.editMessageText(
      `📸 <b>Instagram</b>\n\n` +
      `لینک‌های پشتیبانی شده:\n` +
      `• <code>https://instagram.com/p/...</code>\n` +
      `• <code>https://instagram.com/reel/...</code>\n\n` +
      `<b>فرمت‌های دانلود:</b>\n` +
      `📹 ویدئو | 🖼 عکس\n\n` +
      `<i>توجه: پست‌های خصوصی دانلود نمی‌شوند.</i>`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery("menu:rj", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard().text("🏠 بازگشت به منو", "menu:back");
    await ctx.editMessageText(
      `📻 <b>Radio Javan</b>\n\n` +
      `لینک‌های پشتیبانی شده:\n` +
      `• <code>https://radiojavan.com/mp3s/mp3/...</code>\n` +
      `• <code>https://radiojavan.com/videos/video/...</code>\n\n` +
      `<b>فرمت‌های دانلود:</b>\n` +
      `🎵 MP3 | 📹 ویدئوکلیپ`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.callbackQuery("menu:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    const firstName = ctx.from?.first_name ?? "کاربر";
    const keyboard = new InlineKeyboard()
      .text("📖 راهنمای استفاده", "menu:help")
      .text("ℹ️ درباره ربات", "menu:about")
      .row()
      .text("▶️ YouTube", "menu:yt")
      .text("🟢 Spotify", "menu:sp")
      .row()
      .text("📸 Instagram", "menu:ig")
      .text("📻 Radio Javan", "menu:rj");

    await ctx.editMessageText(
      `🎵 <b>به ربات دانلودر خوش آمدید!</b>\n\n` +
      `سلام <b>${firstName}</b>! 👋\n\n` +
      `لینک هر محتوایی از پلتفرم‌های زیر را ارسال کنید:\n\n` +
      `▶️ YouTube &nbsp;|&nbsp; 🟢 Spotify\n` +
      `📸 Instagram &nbsp;|&nbsp; 📻 Radio Javan\n\n` +
      `<i>فقط لینک را بفرستید — ربات بقیه کارها را انجام می‌دهد!</i>`,
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      },
    );
  });
}
