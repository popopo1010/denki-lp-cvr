#!/bin/sh
# LP をローカルでプレビューする（file:// では JS/CSS が壊れやすいため HTTP 必須）
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
echo "LP preview: http://localhost:${PORT}/"
echo "  一覧: http://localhost:${PORT}/"
echo "  施工管理: http://localhost:${PORT}/sekoukanri/"
echo "  年収診断v3(新ドメイン用): http://localhost:${PORT}/nenshu-shindan-v3/"
echo "  年収診断v3 サンクス: http://localhost:${PORT}/nenshu-shindan-v3/thanks/"
echo "停止: Ctrl+C"
exec python3 -m http.server "$PORT"
