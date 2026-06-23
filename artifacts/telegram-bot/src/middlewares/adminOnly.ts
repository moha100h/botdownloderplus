import { Context, NextFunction } from "grammy";
import { config } from "../config.js";

export async function adminOnly(ctx: Context, next: NextFunction): Promise<void> {
  if (ctx.from?.id !== config.adminId) {
    await ctx.reply("⛔ این دستور فقط برای ادمین در دسترس است.");
    return;
  }
  await next();
}
