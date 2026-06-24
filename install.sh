#!/bin/bash
set -e

APP="/opt/botdownloderplus"
REPO="https://github.com/moha100h/botdownloderplus.git"
SERVICE="tgdlbot"

echo "=== Telegram Downloader Bot Installer ==="

if [ "$EUID" -ne 0 ]; then
 echo "Run as root"
 exit 1
fi

read -p "Bot Token: " BOT_TOKEN
read -p "Admin ID: " ADMIN_ID

if [ -z "$BOT_TOKEN" ] || [ -z "$ADMIN_ID" ]; then
 echo "Missing token or admin id"
 exit 1
fi


echo "[1/7] Installing packages..."

apt update -y
apt install -y \
curl \
git \
ffmpeg \
python3 \
python3-pip \
build-essential


echo "[2/7] Installing Node..."

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs


echo "[3/7] Installing pnpm..."

npm install -g pnpm


echo "[4/7] Download source..."

rm -rf $APP

git clone $REPO $APP


echo "[5/7] Creating env..."

mkdir -p $APP/artifacts/telegram-bot

cat > $APP/artifacts/telegram-bot/.env <<EOF
BOT_TOKEN=$BOT_TOKEN
ADMIN_ID=$ADMIN_ID

DOWNLOAD_DIR=./downloads
MAX_FILE_SIZE_MB=50
RATE_LIMIT_REQUESTS=5
RATE_LIMIT_WINDOW_MS=60000
LOG_LEVEL=info
EOF

chmod 600 $APP/artifacts/telegram-bot/.env


echo "[6/7] Installing dependencies..."

cd $APP

pnpm install

pnpm run build


echo "[7/7] Creating service..."


cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=Telegram Downloader Bot
After=network.target


[Service]
Type=simple
WorkingDirectory=$APP/artifacts/telegram-bot
ExecStart=/usr/bin/node $APP/artifacts/telegram-bot/dist/index.cjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production


[Install]
WantedBy=multi-user.target
EOF


systemctl daemon-reload
systemctl enable $SERVICE
systemctl restart $SERVICE


echo ""
echo "================================"
echo "INSTALL DONE"
echo "================================"

systemctl status $SERVICE --no-pager
