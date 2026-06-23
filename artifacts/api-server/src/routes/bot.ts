import { Router, type IRouter } from "express";
import { spawn, type ChildProcess } from "child_process";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOT_DIR = resolve(__dirname, "../../../telegram-bot");
const ENV_PATH = resolve(BOT_DIR, ".env");
const STATE_PATH = resolve(BOT_DIR, ".bot-state.json");

interface BotState {
  botUsername?: string;
  botId?: number;
  adminId?: number;
  setupDone: boolean;
}

let botProcess: ChildProcess | null = null;

function readState(): BotState {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, "utf8")) as BotState;
    }
  } catch { /* ignore */ }
  return { setupDone: false };
}

function writeState(state: BotState): void {
  try {
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to write bot state");
  }
}

async function validateToken(token: string): Promise<{ id: number; username: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = (await res.json()) as { ok: boolean; result?: { id: number; username: string }; description?: string };
  if (!data.ok || !data.result) {
    throw new Error(data.description ?? "Invalid token");
  }
  return data.result;
}

function writeEnvFile(token: string, adminId: number, opts: { maxFileSizeMb?: number; rateLimitRequests?: number }): void {
  mkdirSync(BOT_DIR, { recursive: true });
  const content = [
    `# Telegram Bot Configuration — auto-generated`,
    `BOT_TOKEN=${token}`,
    `ADMIN_ID=${adminId}`,
    `DOWNLOAD_DIR=./downloads`,
    `MAX_FILE_SIZE_MB=${opts.maxFileSizeMb ?? 50}`,
    `RATE_LIMIT_REQUESTS=${opts.rateLimitRequests ?? 5}`,
    `RATE_LIMIT_WINDOW_MS=60000`,
    `LOG_LEVEL=info`,
    ``,
  ].join("\n");
  writeFileSync(ENV_PATH, content, "utf8");
}

function startBotProcess(): void {
  if (botProcess && !botProcess.killed) {
    botProcess.kill("SIGTERM");
    botProcess = null;
  }

  const proc = spawn(
    "pnpm",
    ["--filter", "@workspace/telegram-bot", "run", "dev"],
    {
      cwd: resolve(__dirname, "../../../.."),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production" },
    },
  );

  proc.stdout?.on("data", (d: Buffer) => {
    logger.info({ source: "bot" }, d.toString().trim());
  });
  proc.stderr?.on("data", (d: Buffer) => {
    logger.warn({ source: "bot" }, d.toString().trim());
  });
  proc.on("exit", (code) => {
    logger.info({ code }, "Bot process exited");
    if (botProcess === proc) botProcess = null;
  });

  botProcess = proc;
  logger.info({ pid: proc.pid }, "Bot process started");
}

function stopBotProcess(): void {
  if (botProcess && !botProcess.killed) {
    botProcess.kill("SIGTERM");
    botProcess = null;
  }
}

const router: IRouter = Router();

router.post("/bot/setup", async (req, res) => {
  const { token, adminId, maxFileSizeMb, rateLimitRequests } = req.body as {
    token?: string;
    adminId?: number;
    maxFileSizeMb?: number;
    rateLimitRequests?: number;
  };

  if (!token || typeof token !== "string" || !/^\d+:[A-Za-z0-9_-]{35,}$/.test(token)) {
    res.status(400).json({ error: "توکن نامعتبر است", details: "فرمت صحیح: 123456:ABC..." });
    return;
  }

  if (!adminId || typeof adminId !== "number" || adminId <= 0) {
    res.status(400).json({ error: "Admin ID نامعتبر است", details: "باید یک عدد مثبت باشد" });
    return;
  }

  try {
    const botInfo = await validateToken(token);

    writeEnvFile(token, adminId, { maxFileSizeMb, rateLimitRequests });

    const state: BotState = {
      botUsername: botInfo.username,
      botId: botInfo.id,
      adminId,
      setupDone: true,
    };
    writeState(state);

    startBotProcess();

    req.log.info({ botUsername: botInfo.username, adminId }, "Bot setup complete");
    res.json({
      success: true,
      botUsername: botInfo.username,
      botId: botInfo.id,
      message: `بات @${botInfo.username} با موفقیت راه‌اندازی شد!`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطای نامشخص";
    req.log.error({ err }, "Bot setup failed");
    res.status(400).json({ error: "خطا در راه‌اندازی بات", details: message });
  }
});

router.get("/bot/status", (_req, res) => {
  const state = readState();
  res.json({
    running: botProcess !== null && !botProcess.killed,
    setupDone: state.setupDone,
    botUsername: state.botUsername,
    adminId: state.adminId,
    pid: botProcess?.pid ?? undefined,
  });
});

router.post("/bot/stop", (_req, res) => {
  stopBotProcess();
  res.json({ success: true, message: "بات متوقف شد" });
});

router.post("/bot/restart", (req, res) => {
  if (!readState().setupDone) {
    res.status(400).json({ success: false, message: "ابتدا بات را راه‌اندازی کنید" });
    return;
  }
  startBotProcess();
  req.log.info("Bot restarted via API");
  res.json({ success: true, message: "بات مجدداً راه‌اندازی شد" });
});

export default router;
