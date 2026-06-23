# Telegram Media Downloader Bot

یک بات تلگرام حرفه‌ای برای دانلود از YouTube، Spotify، Instagram و Radio Javan.

## Run & Operate

- `node artifacts/telegram-bot/setup.mjs` — **اجرای اسکریپت نصب** (توکن و ادمین ID)
- `pnpm --filter @workspace/telegram-bot run dev` — اجرای بات در حالت توسعه
- `pnpm --filter @workspace/telegram-bot run typecheck` — typecheck
- `pnpm --filter @workspace/api-server run dev` — اجرای API server (پورت 5000)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot Framework: **Grammy v1** (مدرن‌ترین فریمورک تلگرام)
- Downloader: **yt-dlp** (universal media downloader)
- Logging: Pino
- Rate Limiting: In-memory per-user

## Where things live

- `artifacts/telegram-bot/` — سورس اصلی بات
- `artifacts/telegram-bot/src/handlers/` — هندلرهای هر پلتفرم (YouTube, Spotify, Instagram, RadioJavan)
- `artifacts/telegram-bot/src/commands/` — کامندهای بات (/start, /help, /about, /stats)
- `artifacts/telegram-bot/src/utils/` — downloader, fileUtils, platform detector, logger
- `artifacts/telegram-bot/src/middlewares/` — rateLimiter, adminOnly
- `artifacts/telegram-bot/setup.mjs` — اسکریپت نصب تعاملی
- `artifacts/telegram-bot/.env` — متغیرهای محیطی (بعد از نصب ایجاد می‌شود)

## Architecture decisions

- Grammy با session middleware برای نگهداری state کاربر
- yt-dlp-wrap برای دانلود خودکار باینری yt-dlp در اولین اجرا
- Inline keyboard برای انتخاب کیفیت (بدون نیاز به مکالمه چندمرحله‌ای)
- Base64url encoding برای ذخیره URL در callback_data تلگرام
- فایل‌های موقت دانلود شده بلافاصله بعد از ارسال حذف می‌شوند

## Product

- دریافت لینک از هر ۴ پلتفرم → انتخاب کیفیت → دانلود → ارسال فایل
- YouTube: MP3 / 360p / 720p / 1080p
- Spotify: MP3 320kbps
- Instagram: ویدئو / عکس
- Radio Javan: MP3 / ویدئوکلیپ
- دستورات ادمین: /stats, /cleanup, /broadcast

## User preferences

- Backend-only (بدون frontend)
- بالاترین کیفیت و سرعت کدنویسی
- پشتیبانی فارسی در پیام‌های بات

## Gotchas

- اولین اجرا: yt-dlp باینری از GitHub دانلود می‌شود (کمی طول می‌کشد)
- حداکثر حجم فایل برای بات‌های تلگرام: 50 MB
- برای Instagram: فقط پست‌های عمومی قابل دانلود هستند
- ابتدا `node setup.mjs` اجرا کنید تا فایل `.env` ساخته شود

## Pointers

- Grammy docs: https://grammy.dev
- yt-dlp: https://github.com/yt-dlp/yt-dlp
