#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_PATH="$HOME/Library/LaunchAgents/com.teleflow.agent.plist"
LOG_DIR="$SCRIPT_DIR/data/logs"

if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
  echo "mac-agent/.env bulunamadı. Önce README.md içindeki gizli anahtarları oluşturun."
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
sed \
  -e "s|__TELEFLOW_START_SCRIPT__|$SCRIPT_DIR/start.sh|g" \
  -e "s|__TELEFLOW_LOG_DIR__|$LOG_DIR|g" \
  "$SCRIPT_DIR/com.teleflow.agent.plist.template" > "$PLIST_PATH"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/com.teleflow.agent"
echo "Teleflow ajanı macOS girişinde otomatik başlayacak."
