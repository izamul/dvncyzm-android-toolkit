#!/bin/bash
# dvncyzm - pemasang untuk macOS.
# Klik dua kali berkas ini. Bila macOS menolak ("pengembang tidak dikenal"): klik kanan > Buka.
# Alternatif: buka Terminal lalu jalankan  bash install.command
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.dvncyzm"
APPDIR="$HOME/Applications"
NODE_MIN=20
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
WARNINGS=()

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; WARNINGS+=("$*"); }
die()  { printf '\n\033[31mGAGAL: %s\033[0m\n' "$*" >&2; pause_end; exit 1; }
pause_end() { if [ -t 0 ] && [ "${DVNCYZM_ASSUME_YES:-0}" != 1 ]; then read -r -p "Tekan Enter untuk menutup..." _ || true; fi; }
ask()  {
  [ "${DVNCYZM_ASSUME_YES:-0}" = 1 ] && return 0
  [ -t 0 ] || return 0
  local a; read -r -p "$1 [Y/n] " a || return 0
  case "${a:-Y}" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

case "$(uname -m)" in
  x86_64)        ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) die "Arsitektur $(uname -m) belum didukung." ;;
esac
[ -f "$HERE/app/out/main/index.js" ] || die "Folder 'app' tidak lengkap. Ekstrak ulang seluruh arsip lalu jalankan lagi."

# ---------- 1. Node.js (hanya untuk memasang; sementara bila belum ada) ----------
node_ok() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 &&
    [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MIN" ]
}
if node_ok; then
  say "Memakai Node.js $(node -v) yang sudah terpasang"
else
  say "Mengunduh Node.js sementara (dihapus setelah selesai)"
  BASE="https://nodejs.org/dist/latest-v22.x"
  LINE="$(curl -fsSL "$BASE/SHASUMS256.txt" | grep -E " node-v[0-9.]+-darwin-$ARCH\.tar\.gz\$" | head -1)" || true
  [ -n "$LINE" ] || die "Tidak bisa menemukan berkas Node.js. Periksa koneksi internet."
  SHA="${LINE%% *}"; FILE="${LINE##* }"
  curl -fSL "$BASE/$FILE" -o "$TMP/$FILE" || die "Gagal mengunduh Node.js."
  echo "$SHA  $TMP/$FILE" | shasum -a 256 -c - >/dev/null 2>&1 || die "Checksum Node.js tidak cocok. Unduhan dibatalkan."
  tar -xzf "$TMP/$FILE" -C "$TMP"
  export PATH="$TMP/${FILE%.tar.gz}/bin:$PATH"
fi

# ---------- 2. Salin aplikasi dan pasang Electron ----------
say "Memasang aplikasi ke $DEST"
mkdir -p "$DEST/app"
rm -rf "$DEST/app/out" "$DEST/app/build"
cp -R "$HERE/app/." "$DEST/app/"
cp "$HERE/README.txt" "$DEST/README.txt" 2>/dev/null || true
( cd "$DEST/app" && npm install --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error ) \
  || die "npm install gagal. Periksa koneksi internet lalu jalankan lagi."
say "Mengunduh Electron"
( cd "$DEST/app" && node node_modules/electron/install.js ) || die "Gagal mengunduh Electron."
ELECTRON="$DEST/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
[ -x "$ELECTRON" ] || die "Berkas Electron tidak ditemukan setelah pemasangan."
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

# modul terminal (tab Shell): binari siap pakai ikut paketnya
( cd "$DEST/app" && node -e "require('node-pty')" >/dev/null 2>&1 ) \
  || warn "Tab Shell tidak aktif (modul terminal tidak bisa dimuat). Fitur lain tetap berfungsi."

# ---------- 3. adb ----------
have_adb() {
  command -v adb >/dev/null 2>&1 ||
    [ -x "${ANDROID_HOME:-/nonexistent}/platform-tools/adb" ] ||
    [ -x "$HOME/Library/Android/sdk/platform-tools/adb" ] ||
    [ -x "/opt/homebrew/bin/adb" ] || [ -x "/usr/local/bin/adb" ] ||
    [ -x "$DEST/android-sdk/platform-tools/adb" ]
}
if have_adb; then
  say "adb sudah ada, dilewati"
