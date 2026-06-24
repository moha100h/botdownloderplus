#!/usr/bin/env bash
set -euo pipefail

###############################################################################
#  BotDownloaderPlus — نصب خودکار
#  اجرا: bash install.sh
###############################################################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*"; exit 1; }
step()    { echo -e "\n${BOLD}▶ $*${NC}"; }

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      BotDownloaderPlus — Installer       ║${NC}"
echo -e "${BOLD}║  بات دانلودر یوتیوب، اینستاگرام و ...   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

##############################################################################
# تابع پرسیدن ورودی با پشتیبانی از مقدار پیش‌فرض
##############################################################################
ask() {
    local prompt="$1"
    local var_name="$2"
    local default="${3:-}"
    local secret="${4:-false}"
    local value=""

    while [ -z "$value" ]; do
        if [ "$secret" = "true" ]; then
            if [ -n "$default" ]; then
                read -rsp "  ${prompt} [پیش‌فرض: $default]: " value
            else
                read -rsp "  ${prompt}: " value
            fi
            echo ""
        else
            if [ -n "$default" ]; then
                read -rp "  ${prompt} [پیش‌فرض: $default]: " value
            else
                read -rp "  ${prompt}: " value
            fi
        fi

        if [ -z "$value" ] && [ -n "$default" ]; then
            value="$default"
        fi

        if [ -z "$value" ]; then
            warn "این فیلد اجباری است. لطفاً مقدار وارد کنید."
        fi
    done

    eval "$var_name='$value'"
}

ask_optional() {
    local prompt="$1"
    local var_name="$2"
    local default="${3:-}"
    local value=""

    if [ -n "$default" ]; then
        read -rp "  ${prompt} [پیش‌فرض: $default]: " value
    else
        read -rp "  ${prompt} [اختیاری - Enter برای رد کردن]: " value
    fi

    if [ -z "$value" ] && [ -n "$default" ]; then
        value="$default"
    fi

    eval "$var_name='$value'"
}

##############################################################################
# مرحله ۱: بررسی پیش‌نیازها
##############################################################################
step "بررسی پیش‌نیازهای سیستم"

ON_REPLIT=false
[ -n "${REPL_ID:-}" ] && ON_REPLIT=true

check_cmd() {
    local cmd="$1"
    local install_hint="$2"
    if command -v "$cmd" &>/dev/null; then
        success "$cmd پیدا شد: $(command -v $cmd)"
    else
        if [ "$ON_REPLIT" = "true" ]; then
            warn "$cmd یافت نشد. در Replit از Nix نصب می‌شود."
        else
            error "$cmd نصب نیست. $install_hint"
        fi
    fi
}

check_cmd node    "Node.js نسخه ۱۸ یا بالاتر نصب کنید: https://nodejs.org"
check_cmd pnpm    "با دستور: npm install -g pnpm نصب کنید"
check_cmd python3 "Python 3 نصب کنید: https://python.org"
check_cmd ffmpeg  "FFmpeg نصب کنید: https://ffmpeg.org/download.html"

NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [ "$NODE_VER" -lt 18 ]; then
    error "Node.js نسخه $NODE_VER است. حداقل نسخه ۱۸ نیاز است."
fi

if [ "$ON_REPLIT" = "false" ] && ! command -v telegram-bot-api &>/dev/null; then
    warn "telegram-bot-api (سرور خودمیزبان) نصب نیست."
    warn "بدون آن محدودیت ۵۰MB برای فایل‌ها اعمال می‌شود."
    warn "نصب: https://github.com/tdlib/telegram-bot-api#installation"
fi

##############################################################################
# مرحله ۲: دریافت تنظیمات از کاربر
##############################################################################
step "دریافت اطلاعات پیکربندی"

echo ""
echo -e "  ${YELLOW}⬇  اطلاعات بات تلگرام${NC}"
echo "  ─────────────────────────────────────────"
echo "  • توکن بات را از @BotFather بگیرید"
echo "  • ابتدا /newbot بفرستید و توکن را کپی کنید"
echo ""

ask "توکن بات (BOT_TOKEN)" BOT_TOKEN "" "true"

# اعتبارسنجی فرمت توکن
if ! echo "$BOT_TOKEN" | grep -qE '^[0-9]+:[A-Za-z0-9_-]{35,}$'; then
    error "فرمت توکن نادرست است. باید به شکل 123456789:AABBcc... باشد"
fi

echo ""
echo -e "  ${YELLOW}👤  شناسه ادمین${NC}"
echo "  ─────────────────────────────────────────"
echo "  • ادمین فقط به پنل مدیریت داشبورد دسترسی دارد"
echo "  • تمام کاربران عادی بدون محدودیت می‌توانند از بات استفاده کنند"
echo "  • شناسه عددی خود را از @userinfobot بگیرید"
echo ""

ask "شناسه عددی ادمین (ADMIN_ID)" ADMIN_ID

if ! echo "$ADMIN_ID" | grep -qE '^[0-9]+$'; then
    error "شناسه ادمین باید یک عدد مثبت باشد."
