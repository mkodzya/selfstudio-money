#!/bin/bash
# Double-click me to open Self Studio — Money.
# The page and its data stay on this Mac; nothing is sent anywhere.
cd "$(dirname "$0")"
PORT=5190
URL="http://127.0.0.1:$PORT"

if curl -s -o /dev/null --max-time 1 "$URL/api/data"; then
  echo "Money уже запущен. Открываю страницу."
  open "$URL"
  exit 0
fi

(sleep 1; open "$URL") &
exec /usr/bin/python3 server.py
