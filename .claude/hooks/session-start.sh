#!/bin/bash
# Prepares Claude Code cloud sessions. Does nothing on your own machine.
set -uo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -f .env ] || cp .env.example .env
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  # better-sqlite3 may compile from source here (its prebuilt download is blocked); that is expected and takes a minute or two.
  npm ci --no-audit --no-fund || echo "npm ci failed. Run it again and read the error before continuing."
fi
echo "Ready. Run 'npm run check' before finishing; browser tests run in GitHub Actions."
exit 0
