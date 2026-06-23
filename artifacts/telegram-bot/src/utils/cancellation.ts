import { randomBytes } from "crypto";
import { InlineKeyboard } from "grammy";

/**
 * Lightweight per-download cancellation registry.
 *
 * Each download gets a short job id and an AbortController. The id is embedded
 * in an inline "cancel" button (callback_data `cancel:<id>`); pressing it aborts
 * the controller. Download routines receive the AbortSignal and stop ASAP:
 * yt-dlp child processes are killed, fetch() requests are aborted, and the
 * Spotify playlist loop breaks before the next track.
 */

const controllers = new Map<string, AbortController>();

/** Thrown when a download is cancelled by the user. */
export class CancelledError extends Error {
  code = "CANCELLED";
  constructor(message = "عملیات لغو شد") {
    super(message);
    this.name = "CancelledError";
  }
}

/** Detect cancellation across our own error, abort signals, and fetch AbortError. */
export function isCancelledError(err: unknown): boolean {
  if (err instanceof CancelledError) return true;
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: string; name?: string };
    if (e.code === "CANCELLED") return true;
    if (e.name === "AbortError") return true;
  }
  return false;
}

export function createCancelJob(): { jobId: string; signal: AbortSignal } {
  const jobId = randomBytes(4).toString("hex");
  const controller = new AbortController();
  controllers.set(jobId, controller);
  return { jobId, signal: controller.signal };
}

/** Returns true if the job existed and was cancelled, false if already gone. */
export function cancelJob(jobId: string): boolean {
  const controller = controllers.get(jobId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/** Remove a finished job from the registry. */
export function endCancelJob(jobId: string): void {
  controllers.delete(jobId);
}

/** Inline keyboard with a single cancel button for the given job. */
export function cancelKeyboard(jobId: string): InlineKeyboard {
  return new InlineKeyboard().text("❌ لغو دانلود", `cancel:${jobId}`);
}
