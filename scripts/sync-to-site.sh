#!/usr/bin/env bash
#
# 把构建产物与素材同步进个人站（站点用「CDN 同款」方式消费，验证发布形态）。
#
#   ./scripts/sync-to-site.sh
#
# 前提：npm run build 已跑过。目标目录由 SITE_DIR 覆盖，默认 sibling 仓库。
#
set -euo pipefail

cd "$(dirname "$0")/.."

SITE_DIR="${SITE_DIR:-$HOME/project4/hqa-personal-site}"
DEST="$SITE_DIR/services/site/public/pet"

if [[ ! -d "$SITE_DIR/services/site" ]]; then
  echo "找不到个人站仓库：$SITE_DIR（用 SITE_DIR=... 覆盖）" >&2
  exit 1
fi
if [[ ! -f dist/dafeiyu.iife.js ]]; then
  echo "缺 dist/dafeiyu.iife.js，先跑 npm run build" >&2
  exit 1
fi

mkdir -p "$DEST/assets"
cp dist/dafeiyu.iife.js "$DEST/"
cp assets/* "$DEST/assets/"

echo "已同步到 $DEST："
ls -lh "$DEST" | tail -n +2
du -sh "$DEST/assets"
echo
echo "站点侧更新后记得：cd $SITE_DIR && docker compose up -d --build site"
