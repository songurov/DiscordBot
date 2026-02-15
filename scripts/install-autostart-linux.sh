#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="discord-trans.service"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_PATH="$SERVICE_DIR/$SERVICE_NAME"

mkdir -p "$SERVICE_DIR"

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Discord Translation Bot (trans)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$REPO_DIR
ExecStart=$REPO_DIR/trans start
ExecStop=$REPO_DIR/trans stop
ExecReload=$REPO_DIR/trans restart
TimeoutStartSec=30
TimeoutStopSec=30

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"

echo "Installed user service: $SERVICE_PATH"
echo "Status:"
systemctl --user status "$SERVICE_NAME" --no-pager || true
echo
echo "To start after reboot without user login:"
echo "  sudo loginctl enable-linger $USER"
