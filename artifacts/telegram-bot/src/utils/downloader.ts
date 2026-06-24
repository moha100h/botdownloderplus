import YTDlpWrapModule from "yt-dlp-wrap";
import { join } from "path";
import { existsSync, writeFileSync, readdirSync, statSync } from "fs";
import { randomUUID } from "crypto";
import { config } from "../config.js";
import { ensureDownloadDir, getFileSizeMb, findDownloadedFile } from "./fileUtils.js";
import { logger } from "./logger.js";
import { CancelledError, isCancelledError } from "./cancellation.js";

// yt-dlp-wrap is CJS; the actual class lives at .default in ESM context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YTDlpWrap: typeof YTDlpWrapModule = (YTDlpWrapModule as any).default ?? YTDlpWrapModule;

let ytDlp: InstanceType<typeof YTDlpWrap> | null = null;

export async function getYtDlp(): Promise<InstanceType<typeof YTDlpWrap>> {
  if (!ytDlp) {
    const binaryPath = join(config.downloadDir, ".yt-dlp-bin");

    // Reuse an already-downloaded binary (avoids GitHub rate-limit failures)
    if (existsSync(binaryPath)) {
      ytDlp = new YTDlpWrap(binaryPath);
      logger.info({ binaryPath }, "Using existing yt-dlp binary");
      return ytDlp;
    }

    ytDlp = new YTDlpWrap(binaryPath);
    try {
      await (YTDlpWrap as any).downloadFromGithub(binaryPath);
      logger.info("yt-dlp binary downloaded");
    } catch (err) {
      logger.warn({ err }, "Could not download yt-dlp binary, using system yt-dlp if available");
      ytDlp = new YTDlpWrap();
    }
  }
  return ytDlp;
}

/**
 * Write the configured Instagram cookies to a temp cookies.txt file (once) and
 * return its path. Instagram blocks anonymous requests from datacenter IPs, so
 * yt-dlp needs a logged-in session to fetch posts, reels, carousels & stories.
 * Returns null when no cookies are configured.
 */
let igCookiesPath: string | null = null;
export function getInstagramCookiesFile(): string | null {
  ensureDownloadDir();
  const diskPath = join(config.downloadDir, ".instagram-cookies.txt");

  // اگه فایل توسط /setcookies روی دیسک نوشته شده، مستقیم استفاده کن
  if (existsSync(diskPath) && statSync(diskPath).size > 10) {
    igCookiesPath = diskPath;
    return diskPath;
  }

  // در غیر این صورت از env var بخوان و بنویس
  if (!config.instagramCookies) return null;
  if (igCookiesPath && existsSync(igCookiesPath)) return igCookiesPath;
  let contents = config.instagramCookies;
  if (!contents.startsWith("# Netscape HTTP Cookie File") && !contents.startsWith("# HTTP Cookie File")) {
    contents = `# Netscape HTTP Cookie File\n${contents}`;
  }
  writeFileSync(diskPath, contents.endsWith("\n") ? contents : `${contents}\n`, { mode: 0o600 });
  igCookiesPath = diskPath;
  logger.info("Instagram cookies file written from env");
  return diskPath;
}

export function hasInstagramCookies(): boolean {
  const diskPath = join(config.downloadDir, ".instagram-cookies.txt");
  return config.instagramCookies.length > 0 ||
    (existsSync(diskPath) && statSync(diskPath).size > 10);
}

/**
 * Write the configured YouTube cookies to a temp cookies.txt file (once) and
 * return its path. YouTube blocks anonymous yt-dlp requests from datacenter
 * IPs with "Sign in to confirm you're not a bot". Returns null when not set.
 */
