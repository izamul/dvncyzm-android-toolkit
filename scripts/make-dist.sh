#!/usr/bin/env bash
# Merakit tiga folder distribusi (mac, linux, windows) dari hasil build.
# Pemakaian: bash scripts/make-dist.sh [folder-keluaran]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/../dist-installer}"
cd "$ROOT"

npm run build >/dev/null
ELECTRON_V="$(node -p "require('./node_modules/electron/package.json').version")"
PTY_V="$(node -p "require('./node_modules/node-pty/package.json').version")"
VER="$(node -p "require('./package.json').version")"

PAYLOAD="$(mktemp -d)"
trap 'rm -rf "$PAYLOAD"' EXIT
mkdir -p "$PAYLOAD/build"
chmod 755 "$PAYLOAD"
cp -R out "$PAYLOAD/out"
cp build/icon.png build/icon.ico "$PAYLOAD/build/"
cat > "$PAYLOAD/package.json" <<JSON
{
  "name": "dvncyzm",
  "productName": "dvncyzm",
  "version": "$VER",
  "main": "./out/main/index.js",
  "dependencies": {
    "electron": "$ELECTRON_V",
    "node-pty": "$PTY_V"
  }
}
JSON

rm -rf "$OUT"; mkdir -p "$OUT"
make_one() { # nama  berkas-pemasang...
  local name="$1"; shift
  local dir="$OUT/dvncyzm-$name"
  mkdir -p "$dir"
  cp -R "$PAYLOAD" "$dir/app"
  cp "scripts/readme/$name.txt" "$dir/README.txt"
  for f in "$@"; do cp "scripts/installers/$name/$f" "$dir/$f"; done
}
make_one mac install.command
make_one linux install.sh
make_one windows install.bat install.ps1
chmod +x "$OUT/dvncyzm-mac/install.command" "$OUT/dvncyzm-linux/install.sh"
# Windows: ujung baris CRLF supaya aman dibuka di Notepad dan dijalankan cmd
for f in install.bat install.ps1; do sed -i 's/\r$//; s/$/\r/' "$OUT/dvncyzm-windows/$f"; done
sed -i 's/\r$//; s/$/\r/' "$OUT/dvncyzm-windows/README.txt"

( cd "$OUT" && for d in dvncyzm-*; do zip -qr -y "$d.zip" "$d"; done )
echo "Selesai: $OUT"
ls -la "$OUT"
