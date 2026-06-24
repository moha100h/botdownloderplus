#!/usr/bin/env bash
###############################################################################
#  BotDownloaderPlus — نصب و راه‌اندازی خودکار
#  اجرا:  bash install.sh
#  نسخه:  2.0
###############################################################################
set -euo pipefail
IFS=$'\n\t'

# ── رنگ‌ها ────────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' NC='\033[0m'
log_info()    { echo -e "${C}[INFO]${NC}  $*"; }
log_ok()      { echo -e "${G}[ OK ]${NC}  $*"; }
log_warn()    { echo -e "${Y}[WARN]${NC}  $*"; }
log_error()   { echo -e "${R}[ERR ]${NC}  $*"; exit 1; }
log_step()    { echo -e "\n${B}━━━  $*  ━━━${NC}"; }

WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$WORKSPACE/artifacts/telegram-bot"
LOGS_DIR="$WORKSPACE/logs"
DOWNLOADS_DIR="$BOT_DIR/downloads"

# ── بنر ───────────────────────────────────────────────────────────────────────
clear
echo ""
echo -e "${B}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${B}║        BotDownloaderPlus — Installer v2          ║${NC}"
echo -e "${B}║  دانلود از YouTube ▪ Spotify ▪ Instagram ▪ RJ   ║${NC}"
echo -e "${B}╚══════════════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# ── توابع کمکی ───────────────────────────────────────────────────────────────
###############################################################################

# خواندن ورودی اجباری (مخفی یا نمایان)
ask_required() {
    local label="$1" varname="$2" secret="${3:-no}"
    local val=""
    while [[ -z "$val" ]]; do
        if [[ "$secret" == "yes" ]]; then
            read -rsp "  ▸ $label: " val; echo ""
        else
            read -rp  "  ▸ $label: " val
        fi
        [[ -z "$val" ]] && echo -e "  ${Y}⚠  این فیلد اجباری است.${NC}"
    done
    printf -v "$varname" '%s' "$val"
}

# نوشتن یا به‌روزرسانی یک متغیر در فایل .env
set_env_var() {
    local file="$1" key="$2" val="$3"
    if grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$file"
    else
        echo "${key}=${val}" >> "$file"
    fi
}

# بررسی اینکه آیا دستور وجود دارد
has_cmd() { command -v "$1" &>/dev/null; }

###############################################################################
# ── مرحله ۱: نصب خودکار پیش‌نیازهای سیستم ──────────────────────────────────
###############################################################################
log_step "مرحله ۱ — نصب پیش‌نیازهای سیستم"

# تشخیص سیستم‌عامل
if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    OS_ID="${ID:-unknown}"
else
    OS_ID="unknown"
fi

install_pkg() {
    # نصب بسته‌های سیستمی بر اساس distro
    case "$OS_ID" in
        ubuntu|debian|linuxmint|pop)
            sudo apt-get update -qq
            sudo apt-get install -y -qq "$@"
            ;;
        centos|rhel|fedora|rocky|almalinux)
            if has_cmd dnf; then sudo dnf install -y "$@"
            else sudo yum install -y "$@"; fi
            ;;
        arch|manjaro)
            sudo pacman -Sy --noconfirm "$@"
            ;;
        *)
            log_warn "توزیع ناشناخته ($OS_ID). لطفاً $* را دستی نصب کنید."
            ;;
    esac
}

# ── curl ──────────────────────────────────────────────────────────────────────
if ! has_cmd curl; then
    log_info "نصب curl..."
    install_pkg curl
fi
log_ok "curl: $(curl --version | head -1 | cut -d' ' -f1-2)"

# ── Python 3 ──────────────────────────────────────────────────────────────────
if ! has_cmd python3; then
    log_info "نصب Python3..."
    install_pkg python3
fi
log_ok "Python: $(python3 --version)"

# ── FFmpeg ────────────────────────────────────────────────────────────────────
if ! has_cmd ffmpeg; then
    log_info "نصب FFmpeg..."
    install_pkg ffmpeg
fi
log_ok "FFmpeg: $(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f1-3)"

