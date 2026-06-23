import YTDlpWrapModule from "yt-dlp-wrap";
import { join } from "path";
import { randomUUID } from "crypto";
import { config } from "../config.js";
import { ensureDownloadDir, getFileSizeMb } from "./fileUtils.js";
import { logger } from "./logger.js";

// yt-dlp-wrap is CJS; the actual class lives at .default.default in ESM context
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

function buildYtdlpArgs(url: string, format: DownloadFormat, outputPath: string, maxFileSizeMb?: number): string[] {
  const sizeFlag = maxFileSizeMb ? [`--max-filesize`, `${maxFileSizeMb}M`] : [];
  const baseArgs = [url, "-o", outputPath, "--no-warnings", "--restrict-filenames", ...sizeFlag];

  switch (format) {
    case "mp3":
      return [
        ...baseArgs,
        "--no-playlist",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--embed-thumbnail",
        "--embed-metadata",
      ];
    case "mp4_360":
      return [
        ...baseArgs,
        "--no-playlist",
        "-f", "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]",
        "--merge-output-format", "mp4",
      ];
    case "mp4_720":
      return [
        ...baseArgs,
        "--no-playlist",
        "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
        "--merge-output-format", "mp4",
      ];
    case "mp4_1080":
      return [
        ...baseArgs,
        "--no-playlist",
        "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]",
        "--merge-output-format", "mp4",
      ];
    case "best":
    default:
      return [...baseArgs, "--no-playlist", "-f", "best", "--merge-output-format", "mp4"];
  }
}

async function execDownload(
  dl: InstanceType<typeof YTDlpWrap>,
  args: string[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  let lastPercent = 0;
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
    proc.on("error", reject);
    proc.on("close", () => resolve());
  });
}

export async function downloadMedia(opts: DownloadOptions): Promise<DownloadResult> {
  ensureDownloadDir();
  const dl = await getYtDlp();
  const uid = randomUUID();
  const ext = opts.format === "mp3" ? "mp3" : "mp4";
  const outputPath = join(config.downloadDir, `${uid}.%(ext)s`);
  const finalPath = join(config.downloadDir, `${uid}.${ext}`);

  const args = buildYtdlpArgs(opts.url, opts.format, outputPath, opts.maxFileSizeMb);
  await execDownload(dl, args, opts.onProgress);

  let title = "media";
  try {
    const info = await dl.getVideoInfo(opts.url);
    title = (info as Record<string, unknown>).title as string ?? "media";
  } catch { }

  const fileSizeMb = getFileSizeMb(finalPath);
  logger.info({ finalPath, fileSizeMb, title }, "Download complete");
  return { filePath: finalPath, title, fileSizeMb };
}

// ─── Spotify via oEmbed + YouTube Search ────────────────────────────────────

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

export async function downloadSpotifyTrack(
  spotifyUrl: string,
  opts: { onProgress?: (pct: number) => void; onStatus?: (msg: string) => void },
): Promise<DownloadResult> {
  ensureDownloadDir();
  const dl = await getYtDlp();

  opts.onStatus?.("🔍 در حال دریافت اطلاعات آهنگ از Spotify...");
  const info = await getSpotifyTrackInfo(spotifyUrl);
  const searchQuery = `ytsearch1:${info.title} ${info.author_name} official audio`;
  logger.info({ title: info.title, artist: info.author_name }, "Spotify track info fetched, searching YouTube");

  opts.onStatus?.(`🎵 یافت شد: <b>${info.title}</b> — ${info.author_name}\n⬇️ در حال دانلود...`);

  const uid = randomUUID();
  const outputPath = join(config.downloadDir, `${uid}.%(ext)s`);
  const finalPath = join(config.downloadDir, `${uid}.mp3`);

  const args = [
    searchQuery, "-o", outputPath,
    "--no-warnings", "--restrict-filenames", "--no-playlist",
    "-x", "--audio-format", "mp3", "--audio-quality", "0",
  ];

  await execDownload(dl, args, opts.onProgress);

  const fileSizeMb = getFileSizeMb(finalPath);
  return { filePath: finalPath, title: `${info.title} — ${info.author_name}`, fileSizeMb };
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

  opts.onStatus?.("📋 در حال دریافت اطلاعات پلی‌لیست...");

  let playlistTitle = "پلی‌لیست";
  try {
    const oEmbed = await getSpotifyTrackInfo(playlistUrl);
    playlistTitle = oEmbed.title;
  } catch { }

  // Use yt-dlp to extract playlist metadata from Spotify
  // Fall back: treat playlist as a collection of tracks via flat-playlist
  opts.onStatus?.(`🎵 پلی‌لیست: <b>${playlistTitle}</b>\n⏳ در حال آماده‌سازی...`);

  const uid = randomUUID();
  const outputPath = join(config.downloadDir, `${uid}-%(playlist_index)s.%(ext)s`);

  const args = [
    playlistUrl, "-o", outputPath,
    "--no-warnings", "--restrict-filenames",
    "-x", "--audio-format", "mp3", "--audio-quality", "0",
    "--yes-playlist",
    "--ignore-errors",
  ];

  // Track completed files
  const completedFiles: string[] = [];
  let trackCount = 0;

  await new Promise<void>((resolve, reject) => {
    const proc = dl.exec(args);
    proc.on("ytDlpEvent", (eventType: string, eventData: string) => {
      if (eventType === "download" && eventData.includes("Downloading item")) {
        const match = eventData.match(/Downloading item (\d+) of (\d+)/);
        if (match) {
          trackCount = Number(match[2]);
          const current = Number(match[1]);
          opts.onStatus?.(`⬇️ دانلود آهنگ ${current} از ${trackCount}...`);
        }
      }
    });
    proc.on("error", reject);
    proc.on("close", () => resolve());
  });

  // Find downloaded files
  const { readdirSync } = await import("fs");
  const files = readdirSync(config.downloadDir)
    .filter(f => f.startsWith(uid) && f.endsWith(".mp3"))
    .sort();

  for (let i = 0; i < files.length; i++) {
    const filePath = join(config.downloadDir, files[i]);
    const fileSizeMb = getFileSizeMb(filePath);
    await opts.onTrackDone?.({ filePath, title: `آهنگ ${i + 1}`, fileSizeMb }, i + 1, files.length);
  }
}
