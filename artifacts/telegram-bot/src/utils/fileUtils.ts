import { mkdirSync, unlinkSync, existsSync, statSync, readdirSync } from "fs";
import { join } from "path";
import { config } from "../config.js";
import { logger } from "./logger.js";

export function ensureDownloadDir(): void {
  mkdirSync(config.downloadDir, { recursive: true });
}

export function deleteFile(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch (err) {
    logger.warn({ err, filePath }, "Failed to delete temp file");
  }
}

/** Delete a file after a delay (default 120s). Fire-and-forget. */
export function scheduleFileDeletion(filePath: string, delayMs = 120_000): void {
  setTimeout(() => deleteFile(filePath), delayMs);
}

export function getFileSizeMb(filePath: string): number {
  try {
    const stats = statSync(filePath);
    return stats.size / (1024 * 1024);
  } catch {
    return 0;
  }
}

/**
 * After yt-dlp finishes, find the actual output file by searching for any file
 * that starts with `uid`. yt-dlp may produce .mp4, .webm, .mkv, .mp3, etc.
 * Returns the found file path, or null if nothing found.
 */
export function findDownloadedFile(uid: string): string | null {
  try {
    const files = readdirSync(config.downloadDir).filter(
      (f) => f.startsWith(uid) && !f.endsWith(".part") && !f.endsWith(".ytdl"),
    );
    if (files.length === 0) return null;
    // prefer mp4 > mp3 > anything else
    const sorted = files.sort((a, b) => {
      const rank = (f: string) =>
        f.endsWith(".mp4") ? 0 : f.endsWith(".mp3") ? 1 : 2;
      return rank(a) - rank(b);
    });
    return join(config.downloadDir, sorted[0]);
  } catch {
    return null;
  }
}

export function cleanupOldFiles(maxAgeMs = 3_600_000): void {
  try {
    const now = Date.now();
    const files = readdirSync(config.downloadDir);
    for (const file of files) {
      const fp = join(config.downloadDir, file);
      try {
        const stats = statSync(fp);
        if (now - stats.mtimeMs > maxAgeMs) {
          unlinkSync(fp);
          logger.debug({ file }, "Cleaned up old file");
        }
      } catch { }
    }
  } catch (err) {
    logger.warn({ err }, "Error during cleanup");
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s\u0600-\u06FF.-]/g, "").replace(/\s+/g, "_").slice(0, 200);
}
