#!/usr/bin/env bash
#
# 从 dsh-pet（MIT）下载动画素材，重命名为 ASCII 文件名放进 assets/。
#
#   ./scripts/fetch-assets.sh          # webm（必成）+ mov（尽力）
#   ./scripts/fetch-assets.sh webm     # 只下 webm
#   ./scripts/fetch-assets.sh mov      # 只下 mov
#
# - webm 走 api.github.com 的 raw 接口（本机实测可达）
# - mov 在 GitHub Release 的一个 78.7MB 整包 zip 里，直连可能被墙，
#   依次尝试 gh-proxy / ghfast / ghproxy 镜像；全部失败不影响 webm 使用
# - 幂等：已存在且非空的文件跳过
#
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p assets/memes /tmp/dafeiyu-fetch

# 表情包（PNG，键 = assets/memes/<键>.png；描述表在 dafeiyu-server 的 handler.js 里）
MEMES=(
  "rice-fish=吃白饭的大肥鱼"
  "big-coming=大的要来啦"
  "big-med=大的药来了"
  "scold-him=要不直接骂他"
  "dead=死掉了"
  "deep-sleep=深度睡眠"
  "slow-burn=大烧货"
  "keep-them=先养着吧"
  "full-belly=吃饱饱摸肚子"
  "open-source=誓死践行开源精神"
  "shock=电死你"
  "cute=可爱"
  "token-mom=token给妈妈保管"
  "blind-multimodal=假如给我三天多模态"
  "awesome-whale=厉害了我的鲸"
  "oh-whale=哦鲸鲸"
  "stress=压力一只大肥鱼"
  "riemann=黎曼猜想没证明喵"
  "flirt-only=除了调情没啥用"
  "need-update=我不更新你们用什么"
  "no-virus=哪来的电脑病毒"
  "want-resource=鱼片有资源吗"
  "master-what=大师这个区是什么意思"
  "sassy=就骚了怎么滴吧"
  "oops-butter=完蛋了把黄油删了"
  "one-bowl=就一碗"
  "ciallo=Ciallo"
)

# 语义名 = dsh-pet 里的中文原名
MAP=(
  "idle-breathing=待机呼吸休闲"
  "idle-humming=悠闲哼歌"
  "idle-looking=东张西望"
  "idle-yawn=哈欠连天"
  "sleep-snooze=原地小憩沉眠"
  "wake-startled=打瞌睡被惊醒"
  "click-happy=点击回应-开心跃动"
  "click-wave=点击回应-元气挥手"
  "click-annoyed=点击回应-傲娇生气"
  "drag-startled=被吓一跳"
  "talk-screen=碎碎念-对屏碎碎念"
  "talk-thinking=深度思考碎碎念"
  "walk-crab=螃蟹走路"
  "rare-whale=蓝鲸现世"
  "play-gomoku=下五子棋"
  "game-rage=玩游戏气急败坏"
  "pet-scratch=点击回应-挠痒咯咯笑"
  "eat-rice=吃白饭"
  "eat-caught=偷吃零食被抓住"
  "eat-icecream=吃冰淇淋融化"
)

API="https://api.github.com/repos/PC2005-cloud/dsh-pet/contents/dsh-pet/assets/webm"
RELEASE_ZIP="https://github.com/PC2005-cloud/dsh-pet/releases/download/assets-mov/dsh-pet-mov-assets-mov.zip"

