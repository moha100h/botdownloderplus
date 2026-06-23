import YTDlpWrapModule from "yt-dlp-wrap";
import { join } from "path";
import { randomUUID } from "crypto";
import { config } from "../config.js";
import { ensureDownloadDir, getFileSizeMb, findDownloadedFile } from "./fileUtils.js";
import { logger } from "./logger.js";

// yt-dlp-wrap is CJS; the actual class lives at .default in ESM context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const YTDlpWrap: typeof YTDlpWrapModule = (YTDlpWrapModule as any).default ?? YTDlpWrapModule;

let ytDlp: InstanceType<typeof YTDlpWrap> | null = null;

export async function getYtDlp(): Promise<InstanceType<typeof YTDlpWrap>> {
  if (!ytDlp) {
    const binaryPath = join(config.downloadDir, ".yt-dlp-bin");
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
}

function buildYtdlpArgs(
  url: string,
  format: DownloadFormat,
  outputTemplate: string,
): string[] {
  const base = [
    url,
    "-o", outputTemplate,
    "--no-warnings",
    "--restrict-filenames",
    "--no-playlist",
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
): Promise<void> {
  let lastPercent = -1;
  await new Promise<void>((resolve, reject) => {
    const proc = dl.exec(args);
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
    proc.on("error", (err: Error) => reject(err));
    proc.on("close", () => resolve());
  });
}

export async function downloadMedia(opts: DownloadOptions): Promise<DownloadResult> {
  ensureDownloadDir();
  const dl = await getYtDlp();
  const uid = randomUUID();
  const outputTemplate = join(config.downloadDir, `${uid}.%(ext)s`);

  const args = buildYtdlpArgs(opts.url, opts.format, outputTemplate);
  logger.debug({ args }, "Starting yt-dlp");

  await execDownload(dl, args, opts.onProgress);

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

// ─── Radio Javan: resolve rj.app short links ─────────────────────────────────

/**
 * rj.app/m/XXX  →  play.radiojavan.com/song/SLUG  →  radiojavan.com/mp3s/mp3/SLUG
 * rj.app/v/XXX  →  play.radiojavan.com/video/SLUG →  radiojavan.com/videos/video/SLUG
 */
export async function resolveRjUrl(url: string): Promise<string> {
  if (!url.includes("rj.app")) return url;

  try {
    // Follow redirect without downloading body
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    const finalUrl = res.url;
    logger.info({ original: url, resolved: finalUrl }, "Resolved rj.app redirect");

    // Convert play.radiojavan.com/song/SLUG → radiojavan.com/mp3s/mp3/SLUG
    const songMatch = finalUrl.match(/play\.radiojavan\.com\/song\/([^?&#]+)/);
    if (songMatch) return `https://www.radiojavan.com/mp3s/mp3/${songMatch[1]}`;

    const videoMatch = finalUrl.match(/play\.radiojavan\.com\/video\/([^?&#]+)/);
    if (videoMatch) return `https://www.radiojavan.com/videos/video/${videoMatch[1]}`;

    const podcastMatch = finalUrl.match(/play\.radiojavan\.com\/podcast\/([^?&#]+)/);
    if (podcastMatch) return `https://www.radiojavan.com/podcasts/podcast/${podcastMatch[1]}`;

    // Fallback: return original resolved URL
    return finalUrl;
  } catch (err) {
    logger.warn({ err, url }, "Could not resolve rj.app URL, using original");
    return url;
  }
}

// ─── Spotify via oEmbed + YouTube Search ─────────────────────────────────────

interface SpotifyOEmbed {
  title: string;
  author_name: string;
  thumbnail_url?: string;
}

async function getSpotifyTrackInfo(spotifyUrl: string): Promise<SpotifyOEmbed> {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`);
  if (!res.ok) throw new Error(`Spotify oEmbed failed: ${res.status}`);
  return res.json() as Promise<SpotifyOEmbed>;
}

async function getSpotifyAnonymousToken(): Promise<string> {
  const res = await fetch(
    "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Cookie": "sp_t=1",
      },
    },
  );
  if (!res.ok) throw new Error(`Spotify token fetch failed: ${res.status}`);
  const data = await res.json() as { accessToken: string };
  return data.accessToken;
}

interface SpotifyTrack {
  name: string;
  artists: Array<{ name: string }>;
}

async function getPlaylistTracks(playlistId: string, token: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=next,items(track(name,artists))&limit=50`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
    const data = await res.json() as {
      items: Array<{ track: SpotifyTrack | null }>;
      next: string | null;
    };
    for (const item of data.items) {
      if (item.track) tracks.push(item.track);
    }
    url = data.next;
  }
  return tracks;
}

export async function downloadSpotifyTrack(
  spotifyUrl: string,
  opts: { onProgress?: (pct: number) => void; onStatus?: (msg: string) => void },
): Promise<DownloadResult> {
  ensureDownloadDir();
  const dl = await getYtDlp();

  opts.onStatus?.("🔍 در حال دریافت اطلاعات آهنگ از Spotify...");
  const info = await getSpotifyTrackInfo(spotifyUrl);
  const searchQuery = `ytsearch1:${info.title} ${info.author_name} official audio`;
  logger.info({ title: info.title, artist: info.author_name }, "Spotify track info fetched");

  opts.onStatus?.(`🎵 یافت شد: <b>${info.title}</b> — ${info.author_name}\n⬇️ در حال دانلود...`);

  const uid = randomUUID();
  const outputTemplate = join(config.downloadDir, `${uid}.%(ext)s`);

  const args = [
    searchQuery, "-o", outputTemplate,
    "--no-warnings", "--restrict-filenames", "--no-playlist",
    "-x", "--audio-format", "mp3", "--audio-quality", "0",
  ];

  await execDownload(dl, args, opts.onProgress);

  const filePath = findDownloadedFile(uid);
  if (!filePath) throw new Error("yt-dlp completed but no output file found for Spotify track");

  const fileSizeMb = getFileSizeMb(filePath);
  return { filePath, title: `${info.title} — ${info.author_name}`, fileSizeMb };
}

export async function downloadSpotifyPlaylist(
  playlistUrl: string,
  opts: {
    onProgress?: (pct: number) => void;
    onStatus?: (msg: string) => void;
    onTrackDone?: (result: DownloadResult, index: number, total: number) => Promise<void>;
  },
): Promise<void> {
  ensureDownloadDir();
  const dl = await getYtDlp();

  opts.onStatus?.("📋 در حال دریافت اطلاعات پلی‌لیست از Spotify...");

  // Extract playlist ID from URL
  const idMatch = playlistUrl.match(/playlist\/([A-Za-z0-9]+)/);
  if (!idMatch) throw new Error("Could not extract Spotify playlist ID from URL");
  const playlistId = idMatch[1];

  // Get anonymous token + playlist tracks
  const token = await getSpotifyAnonymousToken();
  const tracks = await getPlaylistTracks(playlistId, token);

  if (tracks.length === 0) throw new Error("No tracks found in Spotify playlist");

  logger.info({ playlistId, trackCount: tracks.length }, "Spotify playlist tracks fetched");
  opts.onStatus?.(`📋 تعداد آهنگ‌ها: <b>${tracks.length}</b>\n⬇️ شروع دانلود...`);

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const artistName = track.artists.map((a) => a.name).join(", ");
    const searchQuery = `ytsearch1:${track.name} ${artistName} audio`;
    const title = `${track.name} — ${artistName}`;

    opts.onStatus?.(`⬇️ در حال دانلود آهنگ ${i + 1} از ${tracks.length}: ${track.name}`);

    try {
      const uid = randomUUID();
      const outputTemplate = join(config.downloadDir, `${uid}.%(ext)s`);

      const args = [
        searchQuery, "-o", outputTemplate,
        "--no-warnings", "--restrict-filenames", "--no-playlist",
        "-x", "--audio-format", "mp3", "--audio-quality", "0",
      ];

      await execDownload(dl, args, undefined);

      const filePath = findDownloadedFile(uid);
      if (!filePath) {
        logger.warn({ track: track.name }, "No file found after download, skipping");
        continue;
      }

      const fileSizeMb = getFileSizeMb(filePath);
      await opts.onTrackDone?.({ filePath, title, fileSizeMb }, i + 1, tracks.length);
    } catch (err) {
      logger.warn({ err, track: track.name }, "Failed to download track, skipping");
    }
  }
}
