---
name: Telegram bot stack quirks
description: Non-obvious issues in the Grammy+yt-dlp Telegram downloader bot project
---

## Spotify DRM — scrape embed page + YouTube search
yt-dlp refuses all Spotify URLs with `[DRM] The requested site is known to use DRM protection`. The old `get_access_token` token endpoint now returns 403 (dead).
**Fix:** Fetch `https://open.spotify.com/embed/{kind}/{id}` and parse the `__NEXT_DATA__` JSON script tag → `props.pageProps.state.data.entity`. For **playlists/albums** the tracks are in `entity.trackList[]` (each has `title`=name, `subtitle`=artists). For a **single track** `trackList` is undefined — use `entity.name` (title) + `entity.artists[].name` (join with ", "). Then `ytsearch1:{name} {artist} audio` per track via yt-dlp.
**Why:** Spotify streams are DRM-protected; yt-dlp won't ever support them directly. Single vs multi entities have different JSON shapes — handle both.

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

## Radio Javan download — direct API, not yt-dlp
rj.app + radiojavan.com sit behind Cloudflare → 403 for yt-dlp/curl/node-fetch. **node fetch with `redirect:"follow"` does NOT follow rj.app redirects** (Cloudflare 403s the request, returns same URL).
**Fix (resolve short link):** Extract code from `rj.app/{m|v}/CODE`, then call `https://play.radiojavan.com/api/short-link/{m|v}/CODE` with `redirect:"manual"` — returns 308 with a `Location` header pointing to `play.radiojavan.com/song/SLUG`.
**Fix (download media):** Call `https://play.radiojavan.com/api/p/{mp3|video|podcast}?id=SLUG` → JSON with `link` + `hq_link` direct media URLs; stream the file directly (prefer `hq_link`).

## Telegram bot 50MB upload hard limit
Standard Telegram Bot API caps bot file uploads at 50MB. Many YouTube videos exceed this even at 360p. There is NO workaround within the standard Bot API. The YouTube handler auto-falls-back 1080→720→360→mp3 and reports the size when even mp3 is too big.
**Only true fix for >50MB:** self-hosted Telegram Bot API server (2GB limit), which needs the user's `api_id`/`api_hash` + the `telegram-bot-api` binary. Do not promise >50MB video without this.

## Downloaded-file cleanup must survive send failures
Requirement: every sent file auto-deletes after 120s. **Rule:** schedule deletion in a `finally` block keyed off a `downloadedPath` variable, NOT only on the success path. If you only `scheduleFileDeletion` after a successful `replyWithVideo/Audio`, a send failure leaks the file until the periodic sweep (~1h).
**Why:** Telegram sends throw on flaky network / oversize; the file is already on disk by then and must still be cleaned up.

## yt-dlp binary reuse (GitHub rate limit)
`YTDlpWrap.downloadFromGithub()` hits GitHub's unauthenticated rate limit (403) and on failure the init code fell back to a pathless `new YTDlpWrap()` = system yt-dlp (not installed) → all downloads break.
**Fix:** In `getYtDlp()`, if the binary file already exists at `downloads/.yt-dlp-bin`, use it directly via `existsSync` and skip the GitHub download entirely.

## Self-hosted Bot API server lifts the 50MB cap (~2GB)
The only way past the 50MB upload limit is a self-hosted `telegram-bot-api` (installed as a Nix system dep). Run it as its own workflow: `telegram-bot-api --local --http-port=<PORT> --dir=<abs>/.tba-data`. It reads `--api-id`/`--api-hash` from env vars `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` (store as Replit env vars so the workflow process inherits them). Point grammY at it: `new Bot(token, { client: { apiRoot: "http://localhost:<PORT>" } })`. Set `MAX_FILE_SIZE_MB=2000`. Keep `InputFile(createReadStream(...))` multipart — fine for ~2GB to localhost.
**Migration:** grammY's first call makes the local server log the bot in via MTProto; no explicit cloud `logOut` was needed here (long-polling worked immediately) because nothing else was polling cloud. If you ever see 409 conflicts, call `https://api.telegram.org/bot<TOKEN>/logOut` once while the bot is stopped, then start local.
**binlog lock:** only ONE telegram-bot-api instance can use a given `--dir` (locks `tqueue.binlog`); a second instance crashes with "Can't lock file ... already in use". Don't run a manual copy while the workflow one runs.

## Replit proxy hijacks some localhost ports — use an un-proxied port for internal servers
DO NOT put an internal-only server (like telegram-bot-api) on a "supported"/proxied port. Port 8081 silently routed to the mockup-sandbox Vite server (responses like `The server is configured with a public base URL of /__mockup`), so the bot's requests never reached telegram-bot-api even though it was running. Probe with `curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://localhost:<p>/`: `000` = free/un-proxied (good for internal), `302`/other = intercepted. 9090 worked.
**Readiness check must verify identity, not just reachability:** poll `${apiRoot}/bot<TOKEN>/getMe` and require JSON `ok:true` before `bot.start()` — a plain `fetch(url)` reachability check false-passes when the wrong process answers the port.