enc() { python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$1"; }

fetch_webm() {
  echo "==> webm（VP9-alpha，Chromium/Firefox 用）"
  local ok=0 fail=0
  for pair in "${MAP[@]}"; do
    local ascii="${pair%%=*}" zh="${pair#*=}"
    local out="assets/$ascii.webm"
    if [[ -s "$out" ]]; then echo "  跳过 $out"; ok=$((ok+1)); continue; fi
    local url="$API/$(enc "$zh").webm?ref=main"
    if curl -sfL --connect-timeout 15 --max-time 120 \
         -H "Accept: application/vnd.github.raw" -o "$out" "$url"; then
      # 空文件 / HTML 错误页（<50KB 视为异常，素材都在 200KB+）
      if [[ $(stat -c%s "$out") -lt 51200 ]]; then
        rm -f "$out"; echo "  失败 $ascii（文件异常）"; fail=$((fail+1))
      else
        echo "  完成 $out ($(du -h "$out" | cut -f1))"; ok=$((ok+1))
      fi
    else
      rm -f "$out"; echo "  失败 $ascii（网络）"; fail=$((fail+1))
    fi
  done
  echo "  webm：成功 $ok / ${#MAP[@]}"
  [[ $fail -eq 0 ]]
}

fetch_mov() {
  echo "==> mov（HEVC-alpha，macOS Safari 用；Release 整包 $(echo 78.7MB)）"
  local zip=/tmp/dafeiyu-fetch/mov-assets.zip
  local ok=0
  if [[ ! -s "$zip" ]]; then
    local got=""
    for prefix in "" "https://gh-proxy.com/" "https://ghfast.top/" "https://ghproxy.net/"; do
      echo "  尝试下载：${prefix:-直连}"
      if curl -sfL --connect-timeout 12 --max-time 900 -o "$zip" "${prefix}${RELEASE_ZIP}"; then
        if python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).namelist()' "$zip" 2>/dev/null; then
          got=1; break
        fi
      fi
      rm -f "$zip"
    done
    if [[ -z "$got" ]]; then
      echo "  ✗ 全部下载通道失败。先用 webm 跑（Safari 暂无宠物），之后网络好了重跑本脚本补 mov。"
      return 0
    fi
  fi
  # 从 zip 里挑出目标文件，重命名写入 assets/
  python3 - "$zip" <<'PY'
import os, sys, zipfile

MAP = {
    "idle-breathing": "待机呼吸休闲",
    "idle-humming": "悠闲哼歌",
    "idle-looking": "东张西望",
    "idle-yawn": "哈欠连天",
    "sleep-snooze": "原地小憩沉眠",
    "wake-startled": "打瞌睡被惊醒",
    "click-happy": "点击回应-开心跃动",
    "click-wave": "点击回应-元气挥手",
    "click-annoyed": "点击回应-傲娇生气",
    "drag-startled": "被吓一跳",
    "talk-screen": "碎碎念-对屏碎碎念",
    "talk-thinking": "深度思考碎碎念",
    "walk-crab": "螃蟹走路",
    "rare-whale": "蓝鲸现世",
    "play-gomoku": "下五子棋",
    "game-rage": "玩游戏气急败坏",
    "pet-scratch": "点击回应-挠痒咯咯笑",
    "eat-rice": "吃白饭",
    "eat-caught": "偷吃零食被抓住",
    "eat-icecream": "吃冰淇淋融化",
}
zh2ascii = {v: k for k, v in MAP.items()}
z = zipfile.ZipFile(sys.argv[1])
found = {}
for name in z.namelist():
    stem = os.path.splitext(os.path.basename(name))[0]  # zip 里的名字带 .mov 后缀
    if stem in zh2ascii:
        found[stem] = name
for zh, ascii_name in zh2ascii.items():
    out = f"assets/{ascii_name}.mov"
    if os.path.exists(out) and os.path.getsize(out) > 51200:
        print(f"  跳过 {out}")
        continue
    if zh not in found:
        print(f"  ✗ zip 里没有 {zh}")
        continue
    with z.open(found[zh]) as src, open(out, "wb") as dst:
        dst.write(src.read())
    print(f"  完成 {out}")
print(f"  mov：{sum(1 for n in zh2ascii.values() if os.path.exists(f'assets/{n}.mov'))} / {len(MAP)}")
PY
}

fetch_memes() {
  echo "==> memes（表情包 PNG）"
  local ok=0
  for pair in "${MEMES[@]}"; do
    local key="${pair%%=*}" zh="${pair#*=}"
    local out="assets/memes/$key.png"
    if [[ -s "$out" ]]; then ok=$((ok+1)); continue; fi
    local url="https://api.github.com/repos/PC2005-cloud/dsh-pet/contents/dsh-pet/assets/memes/$(enc "$zh").png?ref=main"
    if curl -sfL --connect-timeout 15 --max-time 120 \
         -H "Accept: application/vnd.github.raw" -o "$out" "$url"; then
      ok=$((ok+1))
    else
      rm -f "$out"; echo "  失败 $key"
    fi
  done
  echo "  memes：$ok / ${#MEMES[@]}"
}

mode="${1:-all}"
case "$mode" in
  webm)  fetch_webm ;;
  mov)   fetch_mov ;;
  memes) fetch_memes ;;
  all)   fetch_webm || true; fetch_mov; fetch_memes ;;
  *) echo "用法: $0 [webm|mov|memes|all]" >&2; exit 1 ;;
esac

echo
ls -lh assets/ | tail -n +2
