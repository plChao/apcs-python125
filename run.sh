#!/bin/sh
# 啟動本機網頁伺服器：http://localhost:8001
cd "$(dirname "$0")" || exit 1
echo "開啟 http://localhost:8001 (按 Ctrl+C 停止)"
exec python3 -m http.server 8001