let ytCookiesPath: string | null = null;
export function getYouTubeCookiesFile(): string | null {
  ensureDownloadDir();
  const diskPath = join(config.downloadDir, ".youtube-cookies.txt");

  // اگه فایل توسط /setcookies روی دیسک نوشته شده، مستقیم استفاده کن
  // این حالت وقتی پیش میاد که YOUTUBE_COOKIES در .env نیست ولی ادمین از طریق بات کوکی داده
  if (existsSync(diskPath) && statSync(diskPath).size > 10) {
    ytCookiesPath = diskPath;
    return diskPath;
  }

  // در غیر این صورت از env var بخوان و بنویس
  if (!config.youtubeCookies) return null;
  if (ytCookiesPath && existsSync(ytCookiesPath)) return ytCookiesPath;
  let contents = config.youtubeCookies;
  if (!contents.startsWith("# Netscape HTTP Cookie File") && !contents.startsWith("# HTTP Cookie File")) {
    contents = `# Netscape HTTP Cookie File\n${contents}`;
  }
  writeFileSync(diskPath, contents.endsWith("\n") ? contents : `${contents}\n`, { mode: 0o600 });
  ytCookiesPath = diskPath;
  logger.info("YouTube cookies file written from env");
  return diskPath;
}

export function hasYouTubeCookies(): boolean {
  const diskPath = join(config.downloadDir, ".youtube-cookies.txt");
  return config.youtubeCookies.length > 0 ||
    (existsSync(diskPath) && statSync(diskPath).size > 10);
}

export type IgMediaType = "photo" | "video";

export interface IgMediaItem {
  filePath: string;
  type: IgMediaType;
  fileSizeMb: number;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic", "gif"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "mkv", "m4v"]);

/** Authentication failures from Instagram (login/cookies required). */
export class InstagramAuthError extends Error {
  code = "IG_AUTH";
  constructor(message = "برای دانلود از اینستاگرام نیاز به ورود (کوکی) است") {
    super(message);
    this.name = "InstagramAuthError";
  }
}

function isInstagramAuthError(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? "";
  return /login required|use --cookies|empty media response|only available for registered|rate-limit reached|HTTP Error 401|HTTP Error 403|HTTP Error 429|requested content is not available/i.test(
    msg,
  );
}

/**
 * Download every media item in an Instagram post/reel/story. Carousels contain
 * multiple photos/videos which yt-dlp exposes as a playlist, so we download the
 * whole playlist (no `--no-playlist`) and collect all produced files.
 */
export async function downloadInstagram(opts: {
  url: string;
  onProgress?: (pct: number) => void;
  onStatus?: (msg: string) => void;
  signal?: AbortSignal;
}): Promise<{ items: IgMediaItem[]; title: string }> {
  ensureDownloadDir();
  const dl = await getYtDlp();
  const uid = randomUUID();
  // %(playlist_index)s numbers carousel items (1,2,3…); single posts get "NA".
  const outputTemplate = join(config.downloadDir, `${uid}.%(playlist_index)s.%(ext)s`);

  const cookiesFile = getInstagramCookiesFile();
  const args = [
    opts.url,
    "-o", outputTemplate,
    "--no-warnings",
    "--restrict-filenames",
    "--yes-playlist",
    "--merge-output-format", "mp4",
  ];
  if (cookiesFile) args.push("--cookies", cookiesFile);

  logger.debug({ hasCookies: !!cookiesFile }, "Starting Instagram download");

  try {
    await execDownload(dl, args, opts.onProgress, opts.signal);
  } catch (err) {
    if (isCancelledError(err)) throw err;
    if (isInstagramAuthError(err)) throw new InstagramAuthError();
    throw err;
  }

  // Collect every produced file sharing the uid prefix, in carousel order.
  const files = readdirSync(config.downloadDir)
    .filter((f) => f.startsWith(`${uid}.`) && !f.endsWith(".part") && !f.endsWith(".ytdl"))
    .sort((a, b) => {
      const idx = (f: string) => {
        const m = f.match(new RegExp(`^${uid}\\.(\\d+)\\.`));
        return m ? Number(m[1]) : 0;
      };
      return idx(a) - idx(b);
    });

  const items: IgMediaItem[] = [];
  for (const f of files) {
    const ext = f.split(".").pop()?.toLowerCase() ?? "";
    let type: IgMediaType | null = null;
    if (VIDEO_EXTS.has(ext)) type = "video";
    else if (IMAGE_EXTS.has(ext)) type = "photo";
    if (!type) continue; // skip .json/.description/etc.
    const filePath = join(config.downloadDir, f);
    items.push({ filePath, type, fileSizeMb: getFileSizeMb(filePath) });
  }

  if (items.length === 0) {
    throw new Error("هیچ فایلی برای دانلود پیدا نشد");
  }

  let title = "Instagram";
  try {
    const info = await dl.getVideoInfo(
      cookiesFile ? [opts.url, "--cookies", cookiesFile] : [opts.url],
    );
    title = (info as Record<string, unknown>).title as string ?? "Instagram";
  } catch { }

  logger.info({ count: items.length, title }, "Instagram download complete");
  return { items, title };
}

export type DownloadFormat = "mp3" | "mp4_360" | "mp4_720" | "mp4_1080" | "best";

export interface DownloadResult {
  filePath: string;
  title: string;
  fileSizeMb: number;
}

export interface DownloadOptions {
  url: string;
  format: DownloadFormat;
  onProgress?: (percent: number) => void;
  onStatus?: (status: string) => void;
  maxFileSizeMb?: number;
  signal?: AbortSignal;
}

function buildYtdlpArgs(
  url: string,
  format: DownloadFormat,
  outputTemplate: string,
): string[] {
  const ytCookies = getYouTubeCookiesFile();
  const base = [
    url,
    "-o", outputTemplate,
    "--no-warnings",
    "--restrict-filenames",
    "--no-playlist",
    // force web client — bypasses bot-detection on datacenter IPs
    "--extractor-args", "youtube:player_client=web",
    ...(ytCookies ? ["--cookies", ytCookies] : []),
  ];

  switch (format) {
    case "mp3":
      return [
        ...base,
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--embed-thumbnail",
        "--embed-metadata",
      ];
    case "mp4_360":
      return [
        ...base,
        "-f", "bestvideo[height<=360]+bestaudio/best[height<=360]/best",
        "--merge-output-format", "mp4",
      ];
    case "mp4_720":
      return [
        ...base,
        "-f", "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
        "--merge-output-format", "mp4",
      ];
    case "mp4_1080":
      return [
        ...base,
        "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "--merge-output-format", "mp4",
      ];
    case "best":
    default:
      return [
        ...base,
        "-f", "bestvideo+bestaudio/best",
        "--merge-output-format", "mp4",
      ];
  }
}

async function execDownload(
  dl: InstanceType<typeof YTDlpWrap>,
  args: string[],
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  let lastPercent = -1;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }

