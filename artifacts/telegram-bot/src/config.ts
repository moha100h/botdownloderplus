import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../.env") });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// When a self-hosted Bot API server is configured, bots can upload files up to
// ~2000 MB instead of the cloud Bot API's 50 MB limit.
const botApiServerUrl = optional("BOT_API_SERVER_URL", "").trim();

export const config = {
  botToken: required("BOT_TOKEN"),
  adminId: Number(required("ADMIN_ID")),
  downloadDir: resolve(__dirname, "../", optional("DOWNLOAD_DIR", "./downloads")),
  maxFileSizeMb: Number(optional("MAX_FILE_SIZE_MB", "50")),
  rateLimitRequests: Number(optional("RATE_LIMIT_REQUESTS", "5")),
  rateLimitWindowMs: Number(optional("RATE_LIMIT_WINDOW_MS", "60000")),
  logLevel: optional("LOG_LEVEL", "info"),
  // Empty string => use the default Telegram cloud API.
  botApiServerUrl,
  useLocalBotApi: botApiServerUrl.length > 0,
} as const;
