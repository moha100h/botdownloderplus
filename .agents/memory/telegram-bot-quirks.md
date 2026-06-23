---
name: Telegram bot stack quirks
description: Non-obvious issues in the Grammy+yt-dlp Telegram downloader bot project
---

## Spotify DRM — use oEmbed + YouTube search
yt-dlp refuses all Spotify URLs with `[DRM] The requested site is known to use DRM protection`.
**Fix:** Fetch `https://open.spotify.com/oembed?url={spotifyUrl}` (no auth needed) to get title+artist, then pass `ytsearch1:{title} {artist} official audio` to yt-dlp.
**Why:** Spotify streams are DRM-protected; yt-dlp won't ever support them directly.

## Telegram callback_data 64-byte limit
Inline keyboard buttons have a hard 64-byte limit on callback_data. Base64-encoding a full URL exceeds this.
**Fix:** Store URLs in an in-memory cache (`urlCache.ts`) with 8-char hex IDs; use the short ID in callback_data (e.g. `sp:a1b2c3d4`).

## yt-dlp-wrap ESM/CJS interop
`import YTDlpWrap from "yt-dlp-wrap"` gives a non-constructor object in ESM.
**Fix:** `const YTDlpWrap = (YTDlpWrapModule as any).default ?? YTDlpWrapModule;`
**Why:** The package is CJS with `__esModule: true`; the actual class is at `.default.default` when imported via ESM dynamic import.

## System dependencies required for yt-dlp
yt-dlp needs `python3` and `ffmpeg` installed as Nix system packages. Without them, every download fails with `Error code: 127 — /usr/bin/env: 'python3': No such file or directory`.
**How to apply:** Always install `python3` and `ffmpeg` via `installSystemDependencies` when setting up this project.

## API server path resolution after esbuild bundle
In the compiled `dist/index.mjs`, `__dirname` resolves relative to `dist/`, not `src/routes/`. Using relative paths like `"../../../telegram-bot"` hits the wrong directory.
**Fix:** Use `process.cwd()` (always = workspace root when started via pnpm) and build absolute paths from there: `resolve(process.cwd(), "artifacts/telegram-bot")`.

## rj.app short links
Radio Javan uses `rj.app` as a short URL domain. Must add `/(?:https?:\/\/)?rj\.app\//` to the radiojavan platform patterns. For rj.app links, the media type (mp3 vs video) is unknown without resolving the redirect, so always show both download buttons.
