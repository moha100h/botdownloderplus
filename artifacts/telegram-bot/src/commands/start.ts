import { Bot } from "grammy";
import { BotContext } from "../bot.js";
import { MAIN_KEYBOARD } from "../keyboard.js";

export function registerStartCommand(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    const firstName = ctx.from?.first_name ?? "کاربر";
    await ctx.reply(
      `🎵 <b>به ربات دانلودر خوش آمدید!</b>\n\n` +
      `سلام <b>${firstName}</b>! 👋\n\n` +
      `لینک هر محتوایی از پلتفرم‌های زیر را ارسال کنید:\n\n` +
      `▶️ <b>YouTube</b> — ویدئو و موزیک\n` +
      `🟢 <b>Spotify</b> — آهنگ و پلی‌لیست\n` +
      `📸 <b>Instagram</b> — ریل و عکس\n` +
      `📻 <b>Radio Javan</b> — MP3 و ویدئوکلیپ\n\n` +
      `<i>از دکمه‌های پایین برای راهنمایی استفاده کنید 👇</i>`,
      {
        parse_mode: "HTML",
        reply_markup: MAIN_KEYBOARD,
      },
    );
  });
}
