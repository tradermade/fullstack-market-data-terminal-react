#!/bin/bash
# Dashboard Portal Server Startup Script
# Starts Node.js server on port 3001 with auto-restart on crash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/server-3001.log"
PID_FILE="/tmp/server-3001.pid"

echo "[$(date)] Starting Dashboard Portal server from $SCRIPT_DIR" | tee -a "$LOG_FILE"

# Kill any existing process
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[$(date)] Killing existing process $OLD_PID" | tee -a "$LOG_FILE"
    kill "$OLD_PID" || true
    sleep 1
  fi
fi

# Start server with auto-restart loop
while true; do
  cd "$SCRIPT_DIR"
  echo "[$(date)] Server starting..." | tee -a "$LOG_FILE"
  node server.js 2>&1 | tee -a "$LOG_FILE" &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"
  echo "[$(date)] Server running (PID: $SERVER_PID)" | tee -a "$LOG_FILE"
  
  wait "$SERVER_PID"
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE, restarting in 5s..." | tee -a "$LOG_FILE"
  sleep 5
done
