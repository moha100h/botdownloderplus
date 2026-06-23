import YTDlpWrapModule from "yt-dlp-wrap";
import { join } from "path";
import { existsSync } from "fs";
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
): Promise<string | null> {
  const uid = randomUUID();
  const outputTemplate = join(config.downloadDir, `${uid}.%(ext)s`);
  const args = [
    `ytsearch1:${query}`, "-o", outputTemplate,
    "--no-warnings", "--restrict-filenames", "--no-playlist",
    "-x", "--audio-format", "mp3", "--audio-quality", "0",
    "--embed-thumbnail", "--embed-metadata",
  ];
  await execDownload(dl, args, onProgress);
  return findDownloadedFile(uid);
}

export async function downloadSpotifyTrack(
  spotifyUrl: string,
  opts: { onProgress?: (pct: number) => void; onStatus?: (msg: string) => void },
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

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const title = track.artist ? `${track.name} — ${track.artist}` : track.name;

    opts.onStatus?.(`⬇️ در حال دانلود آهنگ ${i + 1} از ${tracks.length}:\n${track.name}`);

    try {
      const filePath = await downloadTrackFromYouTube(dl, `${track.name} ${track.artist} audio`);
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