    const proc = dl.exec(args);

    const onAbort = () => {
      // yt-dlp-wrap exposes the underlying ChildProcess via .ytDlpProcess
      try { (proc as any).ytDlpProcess?.kill("SIGKILL"); } catch { /* already exited */ }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    proc.on("ytDlpEvent", (eventType: string, eventData: string) => {
      if (eventType === "download" && eventData.includes("%")) {
        const match = eventData.match(/(\d+(?:\.\d+)?)%/);
        if (match) {
          const pct = Math.floor(Number(match[1]));
          if (pct !== lastPercent && pct % 5 === 0) {
            lastPercent = pct;
            onProgress?.(pct);
          }
        }
      }
    });
    proc.on("error", (err: Error) => {
      cleanup();
      reject(signal?.aborted ? new CancelledError() : err);
    });
    proc.on("close", () => {
      cleanup();
      if (signal?.aborted) reject(new CancelledError());
      else resolve();
    });
  });
}

export async function downloadMedia(opts: DownloadOptions): Promise<DownloadResult> {
  ensureDownloadDir();
  const dl = await getYtDlp();
  const uid = randomUUID();
  const outputTemplate = join(config.downloadDir, `${uid}.%(ext)s`);

  const args = buildYtdlpArgs(opts.url, opts.format, outputTemplate);
  logger.debug({ args }, "Starting yt-dlp");

  await execDownload(dl, args, opts.onProgress, opts.signal);

  // Find the actual output file — yt-dlp may produce .mp4, .webm, .mkv, etc.
  const filePath = findDownloadedFile(uid);
  if (!filePath) {
    throw new Error(`yt-dlp completed but no output file found for uid=${uid}`);
  }

  const fileSizeMb = getFileSizeMb(filePath);

  // Enforce file size limit after download
  if (opts.maxFileSizeMb && fileSizeMb > opts.maxFileSizeMb) {
    throw Object.assign(
      new Error(`File size ${fileSizeMb.toFixed(1)}MB exceeds limit of ${opts.maxFileSizeMb}MB`),
      { code: "FILE_TOO_LARGE", filePath, fileSizeMb },
    );
  }

  let title = "media";
  try {
    const info = await dl.getVideoInfo(opts.url);
    title = (info as Record<string, unknown>).title as string ?? "media";
  } catch { }

  logger.info({ filePath, fileSizeMb, title }, "Download complete");
  return { filePath, title, fileSizeMb };
}

