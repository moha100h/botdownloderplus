import { join } from "path";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { spawn } from "child_process";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { config } from "../config.js";
import { ensureDownloadDir, getFileSizeMb, findDownloadedFile } from "./fileUtils.js";
import { logger } from "./logger.js";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  "Accept": "application/json, text/plain, */*",
};

export type RjType = "mp3" | "video" | "podcast";

export interface RjResolved {
  type: RjType;
  slug: string;
}

/**
 * Resolve any Radio Javan URL (rj.app short link, play.radiojavan.com, radiojavan.com)
 * into a { type, slug } pair usable with the RJ API.
 */
export async function resolveRadioJavan(url: string): Promise<RjResolved> {
  let finalUrl = url;

  // rj.app/m/CODE and rj.app/v/CODE are short links protected by Cloudflare.
  // The play.radiojavan.com short-link API resolves them (308 → Location header).
  const shortMatch = url.match(/(?:rj\.app|play\.radiojavan\.com)\/([mv])\/([A-Za-z0-9_-]+)/);
  if (shortMatch) {
    const [, kind, code] = shortMatch;
    try {
      const apiUrl = `https://play.radiojavan.com/api/short-link/${kind}/${code}`;
      const res = await fetch(apiUrl, { redirect: "manual", headers: BROWSER_HEADERS });
      const location = res.headers.get("location");
      if (location) {
        finalUrl = location;
        logger.info({ url, finalUrl }, "Resolved RJ short link via API");
      }
    } catch (err) {
      logger.warn({ err, url }, "Failed to resolve RJ short link");
    }
  }

  // Match known URL shapes → type + slug
  const patterns: Array<{ re: RegExp; type: RjType }> = [
    { re: /play\.radiojavan\.com\/song\/([^?&#/]+)/, type: "mp3" },
    { re: /play\.radiojavan\.com\/video\/([^?&#/]+)/, type: "video" },
    { re: /play\.radiojavan\.com\/podcast\/([^?&#/]+)/, type: "podcast" },
    { re: /radiojavan\.com\/mp3s\/mp3\/([^?&#/]+)/, type: "mp3" },
    { re: /radiojavan\.com\/videos\/video\/([^?&#/]+)/, type: "video" },
    { re: /radiojavan\.com\/podcasts\/podcast\/([^?&#/]+)/, type: "podcast" },
  ];

  for (const { re, type } of patterns) {
    const m = finalUrl.match(re);
    if (m) return { type, slug: decodeURIComponent(m[1]) };
  }

  throw new Error(`Could not resolve Radio Javan URL: ${finalUrl}`);
}

interface RjApiResponse {
  title?: string;
  artist?: string;
  link?: string;       // mp3 / hls
  hq_link?: string;    // higher quality (m4a for songs, hd for video)
  hq_hls?: string;
  lq_link?: string;
  song?: string;
  [key: string]: unknown;
}

async function fetchRjApi(type: RjType, slug: string): Promise<RjApiResponse> {
  const endpoint =
    type === "mp3"
      ? `https://play.radiojavan.com/api/p/mp3?id=${encodeURIComponent(slug)}`
      : type === "video"
        ? `https://play.radiojavan.com/api/p/video?id=${encodeURIComponent(slug)}`
        : `https://play.radiojavan.com/api/p/podcast?id=${encodeURIComponent(slug)}`;

  const res = await fetch(endpoint, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`RJ API error ${res.status} for ${type}/${slug}`);
  const data = await res.json() as RjApiResponse;
  if (!data || Object.keys(data).length === 0) {
    throw new Error(`RJ API returned empty data for ${type}/${slug}`);
  }
  return data;
}

/** Download a direct file URL to disk via streaming. */
async function downloadDirect(fileUrl: string, outputPath: string): Promise<void> {
  const res = await fetch(fileUrl, { headers: BROWSER_HEADERS });
  if (!res.ok || !res.body) throw new Error(`Direct download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(outputPath));
}

/** Extract the audio track from a video file into an MP3 using ffmpeg. */
async function extractAudioToMp3(videoPath: string, mp3Path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-vn",
      "-acodec", "libmp3lame",
      "-q:a", "2",
      mp3Path,
    ]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg audio extraction failed (code ${code}): ${stderr.slice(-300)}`));
    });
  });
}

export interface RjDownloadResult {
  filePath: string;
  title: string;
  fileSizeMb: number;
  type: RjType;
}

/**
 * Download a Radio Javan track/video using the official RJ API (no yt-dlp,
 * bypasses Cloudflare). `preferredFormat` controls mp3-vs-video selection.
 */
export async function downloadRadioJavan(
  url: string,
  preferredFormat: "mp3" | "video",
): Promise<RjDownloadResult> {
  ensureDownloadDir();

  const resolved = await resolveRadioJavan(url);

  const data = await fetchRjApi(resolved.type, resolved.slug);

  const title =
    (data.title as string) ||
    (data.song as string) ||
    resolved.slug.replace(/-/g, " ");

  // Pick the best available direct link
  let fileUrl: string | undefined;
  let ext = "mp3";

  if (resolved.type === "video") {
    fileUrl = (data.hq_link as string) || (data.link as string) || (data.lq_link as string);
    ext = "mp4";
  } else {
    // mp3 / podcast — prefer standard mp3 link (hq_link is often .m4a)
    fileUrl = (data.link as string) || (data.hq_link as string);
    ext = (fileUrl && fileUrl.includes(".m4a")) ? "m4a" : "mp3";
  }

  if (!fileUrl) {
    throw new Error("No downloadable link found in RJ API response");
  }

  const uid = randomUUID();
  const outputPath = join(config.downloadDir, `${uid}.${ext}`);

  logger.info({ slug: resolved.slug, type: resolved.type, fileUrl }, "Downloading from RJ direct link");
  await downloadDirect(fileUrl, outputPath);

  const downloadedPath = findDownloadedFile(uid) ?? outputPath;

  // Honour the requested format: if the source is a video but the user asked
  // for MP3, extract the audio track with ffmpeg and deliver that instead.
  if (resolved.type === "video" && preferredFormat === "mp3") {
    const mp3Path = join(config.downloadDir, `${uid}.mp3`);
    logger.info({ slug: resolved.slug }, "Extracting audio from RJ video to MP3");
    await extractAudioToMp3(downloadedPath, mp3Path);
    await unlink(downloadedPath).catch(() => {});
    const fileSizeMb = getFileSizeMb(mp3Path);
    return { filePath: mp3Path, title, fileSizeMb, type: "mp3" };
  }

  const fileSizeMb = getFileSizeMb(downloadedPath);
  return { filePath: downloadedPath, title, fileSizeMb, type: resolved.type };
}