fi

echo ""
echo -e "  ${YELLOW}🔑  API تلگرام (برای رفع محدودیت ۵۰MB)${NC}"
echo "  ─────────────────────────────────────────"
echo "  • از https://my.telegram.org تهیه کنید"
echo "  • در صورت نداشتن، Enter بزنید (محدودیت ۵۰MB اعمال می‌شود)"
echo ""

ask_optional "Telegram API ID  (اختیاری)" TELEGRAM_API_ID ""
ask_optional "Telegram API Hash (اختیاری)" TELEGRAM_API_HASH ""

echo ""
echo -e "  ${YELLOW}🗄  پایگاه داده${NC}"
echo "  ─────────────────────────────────────────"
echo "  • رشته اتصال PostgreSQL"
echo "  • مثال: postgresql://user:pass@localhost:5432/botdb"
echo ""

ask_optional "آدرس دیتابیس (DATABASE_URL)" DATABASE_URL ""

echo ""
echo -e "  ${YELLOW}⚙  تنظیمات اختیاری${NC}"
echo "  ─────────────────────────────────────────"

ask_optional "حداکثر حجم فایل (MB)" MAX_FILE_SIZE_MB "50"
ask_optional "محدودیت درخواست در دقیقه" RATE_LIMIT_REQUESTS "5"

MAX_FILE_SIZE_MB="${MAX_FILE_SIZE_MB:-50}"
RATE_LIMIT_REQUESTS="${RATE_LIMIT_REQUESTS:-5}"

echo ""
echo -e "  ${YELLOW}🗂  پوشه دانلود${NC}"
ask_optional "پوشه ذخیره دانلودها" DOWNLOAD_DIR "./downloads"
DOWNLOAD_DIR="${DOWNLOAD_DIR:-./downloads}"

##############################################################################
# مرحله ۳: نمایش خلاصه و تأیید
##############################################################################
step "خلاصه تنظیمات"
echo ""
echo -e "  BOT_TOKEN        : ${CYAN}${BOT_TOKEN:0:10}...${NC}"
echo -e "  ADMIN_ID         : ${CYAN}${ADMIN_ID}${NC}"
echo -e "  TELEGRAM_API_ID  : ${CYAN}${TELEGRAM_API_ID:-«تنظیم نشده»}${NC}"
echo -e "  TELEGRAM_API_HASH: ${CYAN}${TELEGRAM_API_HASH:-«تنظیم نشده»}${NC}"
echo -e "  DATABASE_URL     : ${CYAN}${DATABASE_URL:-«تنظیم نشده»}${NC}"
echo -e "  MAX_FILE_SIZE_MB : ${CYAN}${MAX_FILE_SIZE_MB}${NC}"
echo -e "  RATE_LIMIT       : ${CYAN}${RATE_LIMIT_REQUESTS} req/min${NC}"
echo -e "  DOWNLOAD_DIR     : ${CYAN}${DOWNLOAD_DIR}${NC}"
echo ""

read -rp "  آیا ادامه می‌دهید؟ (y/N): " CONFIRM
case "$CONFIRM" in
    [yYبب]) ;;
    *) echo "نصب لغو شد."; exit 0 ;;
esac

##############################################################################
# مرحله ۴: ایجاد فایل‌های .env
##############################################################################
step "ایجاد فایل‌های پیکربندی"

BOT_DIR="$WORKSPACE_ROOT/artifacts/telegram-bot"
mkdir -p "$BOT_DIR"
mkdir -p "$BOT_DIR/downloads"

# فایل .env اصلی بات
cat > "$BOT_DIR/.env" << EOF
# Telegram Bot Configuration — auto-generated by install.sh
BOT_TOKEN=${BOT_TOKEN}
ADMIN_ID=${ADMIN_ID}
DOWNLOAD_DIR=${DOWNLOAD_DIR}
MAX_FILE_SIZE_MB=${MAX_FILE_SIZE_MB}
RATE_LIMIT_REQUESTS=${RATE_LIMIT_REQUESTS}
RATE_LIMIT_WINDOW_MS=60000
LOG_LEVEL=info
EOF

if [ -n "$TELEGRAM_API_ID" ]; then
    echo "TELEGRAM_API_ID=${TELEGRAM_API_ID}"   >> "$BOT_DIR/.env"
fi
if [ -n "$TELEGRAM_API_HASH" ]; then
    echo "TELEGRAM_API_HASH=${TELEGRAM_API_HASH}" >> "$BOT_DIR/.env"
fi

# فایل .env ریشه پروژه
ROOT_ENV="$WORKSPACE_ROOT/.env"
touch "$ROOT_ENV"

set_env() {
    local key="$1"
    local val="$2"
    if grep -q "^${key}=" "$ROOT_ENV" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${val}|" "$ROOT_ENV"
    else
        echo "${key}=${val}" >> "$ROOT_ENV"
    fi
}