# ── Node.js (≥18) ─────────────────────────────────────────────────────────────
NODE_OK=false
if has_cmd node; then
    NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
    [[ "$NODE_MAJOR" -ge 18 ]] && NODE_OK=true
fi

if [[ "$NODE_OK" == "false" ]]; then
    log_info "نصب Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
    install_pkg nodejs
    hash -r
fi
log_ok "Node.js: $(node --version)"

# ── pnpm ──────────────────────────────────────────────────────────────────────
if ! has_cmd pnpm; then
    log_info "نصب pnpm..."
    npm install -g pnpm --quiet
    hash -r
fi
log_ok "pnpm: $(pnpm --version)"

# ── yt-dlp ────────────────────────────────────────────────────────────────────
YTDLP_BIN="$DOWNLOADS_DIR/.yt-dlp-bin"
mkdir -p "$DOWNLOADS_DIR"

if [[ ! -f "$YTDLP_BIN" ]] || [[ ! -x "$YTDLP_BIN" ]]; then
    log_info "دانلود yt-dlp..."
    curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
         -o "$YTDLP_BIN"
    chmod +x "$YTDLP_BIN"
fi
log_ok "yt-dlp: $("$YTDLP_BIN" --version 2>/dev/null || echo 'OK')"

# ── telegram-bot-api (اختیاری، برای رفع محدودیت ۵۰MB) ───────────────────────
HAS_TBA=false
if has_cmd telegram-bot-api; then
    HAS_TBA=true
    log_ok "telegram-bot-api: موجود است (محدودیت ۲GB)"
else
    log_warn "telegram-bot-api نصب نیست — محدودیت ۵۰MB اعمال می‌شود"
fi

###############################################################################
# ── مرحله ۲: دریافت ۴ ورودی ضروری ─────────────────────────────────────────
###############################################################################
log_step "مرحله ۲ — وارد کردن اطلاعات ضروری"

echo ""
echo -e "  ${Y}فقط ۴ ورودی نیاز است:${NC}"
echo ""

# ── توکن بات ─────────────────────────────────────────────────────────────────
echo -e "  ${C}① توکن بات تلگرام${NC}"
echo "     از @BotFather بگیرید: /newbot  →  کپی توکن"
ask_required "BOT_TOKEN" BOT_TOKEN "yes"

# اعتبارسنجی فرمت توکن
if ! echo "$BOT_TOKEN" | grep -qE '^[0-9]{7,12}:[A-Za-z0-9_-]{35,}$'; then
    log_error "فرمت توکن اشتباه است. مثال صحیح: 7123456789:AAFooBar..."
fi

