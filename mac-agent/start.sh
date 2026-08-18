#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
if [[ ! -f .env ]]; then
  echo "Create mac-agent/.env first. See README.md."
  exit 1
fi
set -a
source .env
set +a
exec .venv/bin/uvicorn teleflow_agent:app --host 127.0.0.1 --port 8787
