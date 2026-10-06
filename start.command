#!/bin/bash
# 双击启动《峡谷之巅》：开本地服务并打开浏览器
cd "$(dirname "$0")"
PORT=8765
if ! lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 serve.py $PORT &
  sleep 1
fi
open "http://localhost:$PORT"
wait