# تأیید توکن با API تلگرام
log_info "تأیید توکن از طریق Telegram API..."
TG_RESP=$(curl -fsSL "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null || echo '{"ok":false}')
TG_OK=$(echo "$TG_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('ok') else 'no')" 2>/dev/null || echo "no")
if [[ "$TG_OK" != "yes" ]]; then
    log_error "توکن نامعتبر است یا اینترنت در دسترس نیست. لطفاً توکن را بررسی کنید."
fi
BOT_USERNAME=$(echo "$TG_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result']['username'])" 2>/dev/null || echo "bot")
log_ok "بات @${BOT_USERNAME} تأیید شد"

# ── شناسه ادمین ───────────────────────────────────────────────────────────────
echo ""
echo -e "  ${C}② شناسه عددی ادمین${NC}"
echo "     از @userinfobot بگیرید — فقط عدد وارد کنید"
ask_required "ADMIN_ID (عدد)" ADMIN_ID "no"
if ! echo "$ADMIN_ID" | grep -qE '^[0-9]+$'; then
    log_error "ADMIN_ID باید فقط عدد باشد (مثال: 123456789)"
fi

# ── Telegram API ID ───────────────────────────────────────────────────────────
echo ""
echo -e "  ${C}③ Telegram API ID${NC}"
echo "     از https://my.telegram.org  →  API development tools"
ask_required "API_ID (عدد)" TELEGRAM_API_ID "no"
if ! echo "$TELEGRAM_API_ID" | grep -qE '^[0-9]+$'; then
    log_error "API_ID باید فقط عدد باشد"
fi

# ── Telegram API Hash ─────────────────────────────────────────────────────────
echo ""
echo -e "  ${C}④ Telegram API Hash${NC}"
echo "     از همان صفحه my.telegram.org — رشته ۳۲ کاراکتری"
ask_required "API_HASH" TELEGRAM_API_HASH "yes"
if ! echo "$TELEGRAM_API_HASH" | grep -qE '^[a-fA-F0-9]{32}$'; then
    log_error "API_HASH باید ۳۲ کاراکتر hex باشد"
fi

###############################################################################
# ── مرحله ۳: گرفتن کوکی YouTube (خودکار) ────────────────────────────────────
###############################################################################
log_step "مرحله ۳ — تهیه کوکی YouTube (برای Spotify + YouTube)"

YT_COOKIES_FILE="$DOWNLOADS_DIR/.youtube-cookies.txt"
COOKIES_OK=false

# روش A: اگر قبلاً فایل کوکی وجود داشته باشد
if [[ -f "$YT_COOKIES_FILE" ]] && [[ -s "$YT_COOKIES_FILE" ]]; then
    log_ok "فایل کوکی YouTube از قبل موجود است"
    COOKIES_OK=true
fi

# روش B: استخراج از مرورگر نصب‌شده روی سرور
if [[ "$COOKIES_OK" == "false" ]]; then
    for BROWSER in chrome chromium firefox; do
        if has_cmd "$BROWSER" 2>/dev/null || [[ -f "/usr/bin/$BROWSER" ]] || [[ -f "/snap/bin/$BROWSER" ]]; then
            log_info "تلاش برای استخراج کوکی از $BROWSER..."
            if "$YTDLP_BIN" \
                --cookies-from-browser "$BROWSER" \
                --skip-download \
                --quiet \
                -o /dev/null \
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
                --cookies "$YT_COOKIES_FILE" 2>/dev/null; then
                log_ok "کوکی YouTube از $BROWSER استخراج شد"
                chmod 600 "$YT_COOKIES_FILE"
                COOKIES_OK=true
                break
            fi
        fi
    done
fi

# روش C: اگر فایل cookies.txt در کنار install.sh وجود داشته باشد
if [[ "$COOKIES_OK" == "false" ]]; then
    for CANDIDATE in \
        "$WORKSPACE/youtube.com_cookies.txt" \
        "$WORKSPACE/cookies.txt" \
        "$HOME/youtube.com_cookies.txt" \
        "$HOME/cookies.txt"; do
        if [[ -f "$CANDIDATE" ]] && [[ -s "$CANDIDATE" ]]; then
            cp "$CANDIDATE" "$YT_COOKIES_FILE"
            chmod 600 "$YT_COOKIES_FILE"
            log_ok "کوکی YouTube از $CANDIDATE کپی شد"
            COOKIES_OK=true
            break
        fi
    done
fi

# اطلاع‌رسانی در صورت نبود کوکی
if [[ "$COOKIES_OK" == "false" ]]; then
    echo ""
    echo -e "  ${Y}┌─────────────────────────────────────────────────────┐${NC}"
    echo -e "  ${Y}│  کوکی YouTube پیدا نشد — YouTube و Spotify کار      │${NC}"
    echo -e "  ${Y}│  نخواهند کرد تا کوکی اضافه شود.                     │${NC}"
    echo -e "  ${Y}│                                                       │${NC}"
    echo -e "  ${Y}│  بعد از نصب، از داخل تلگرام کوکی بفرستید:           │${NC}"
    echo -e "  ${Y}│  فایل cookies.txt → ادمین بات → caption:             │${NC}"
    echo -e "  ${Y}│  setcookies youtube                                   │${NC}"
    echo -e "  ${Y}│                                                       │${NC}"
    echo -e "  ${Y}│  یا فایل را اینجا کپی کنید و install.sh را مجدد      │${NC}"
    echo -e "  ${Y}│  اجرا کنید:                                           │${NC}"
    echo -e "  ${Y}│  $WORKSPACE/youtube.com_cookies.txt  │${NC}"
    echo -e "  ${Y}└─────────────────────────────────────────────────────┘${NC}"
    echo ""
    read -rp "  ادامه بدون کوکی؟ (y/N): " SKIP_COOKIES
    case "$SKIP_COOKIES" in
        [yY]) log_warn "نصب بدون کوکی YouTube ادامه می‌یابد..." ;;
        *) echo "نصب لغو شد. فایل cookies.txt را آماده کنید و مجدد اجرا کنید."; exit 0 ;;
    esac
