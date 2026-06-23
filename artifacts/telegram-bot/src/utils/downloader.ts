import YTDlpWrap from "yt-dlp-wrap";
import { join } from "path";
import { randomUUID } from "crypto";
import { config } from "../config.js";
import { ensureDownloadDir, getFileSizeMb } from "./fileUtils.js";
import { logger } from "./logger.js";

let ytDlp: YTDlpWrap | null = null;

export async function getYtDlp(): Promise<YTDlpWrap> {
  if (!ytDlp) {
    const binaryPath = join(config.downloadDir, ".yt-dlp-bin");
    ytDlp = new YTDlpWrap(binaryPath);
    try {
      await YTDlpWrap.downloadFromGithub(binaryPath);
      logger.info("yt-dlp binary downloaded");
    } catch (err) {
      logger.warn({ err }, "Could not download yt-dlp binary, using system yt-dlp if available");
      ytDlp = new YTDlpWrap();
    }
  }
  return ytDlp;
}

export type DownloadFormat = "mp3" | "mp4_360" | "mp4_720" | "mp4_1080" | "best";

interface DownloadResult {
  filePath: string;
  title: string;
  fileSizeMb: number;
}

interface DownloadOptions {
  url: string;
  format: DownloadFormat;
  onProgress?: (percent: number) => void;
}

function buildYtdlpArgs(url: string, format: DownloadFormat, outputPath: string): string[] {
  const baseArgs = [url, "-o", outputPath, "--no-playlist", "--no-warnings", "--restrict-filenames"];

  switch (format) {
    case "mp3":
      return [
        ...baseArgs,
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--embed-thumbnail",
        "--embed-metadata",
      ];
    case "mp4_360":
      return [
        ...baseArgs,
        "-f", "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]",
        "--merge-output-format", "mp4",
      ];
    case "mp4_720":
      return [
        ...baseArgs,
        "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
        "--merge-output-format", "mp4",
      ];
    case "mp4_1080":
      return [
        ...baseArgs,
        "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]",
        "--merge-output-format", "mp4",
      ];
    case "best":
    default:
      return [...baseArgs, "-f", "best", "--merge-output-format", "mp4"];
  }
}

export async function downloadMedia(opts: DownloadOptions): Promise<DownloadResult> {
  ensureDownloadDir();
  const dl = await getYtDlp();
  const uid = randomUUID();
  const ext = opts.format === "mp3" ? "mp3" : "mp4";
  const outputPath = join(config.downloadDir, `${uid}.%(ext)s`);
  const finalPath = join(config.downloadDir, `${uid}.${ext}`);

  const args = buildYtdlpArgs(opts.url, opts.format, outputPath);

  let lastPercent = 0;

  await new Promise<void>((resolve, reject) => {
    const process = dl.exec(args);

    process.on("ytDlpEvent", (eventType: string, eventData: string) => {
      if (eventType === "download" && eventData.includes("%")) {
        const match = eventData.match(/(\d+(?:\.\d+)?)%/);
        if (match) {
          const pct = Math.floor(Number(match[1]));
          if (pct !== lastPercent && pct % 10 === 0) {
            lastPercent = pct;
            opts.onProgress?.(pct);
          }
        }
      }
    });

    process.on("error", reject);
    process.on("close", () => resolve());
  });

  let title = "media";
  try {
    const info = await dl.getVideoInfo(opts.url);
    title = (info as Record<string, unknown>).title as string ?? "media";
  } catch {
    // ignore
  }

  const fileSizeMb = getFileSizeMb(finalPath);
  logger.info({ finalPath, fileSizeMb, title }, "Download complete");

  return { filePath: finalPath, title, fileSizeMb };
}

export async function getMediaInfo(url: string): Promise<{ title: string; duration: number; thumbnail?: string }> {
  const dl = await getYtDlp();
  const info = await dl.getVideoInfo(url);
  const i = info as Record<string, unknown>;
  return {
    title: (i.title as string) ?? "Unknown",
    duration: (i.duration as number) ?? 0,
    thumbnail: (i.thumbnail as string) ?? undefined,
  };
}