set_env "BOT_TOKEN"          "$BOT_TOKEN"
set_env "ADMIN_ID"           "$ADMIN_ID"

if [ -n "$TELEGRAM_API_ID" ];   then set_env "TELEGRAM_API_ID"   "$TELEGRAM_API_ID";   fi
if [ -n "$TELEGRAM_API_HASH" ]; then set_env "TELEGRAM_API_HASH" "$TELEGRAM_API_HASH"; fi
if [ -n "$DATABASE_URL" ];      then set_env "DATABASE_URL"       "$DATABASE_URL";       fi

success "فایل‌های .env ایجاد شدند"

# ثبت وضعیت اولیه بات
cat > "$BOT_DIR/.bot-state.json" << EOF
{
  "setupDone": true,
  "adminId": ${ADMIN_ID},
  "configuredAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

##############################################################################
# مرحله ۵: نصب وابستگی‌ها
##############################################################################
step "نصب وابستگی‌های Node.js (pnpm install)"
cd "$WORKSPACE_ROOT"

if ! pnpm install --frozen-lockfile 2>/dev/null; then
    info "lockfile تغییر کرده، نصب معمولی..."
    pnpm install
fi

success "وابستگی‌ها با موفقیت نصب شدند"

##############################################################################
# مرحله ۶: ساخت پروژه
##############################################################################
step "ساخت پروژه (build)"

# کدجن API
if pnpm run --filter @workspace/api-spec codegen 2>/dev/null; then
    success "codegen اجرا شد"
fi

# بیلد API سرور
pnpm --filter @workspace/api-server run build
success "API سرور ساخته شد"

##############################################################################
# مرحله ۷: اسکریپت راه‌اندازی
##############################################################################
step "ایجاد اسکریپت start.sh"

cat > "$WORKSPACE_ROOT/start.sh" << 'STARTSCRIPT'
#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$WORKSPACE_ROOT"

# بارگذاری متغیرهای محیطی
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo "[start] راه‌اندازی سرویس‌ها..."

# کشتن پروسه‌های قبلی
pkill -f "telegram-bot" 2>/dev/null || true
pkill -f "telegram-bot-api" 2>/dev/null || true
sleep 1

# راه‌اندازی سرور Bot API خودمیزبان (در صورت وجود)
if command -v telegram-bot-api &>/dev/null && \
   [ -n "${TELEGRAM_API_ID:-}" ] && [ -n "${TELEGRAM_API_HASH:-}" ]; then

    TBA_DIR="$WORKSPACE_ROOT/artifacts/telegram-bot/.tba-data"
    mkdir -p "$TBA_DIR"
    echo "[start] راه‌اندازی telegram-bot-api (محدودیت ۲GB)..."
    nohup telegram-bot-api \
        --local \
        --http-port=9090 \
        --dir="$TBA_DIR" \
        --api-id="$TELEGRAM_API_ID" \
        --api-hash="$TELEGRAM_API_HASH" \
        >> "$WORKSPACE_ROOT/logs/tba-server.log" 2>&1 &
    echo "[start] تا ۵ ثانیه صبر برای آماده شدن Bot API Server..."
    sleep 5
else
    echo "[start] telegram-bot-api در دسترس نیست — محدودیت ۵۰MB اعمال می‌شود"
fi

# راه‌اندازی API سرور
echo "[start] راه‌اندازی API سرور..."
PORT=8080 nohup node --enable-source-maps artifacts/api-server/dist/index.mjs \
    >> "$WORKSPACE_ROOT/logs/api-server.log" 2>&1 &

sleep 2

# راه‌اندازی بات تلگرام
echo "[start] راه‌اندازی بات تلگرام..."
nohup pnpm --filter @workspace/telegram-bot run dev \
    >> "$WORKSPACE_ROOT/logs/bot.log" 2>&1 &

echo "[start] همه سرویس‌ها راه‌اندازی شدند!"
echo "[start] لاگ‌ها در پوشه logs/ قابل مشاهده‌اند"
echo ""
echo "  • API سرور:   http://localhost:8080"
echo "  • داشبورد:    http://localhost:8081"
echo ""
STARTSCRIPT

chmod +x "$WORKSPACE_ROOT/start.sh"

# پوشه لاگ
mkdir -p "$WORKSPACE_ROOT/logs"

success "اسکریپت start.sh ایجاد شد"

##############################################################################
# مرحله ۸: بررسی وضعیت و پایان
##############################################################################
step "نصب با موفقیت تکمیل شد!"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           نصب کامل شد  ✓                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  برای راه‌اندازی بات:"
echo ""
echo -e "  ${BOLD}bash start.sh${NC}"
echo ""
echo "  یا در Replit دکمه Run را فشار دهید."
echo ""
echo -e "  ${YELLOW}نکته:${NC} ادمین (ID: ${ADMIN_ID}) فقط به داشبورد مدیریت دسترسی دارد."
echo -e "  ${YELLOW}نکته:${NC} همه کاربران تلگرام می‌توانند از بات استفاده کنند."
echo ""