fi

###############################################################################
# ── مرحله ۴: ایجاد فایل .env ────────────────────────────────────────────────
###############################################################################
log_step "مرحله ۴ — ایجاد فایل پیکربندی .env"

mkdir -p "$BOT_DIR" "$DOWNLOADS_DIR" "$LOGS_DIR"

# Bot API Server URL (اگر telegram-bot-api نصب باشه)
if [[ "$HAS_TBA" == "true" ]]; then
    BOT_API_SERVER_URL="http://localhost:9090"
    MAX_FILE_SIZE_MB="2000"
else
    BOT_API_SERVER_URL=""
    MAX_FILE_SIZE_MB="50"
fi

# ساخت .env اصلی بات
cat > "$BOT_DIR/.env" << ENVEOF
# BotDownloaderPlus — auto-generated by install.sh
# $(date -u '+%Y-%m-%d %H:%M:%S UTC')

BOT_TOKEN=${BOT_TOKEN}
ADMIN_ID=${ADMIN_ID}

TELEGRAM_API_ID=${TELEGRAM_API_ID}
TELEGRAM_API_HASH=${TELEGRAM_API_HASH}

DOWNLOAD_DIR=./downloads
MAX_FILE_SIZE_MB=${MAX_FILE_SIZE_MB}
RATE_LIMIT_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
LOG_LEVEL=info
ENVEOF

# اضافه کردن Bot API Server URL اگر تنظیم شده
if [[ -n "$BOT_API_SERVER_URL" ]]; then
    echo "BOT_API_SERVER_URL=${BOT_API_SERVER_URL}" >> "$BOT_DIR/.env"
fi

chmod 600 "$BOT_DIR/.env"
log_ok "فایل $BOT_DIR/.env ایجاد شد"