else
  say "Mengunduh Android Platform-Tools resmi dari Google (tunduk pada lisensi SDK Google)"
  if curl -fSL "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip" -o "$TMP/pt.zip"; then
    mkdir -p "$DEST/android-sdk"
    unzip -q -o "$TMP/pt.zip" -d "$DEST/android-sdk"
    xattr -dr com.apple.quarantine "$DEST/android-sdk" 2>/dev/null || true
    have_adb || warn "adb belum terpasang. Pilih lokasinya manual di tab Pengaturan."
  else
    warn "Gagal mengunduh Platform-Tools. Pasang adb sendiri (brew install --cask android-platform-tools) atau pilih lokasinya di tab Pengaturan."
  fi
fi

# ---------- 4. scrcpy (opsional, lewat Homebrew) ----------
BREW=""
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && BREW="$b" && break; done
if command -v scrcpy >/dev/null 2>&1 || [ -x /opt/homebrew/bin/scrcpy ] || [ -x /usr/local/bin/scrcpy ]; then
  say "scrcpy sudah ada, dilewati"
elif [ -n "$BREW" ] && ask "Pasang scrcpy (cermin layar) lewat Homebrew?"; then
  "$BREW" install scrcpy || warn "scrcpy gagal dipasang. Fitur scrcpy tidak aktif; coba: brew install scrcpy"
else
  warn "scrcpy tidak dipasang. Fitur scrcpy aktif setelah Anda menjalankan: brew install scrcpy (lihat brew.sh bila belum punya Homebrew)."
fi

# ---------- 5. Aplikasi peluncur di ~/Applications ----------
say "Membuat aplikasi di $APPDIR/dvncyzm.app"
APP="$APPDIR/dvncyzm.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cat > "$APP/Contents/MacOS/dvncyzm" <<LAUNCH
#!/bin/bash
D="$DEST"
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
if [ -z "\${ANDROID_HOME:-}" ] && [ -d "\$D/android-sdk/platform-tools" ]; then export ANDROID_HOME="\$D/android-sdk"; fi
exec "\$D/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "\$D/app" "\$@"
LAUNCH
chmod +x "$APP/Contents/MacOS/dvncyzm"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>dvncyzm</string>
  <key>CFBundleDisplayName</key><string>dvncyzm</string>
  <key>CFBundleExecutable</key><string>dvncyzm</string>
  <key>CFBundleIdentifier</key><string>id.dvncyzm.launcher</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
# ikon .icns dari PNG (bila sips/iconutil tersedia, biasanya selalu ada di macOS)
(
  SET="$TMP/icon.iconset"; mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    sips -z "$s" "$s" "$DEST/app/build/icon.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
    sips -z "$((s*2))" "$((s*2))" "$DEST/app/build/icon.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/icon.icns"
) >/dev/null 2>&1 || warn "Ikon aplikasi tidak dibuat; aplikasi tetap berfungsi."
touch "$APP"
cat > "$DEST/uninstall.command" <<UNI
#!/bin/bash
rm -rf "$APP" "$DEST"
echo "dvncyzm dihapus. Pengaturan Anda tetap ada di ~/Library/Application Support/dvncyzm (hapus sendiri bila tidak perlu)."
UNI
chmod +x "$DEST/uninstall.command"

say "Selesai"
echo "Buka dari Launchpad/Spotlight: ketik 'dvncyzm'  (atau folder $APPDIR)."
echo "Copot pemasangan: bash $DEST/uninstall.command"
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  printf '\n\033[33mCatatan:\033[0m\n'
  for w in "${WARNINGS[@]}"; do printf ' - %s\n' "$w"; done
fi
if ask "Buka dvncyzm sekarang?"; then open "$APP" || true; fi
pause_end
