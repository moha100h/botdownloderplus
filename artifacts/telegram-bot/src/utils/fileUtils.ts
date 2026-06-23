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

export function getFileSizeMb(filePath: string): number {
  try {
    const stats = statSync(filePath);
    return stats.size / (1024 * 1024);
  } catch {
    return 0;
  }
}

export function cleanupOldFiles(maxAgeMs = 3_600_000): void {
  try {
    const now = Date.now();
    const files = readdirSync(config.downloadDir);
    for (const file of files) {
      const fp = join(config.downloadDir, file);
      const stats = statSync(fp);
      if (now - stats.mtimeMs > maxAgeMs) {
        unlinkSync(fp);
        logger.debug({ file }, "Cleaned up old file");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Error during cleanup");
  }
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s\u0600-\u06FF.-]/g, "").replace(/\s+/g, "_").slice(0, 200);
}