# ثبت وضعیت بات
cat > "$BOT_DIR/.bot-state.json" << STATEEOF
{
  "setupDone": true,
  "botUsername": "@${BOT_USERNAME}",
  "adminId": ${ADMIN_ID},
  "configuredAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
STATEEOF

###############################################################################
# ── مرحله ۵: نصب وابستگی‌های Node.js ────────────────────────────────────────
###############################################################################
log_step "مرحله ۵ — نصب وابستگی‌های Node.js"

cd "$WORKSPACE"

log_info "اجرای pnpm install..."
pnpm install --no-frozen-lockfile 2>&1 | tail -5 || pnpm install
log_ok "وابستگی‌ها نصب شدند"

###############################################################################
# ── مرحله ۶: ساخت پروژه ─────────────────────────────────────────────────────
###############################################################################
log_step "مرحله ۶ — ساخت پروژه (TypeScript Build)"

# اگر codegen وجود داشت اجرا کن
if pnpm ls --filter @workspace/api-spec 2>/dev/null | grep -q api-spec; then
    log_info "اجرای codegen..."
    pnpm --filter @workspace/api-spec run codegen 2>/dev/null && log_ok "codegen انجام شد" || log_warn "codegen ناموفق بود (اختیاری)"
fi

# ساخت API سرور
if [[ -f "$WORKSPACE/artifacts/api-server/package.json" ]]; then
    log_info "ساخت API سرور..."
    pnpm --filter @workspace/api-server run build 2>&1 | tail -3
    log_ok "API سرور ساخته شد"
fi

###############################################################################
# ── مرحله ۷: ایجاد اسکریپت start.sh ─────────────────────────────────────────
###############################################################################
log_step "مرحله ۷ — ایجاد اسکریپت start.sh"

cat > "$WORKSPACE/start.sh" << 'STARTSCRIPT'
#!/usr/bin/env bash
###############################################################################
#  BotDownloaderPlus — راه‌اندازی سرویس‌ها
#  اجرا: bash start.sh
###############################################################################
set -euo pipefail

WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$WORKSPACE/artifacts/telegram-bot"
LOGS_DIR="$WORKSPACE/logs"
mkdir -p "$LOGS_DIR"

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' NC='\033[0m'
ok()   { echo -e "${G}[ OK ]${NC} $*"; }
info() { echo -e "${C}[INFO]${NC} $*"; }
warn() { echo -e "${Y}[WARN]${NC} $*"; }

# بارگذاری .env بات
if [[ -f "$BOT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source <(grep -v '^#' "$BOT_DIR/.env" | grep -v '^$')
    set +a
fi

echo ""
echo "━━━  BotDownloaderPlus — راه‌اندازی  ━━━"
echo ""

# توقف سرویس‌های قدیمی
info "توقف سرویس‌های قبلی..."
pkill -f "tsx.*src/index" 2>/dev/null || true
pkill -f "telegram-bot-api" 2>/dev/null || true
sleep 1

# ── راه‌اندازی telegram-bot-api (اگر نصب باشه) ──────────────────────────────
if command -v telegram-bot-api &>/dev/null && \
   [[ -n "${TELEGRAM_API_ID:-}" ]] && \
   [[ -n "${TELEGRAM_API_HASH:-}" ]]; then

    TBA_DIR="$BOT_DIR/.tba-data"
    mkdir -p "$TBA_DIR"
    info "راه‌اندازی telegram-bot-api (محدودیت ۲GB)..."
    nohup telegram-bot-api \
        --local \
        --http-port=9090 \
        --api-id="${TELEGRAM_API_ID}" \
        --api-hash="${TELEGRAM_API_HASH}" \
        --dir="$TBA_DIR" \
        >> "$LOGS_DIR/tba.log" 2>&1 &
    echo $! > "$LOGS_DIR/tba.pid"

    # صبر برای آماده شدن سرور
    info "صبر برای آماده شدن Bot API Server..."
    for i in $(seq 1 20); do
        RESP=$(curl -fsSL --max-time 2 \
            "http://localhost:9090/bot${BOT_TOKEN}/getMe" 2>/dev/null || echo '{}')
        if echo "$RESP" | python3 -c "import sys,json; sys.exit(0 if json.load(sys.stdin).get('ok') else 1)" 2>/dev/null; then
            ok "Bot API Server آماده است"
            break
        fi
        sleep 1
        [[ $i -eq 20 ]] && warn "Bot API Server آماده نشد — با cloud API ادامه می‌دهد"
    done
else
    warn "telegram-bot-api نصب نیست — از cloud API استفاده می‌شود (محدودیت ۵۰MB)"
fi

# ── راه‌اندازی بات تلگرام ─────────────────────────────────────────────────────
info "راه‌اندازی بات تلگرام..."
cd "$WORKSPACE"
nohup pnpm --filter @workspace/telegram-bot run dev \
    >> "$LOGS_DIR/bot.log" 2>&1 &
echo $! > "$LOGS_DIR/bot.pid"
sleep 3

# بررسی وضعیت
if kill -0 "$(cat "$LOGS_DIR/bot.pid" 2>/dev/null)" 2>/dev/null; then
    ok "بات تلگرام در حال اجرا است (PID: $(cat "$LOGS_DIR/bot.pid"))"
else
    echo -e "${R}[ERR]${NC} بات اجرا نشد. لاگ را بررسی کنید:"
    tail -20 "$LOGS_DIR/bot.log"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "همه سرویس‌ها راه‌اندازی شدند ✓"
echo ""
echo "  • لاگ بات:      tail -f $LOGS_DIR/bot.log"
echo "  • توقف همه:     bash stop.sh"
echo ""
STARTSCRIPT
chmod +x "$WORKSPACE/start.sh"
log_ok "start.sh ایجاد شد"

###############################################################################
# ── مرحله ۸: ایجاد اسکریپت stop.sh ──────────────────────────────────────────
###############################################################################
cat > "$WORKSPACE/stop.sh" << 'STOPSCRIPT'
#!/usr/bin/env bash
WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$WORKSPACE/logs"
echo "در حال توقف سرویس‌ها..."
for PID_FILE in "$LOGS_DIR/bot.pid" "$LOGS_DIR/tba.pid"; do
    if [[ -f "$PID_FILE" ]]; then
        PID=$(cat "$PID_FILE")
        kill "$PID" 2>/dev/null && echo "متوقف شد (PID $PID)" || true
        rm -f "$PID_FILE"
    fi
done
pkill -f "tsx.*src/index" 2>/dev/null || true
pkill -f "telegram-bot-api" 2>/dev/null || true
echo "همه سرویس‌ها متوقف شدند."
STOPSCRIPT
chmod +x "$WORKSPACE/stop.sh"

###############################################################################
# ── مرحله ۹: ایجاد سرویس systemd (اگر systemd وجود داشته باشد) ───────────
###############################################################################
log_step "مرحله ۹ — تنظیم systemd (اجرای خودکار)"

if has_cmd systemctl && systemctl --version &>/dev/null 2>&1; then
    PNPM_BIN="$(which pnpm)"
    SERVICE_FILE="/etc/systemd/system/botdownloader.service"

    sudo tee "$SERVICE_FILE" > /dev/null << SVCEOF
[Unit]
Description=BotDownloaderPlus Telegram Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
User=$(whoami)
WorkingDirectory=${WORKSPACE}
ExecStart=${WORKSPACE}/start.sh
ExecStop=${WORKSPACE}/stop.sh
Restart=always
RestartSec=15
TimeoutStartSec=60
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

    sudo systemctl daemon-reload
    sudo systemctl enable botdownloader 2>/dev/null && log_ok "سرویس systemd فعال شد (اجرای خودکار بعد از ریبوت)"
else
    log_warn "systemd در دسترس نیست — سرویس خودکار تنظیم نشد"
fi

###############################################################################
# ── مرحله ۱۰: تست اتصال و راه‌اندازی اولیه ──────────────────────────────────
###############################################################################
log_step "مرحله ۱۰ — راه‌اندازی بات"

log_info "شروع بات برای اولین بار..."
bash "$WORKSPACE/start.sh"

###############################################################################
# ── پایان — خلاصه ────────────────────────────────────────────────────────────
###############################################################################
echo ""
echo -e "${G}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${G}║           نصب با موفقیت کامل شد  ✓              ║${NC}"
echo -e "${G}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${C}بات:${NC}       @${BOT_USERNAME}"
echo -e "  ${C}ادمین:${NC}     ${ADMIN_ID}"
echo -e "  ${C}کوکی:${NC}      $([ "$COOKIES_OK" == "true" ] && echo 'YouTube ✓' || echo 'تنظیم نشده ⚠')"
echo -e "  ${C}محدودیت:${NC}  ${MAX_FILE_SIZE_MB} MB"
echo ""
echo "  ┌─── دستورات مفید ───────────────────────────────┐"
echo "  │  لاگ زنده:    tail -f $LOGS_DIR/bot.log"
echo "  │  توقف:        bash stop.sh"
echo "  │  راه‌اندازی:   bash start.sh"
echo "  │  وضعیت:       systemctl status botdownloader"
echo "  └────────────────────────────────────────────────┘"
echo ""
if [[ "$COOKIES_OK" == "false" ]]; then
    echo -e "  ${Y}⚠  برای فعال‌سازی YouTube و Spotify:${NC}"
    echo "     فایل cookies.txt را به ادمین بات بفرستید"
    echo "     با caption:  setcookies youtube"
    echo ""
fi
echo "  /start بفرستید به بات @${BOT_USERNAME} و شروع کنید! 🚀"
echo ""
