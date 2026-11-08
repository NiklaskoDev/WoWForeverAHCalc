#!/bin/sh
# Runs as root only long enough to give /data to the chosen user. Unraid's default is nobody:users (99:100).
set -e
PUID="${PUID:-99}"
PGID="${PGID:-100}"
mkdir -p /data
chown -R "$PUID:$PGID" /data
exec su-exec "$PUID:$PGID" python -u /app/server.py
