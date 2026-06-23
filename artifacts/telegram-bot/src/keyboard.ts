import { Keyboard } from "grammy";

export const MAIN_KEYBOARD = new Keyboard()
  .text("▶️ YouTube").text("🟢 Spotify")
  .row()
  .text("📸 Instagram").text("📻 Radio Javan")
  .row()
  .text("📖 راهنما").text("ℹ️ درباره")
  .resized()
  .persistent();