// ─── Spotify via embed-page scrape + YouTube Search ──────────────────────────

interface SpotifyTrackMeta {
  name: string;
  artist: string;
}

/**
 * Scrape the Spotify embed page for an entity (track / playlist / album).
 * The embed page ships a __NEXT_DATA__ JSON blob containing the full track list
 * with title + subtitle (artists). This needs no API token.
 */
async function fetchSpotifyEmbed(kind: string, id: string): Promise<{
  name: string;
  type: string;
  tracks: SpotifyTrackMeta[];
}> {
  const res = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Spotify embed fetch failed: ${res.status}`);
  const html = await res.text();

  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s,
  );
  if (!match) throw new Error("Could not find Spotify embed data");

  const data = JSON.parse(match[1]);
  const entity = data?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error("Could not parse Spotify entity data");

  const rawTracks: any[] = entity.trackList ?? [];

  let tracks: SpotifyTrackMeta[];
  if (rawTracks.length > 0) {
    // playlist / album → trackList[].title + .subtitle
    tracks = rawTracks.map((t) => ({
      name: t.title ?? "",
      artist: t.subtitle ?? "",
    }));
  } else {
    // single track → entity.name + entity.artists[].name
    const artistNames: string = Array.isArray(entity.artists)
      ? entity.artists.map((a: { name: string }) => a.name).join(", ")
      : (entity.subtitle ?? "");
    tracks = [{ name: entity.name ?? "", artist: artistNames }];
  }

  return { name: entity.name ?? "", type: entity.type ?? kind, tracks };
}

function parseSpotifyUrl(url: string): { kind: string; id: string } {
  const m = url.match(/spotify\.com\/(track|playlist|album|episode)\/([A-Za-z0-9]+)/);
  if (!m) throw new Error("Could not parse Spotify URL");
  return { kind: m[1], id: m[2] };
}

async function downloadTrackFromYouTube(
  dl: InstanceType<typeof YTDlpWrap>,
  query: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const uid = randomUUID();
  const outputTemplate = join(config.downloadDir, `${uid}.%(ext)s`);
  const ytCookies = getYouTubeCookiesFile();
  const args = [
    `ytsearch1:${query}`, "-o", outputTemplate,
    "--no-warnings", "--restrict-filenames", "--no-playlist",
    // force web client — bypasses bot-detection on datacenter IPs
    "--extractor-args", "youtube:player_client=web",
    "-x", "--audio-format", "mp3", "--audio-quality", "0",
    "--embed-thumbnail", "--embed-metadata",
    ...(ytCookies ? ["--cookies", ytCookies] : []),
  ];
  await execDownload(dl, args, onProgress, signal);
  return findDownloadedFile(uid);
}

export async function downloadSpotifyTrack(
  spotifyUrl: string,
  opts: { onProgress?: (pct: number) => void; onStatus?: (msg: string) => void; signal?: AbortSignal },
): Promise<DownloadResult> {
  ensureDownloadDir();
  const dl = await getYtDlp();

  opts.onStatus?.("🔍 در حال دریافت اطلاعات آهنگ از Spotify...");
  const { kind, id } = parseSpotifyUrl(spotifyUrl);
  const embed = await fetchSpotifyEmbed(kind, id);

  // For a single track embed, the track itself is in trackList[0]; fall back to entity name.
  const first = embed.tracks[0];
  const trackName = first?.name || embed.name;
  const artist = first?.artist || "";
  const title = artist ? `${trackName} — ${artist}` : trackName;

  logger.info({ trackName, artist }, "Spotify track meta fetched");
  opts.onStatus?.(`🎵 یافت شد: <b>${trackName}</b>${artist ? ` — ${artist}` : ""}\n⬇️ در حال دانلود...`);

  const filePath = await downloadTrackFromYouTube(
    dl,
    `${trackName} ${artist} audio`,
    opts.onProgress,
    opts.signal,
  );
  if (!filePath) throw new Error("دانلود از یوتیوب ناموفق بود (فایلی پیدا نشد)");

  const fileSizeMb = getFileSizeMb(filePath);
  return { filePath, title, fileSizeMb };
}

export async function downloadSpotifyPlaylist(
  playlistUrl: string,
  opts: {
    onProgress?: (pct: number) => void;
    onStatus?: (msg: string) => void;
    onTrackDone?: (result: DownloadResult, index: number, total: number) => Promise<void>;
    signal?: AbortSignal;
  },
): Promise<void> {
  ensureDownloadDir();
  const dl = await getYtDlp();

  opts.onStatus?.("📋 در حال دریافت اطلاعات پلی‌لیست از Spotify...");

  const { kind, id } = parseSpotifyUrl(playlistUrl);
  const embed = await fetchSpotifyEmbed(kind, id);
  const tracks = embed.tracks;

  if (tracks.length === 0) throw new Error("هیچ آهنگی در پلی‌لیست یافت نشد");

  logger.info({ id, trackCount: tracks.length }, "Spotify playlist tracks fetched");
  opts.onStatus?.(`📋 <b>${embed.name}</b>\nتعداد آهنگ‌ها: <b>${tracks.length}</b>\n⬇️ شروع دانلود...`);

  let failedCount = 0;

  for (let i = 0; i < tracks.length; i++) {
    // Stop before starting the next track if the user cancelled.
    if (opts.signal?.aborted) {
      logger.info({ id, sentSoFar: i }, "Spotify playlist cancelled by user");
      break;
    }

    const track = tracks[i];
    const title = track.artist ? `${track.name} — ${track.artist}` : track.name;

    opts.onStatus?.(
      `⬇️ در حال دانلود آهنگ ${i + 1} از ${tracks.length}:\n<b>${track.name}</b>` +
      (failedCount > 0 ? `\n⚠️ ${failedCount} آهنگ ناموفق` : ""),
    );

    try {
      const filePath = await downloadTrackFromYouTube(
        dl,
        `${track.name} ${track.artist} audio`,
        undefined,
        opts.signal,
      );
      if (!filePath) {
        logger.warn({ track: track.name }, "No file found after download, skipping");
        failedCount++;
        continue;
      }
      const fileSizeMb = getFileSizeMb(filePath);
      await opts.onTrackDone?.({ filePath, title, fileSizeMb }, i + 1, tracks.length);
    } catch (err) {
      // A cancellation aborts the whole playlist, not just this track.
      if (opts.signal?.aborted || isCancelledError(err)) {
        logger.info({ id }, "Spotify playlist cancelled mid-track");
        break;
      }
      logger.warn({ err, track: track.name }, "Failed to download track, skipping");
      failedCount++;
    }
  }

  // Expose failed count for caller to display
  if (failedCount > 0) {
    opts.onStatus?.(`⚠️ ${failedCount} آهنگ از ${tracks.length} دانلود نشد (احتمالاً یوتیوب کوکی نیاز دارد)`);
  }
}
