#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
PYTHON_BIN="/opt/homebrew/bin/python3"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3 || true)"
fi
if [[ -z "$PYTHON_BIN" || ! -x "$PYTHON_BIN" ]]; then
  echo "Python 3 bulunamadı. Homebrew Python 3 kurulmalı."
  exit 1
fi
if [[ ! -d .venv ]]; then
  "$PYTHON_BIN" -m venv .venv
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
