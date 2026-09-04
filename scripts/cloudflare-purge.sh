#!/usr/bin/env bash
# Cloudflare のエッジキャッシュから「デプロイで中身が変わりうるURL」を消す（2026-09-04）
#
# なぜ必要か:
#   Cloudflare を前段に置くと、HTML をエッジにキャッシュできる（Edge TTL）。その代わり
#   デプロイ直後もエッジは古い HTML を TTL いっぱい返し続ける。?v= 付きのアセットは URL が
#   変わるので問題ないが、HTML だけは URL が同じまま中身が変わる＝「?v= を上げたのに効かない」
#   事故の HTML 版になる。デプロイのたびにここで消す。
#
# 消すもの（無料プランは「URL指定」か「全部」しか無い。プレフィックス指定は Enterprise）:
#   - 配信される全 HTML を `/dir/` と `/dir/index.html` の両方の形で（キャッシュキーが別）
#   - assets/data/*.json（origin は no-cache なので本来エッジに乗らないが、念のため）
#   1リクエスト最大30URLなので分割して送る。
#
# 使い方:
#   CF_ZONE_ID / CF_API_TOKEN を環境変数で渡す（GitHub Secrets）。無ければ何もせず 0 で終わる
#   （Cloudflare 未導入の環境でデプロイを止めない）。
#   scripts/cloudflare-purge.sh <DEPLOY_URL_BASE>            例: https://denkilp.builders-job.com/denki-lp-cvr
#   scripts/cloudflare-purge.sh <DEPLOY_URL_BASE> --dry-run  送らずに URL 一覧と件数だけ出す
#
# API トークンの権限: Zone → Cache Purge → Purge（対象ゾーンのみ）。それ以外は付けない。
set -euo pipefail
BASE="${1:?DEPLOY_URL_BASE を指定}"
DRY=false; [ "${2:-}" = "--dry-run" ] && DRY=true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$DRY" != true ] && { [ -z "${CF_ZONE_ID:-}" ] || [ -z "${CF_API_TOKEN:-}" ]; }; then
  echo "cloudflare-purge: CF_ZONE_ID / CF_API_TOKEN が無いのでスキップ（Cloudflare 未導入）"
  exit 0
fi

# 配信対象の HTML（deploy.yml の rsync 除外と同じディレクトリを外す）
mapfile -t files < <(
  git -c core.quotePath=false ls-files -- '*.html' '*.json' \
    | grep -vE '^(docs|deploy|scripts|gas-recorder|v2-deploy|dk_lp|\.github)/' \
    | grep -vE '^(thanks|WPLP/thanks|自前LP/thanks|nenshu-shindan/thanks)/' \
    | grep -E '\.html$|^assets/data/.*\.json$'
)

urls=()
for f in "${files[@]}"; do
  # 日本語ディレクトリ（自前LP）はパーセントエンコードして URL にする
  enc=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$f")
  urls+=("${BASE}/${enc}")
  case "$f" in
    */index.html) urls+=("${BASE}/${enc%index.html}") ;;
    index.html)   urls+=("${BASE}/") ;;
  esac
done
echo "cloudflare-purge: ${#urls[@]} URL（${BASE}）"

if [ "$DRY" = true ]; then
  printf '  %s\n' "${urls[@]}" | head -12
  echo "  ..."
  exit 0
fi

ok=0; ng=0
for ((i = 0; i < ${#urls[@]}; i += 30)); do
  batch=("${urls[@]:i:30}")
  body=$(printf '%s\n' "${batch[@]}" | python3 -c 'import sys,json;print(json.dumps({"files":[l.rstrip("\n") for l in sys.stdin if l.strip()]}))')
  # Cloudflare 側の一時エラーに備えて3回まで
  sent=false
  for attempt in 1 2 3; do
    res=$(curl -sS --max-time 30 -X POST \
      "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json" \
      --data "$body" || true)
    if printf '%s' "$res" | grep -q '"success": *true'; then sent=true; break; fi
    echo "  batch $((i / 30 + 1)) attempt ${attempt} failed: $(printf '%s' "$res" | head -c 300)"
    sleep $((attempt * 5))
  done
  if [ "$sent" = true ]; then ok=$((ok + ${#batch[@]})); else ng=$((ng + ${#batch[@]})); fi
done
echo "cloudflare-purge: purged ${ok} / failed ${ng}"
# パージ失敗＝古い HTML が最長 Edge TTL ぶん配られ続ける。デプロイ自体は済んでいるので
# 落とさず warning にし、Verify deployment の ?v= 検証（最大90秒リトライ）に判断を委ねる。
[ "$ng" -eq 0 ] || echo "::warning::Cloudflare パージに失敗した URL が ${ng} 件（Edge TTL 経過まで旧 HTML が残る）"
