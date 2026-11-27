#!/usr/bin/env bash
# dvncyzm - pemasang untuk Linux.   Jalankan:  bash install.sh
# Tidak butuh root, kecuali Anda setuju memasang paket sistem (alat build, scrcpy).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
DEST="$DATA/dvncyzm-app"
BIN="$HOME/.local/bin"
APPS="$DATA/applications"
NODE_MIN=20
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
WARNINGS=()

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; WARNINGS+=("$*"); }
die()  { printf '\n\033[31mGAGAL: %s\033[0m\n' "$*" >&2; exit 1; }
ask()  { # ask "pertanyaan" : sukses bila jawabannya ya (tanpa terminal dianggap ya)
  [ "${DVNCYZM_ASSUME_YES:-0}" = 1 ] && return 0
  [ -t 0 ] || return 0
  local a; read -r -p "$1 [Y/n] " a || return 0
  case "${a:-Y}" in [Yy]*) return 0 ;; *) return 1 ;; esac
}
can_sudo() { [ "${DVNCYZM_NO_SUDO:-0}" != 1 ] && command -v sudo >/dev/null 2>&1; }

PM=""
for p in apt-get dnf pacman zypper; do command -v "$p" >/dev/null 2>&1 && { PM="$p"; break; }; done
pm_install() {
  case "$PM" in
    apt-get) sudo apt-get install -y "$@" ;;
    dnf)     sudo dnf install -y "$@" ;;
    pacman)  sudo pacman -S --noconfirm --needed "$@" ;;
    zypper)  sudo zypper --non-interactive install "$@" ;;
    *) return 1 ;;
  esac
}

case "$(uname -m)" in
  x86_64|amd64)  ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "Arsitektur $(uname -m) belum didukung." ;;
esac
[ -f "$HERE/app/out/main/index.js" ] || die "Folder 'app' tidak lengkap. Ekstrak ulang seluruh arsip lalu jalankan lagi."
command -v curl >/dev/null 2>&1 || die "curl tidak ditemukan. Pasang dulu (mis. sudo apt install curl)."

# ---------- 1. Node.js (hanya untuk memasang; dipakai sementara bila belum ada) ----------
node_ok() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 &&
    [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MIN" ]
}
if node_ok; then
  say "Memakai Node.js $(node -v) yang sudah terpasang"
  NODE_ROOT="$(dirname "$(dirname "$(readlink -f "$(command -v node)")")")"
else
  say "Mengunduh Node.js sementara (dihapus setelah selesai)"
  command -v tar >/dev/null 2>&1 && command -v xz >/dev/null 2>&1 || die "Butuh tar dan xz (mis. sudo apt install xz-utils)."
  BASE="https://nodejs.org/dist/latest-v22.x"
  LINE="$(curl -fsSL "$BASE/SHASUMS256.txt" | grep -E " node-v[0-9.]+-linux-$ARCH\.tar\.xz\$" | head -1)" || true
  [ -n "$LINE" ] || die "Tidak bisa menemukan berkas Node.js. Periksa koneksi internet."
  SHA="${LINE%% *}"; FILE="${LINE##* }"
  curl -fSL "$BASE/$FILE" -o "$TMP/$FILE" || die "Gagal mengunduh Node.js."
  echo "$SHA  $TMP/$FILE" | sha256sum -c - >/dev/null 2>&1 || die "Checksum Node.js tidak cocok. Unduhan dibatalkan."
  tar -xJf "$TMP/$FILE" -C "$TMP"
  NODE_ROOT="$TMP/${FILE%.tar.xz}"
  export PATH="$NODE_ROOT/bin:$PATH"
fi
[ -f "$NODE_ROOT/include/node/node.h" ] && export npm_config_nodedir="$NODE_ROOT"

# ---------- 2. Salin aplikasi dan pasang Electron ----------
say "Memasang aplikasi ke $DEST"
mkdir -p "$DEST/app"
rm -rf "$DEST/app/out" "$DEST/app/build"
cp -a "$HERE/app/." "$DEST/app/"
cp "$HERE/README.txt" "$DEST/README.txt" 2>/dev/null || true
( cd "$DEST/app" && npm install --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error ) \
  || die "npm install gagal. Periksa koneksi internet lalu jalankan lagi."
say "Mengunduh Electron"
( cd "$DEST/app" && node node_modules/electron/install.js ) || die "Gagal mengunduh Electron."
ELECTRON="$DEST/app/node_modules/electron/dist/electron"
[ -x "$ELECTRON" ] || die "Berkas Electron tidak ditemukan setelah pemasangan."

MISSING="$(ldd "$ELECTRON" 2>/dev/null | grep 'not found' || true)"
if [ -n "$MISSING" ]; then
  warn "Pustaka sistem berikut belum ada, aplikasi mungkin tidak bisa dibuka:"
  printf '%s\n' "$MISSING"
  warn "Di Ubuntu/Debian biasanya: sudo apt install libgtk-3-0 libnss3 libgbm1 libasound2"
fi

# ---------- 3. Terminal (node-pty) ----------
pty_ok() { ( cd "$DEST/app" && node -e "require('node-pty')" >/dev/null 2>&1 ); }
if ! pty_ok; then
  say "Menyiapkan modul terminal (tab Shell)"
  ( cd "$DEST/app" && npm rebuild node-pty --loglevel=error ) >/dev/null 2>&1 || true
  if ! pty_ok && [ -n "$PM" ] && can_sudo && ask "Alat build (make, g++, python3) dibutuhkan untuk tab Shell. Pasang sekarang?"; then
    case "$PM" in
      apt-get) pm_install build-essential python3 ;;
      dnf)     pm_install gcc-c++ make python3 ;;
      pacman)  pm_install base-devel python ;;
      zypper)  pm_install gcc-c++ make python3 ;;
    esac || true
    ( cd "$DEST/app" && npm rebuild node-pty --loglevel=error ) >/dev/null 2>&1 || true
  fi
  pty_ok || warn "Tab Shell tidak aktif (modul terminal gagal dikompilasi). Fitur lain tetap berfungsi. Pasang make, g++, python3 lalu jalankan pemasang ini lagi."
fi

# ---------- 4. adb ----------
have_adb() {
  command -v adb >/dev/null 2>&1 ||
    [ -x "${ANDROID_HOME:-/nonexistent}/platform-tools/adb" ] ||
    [ -x "$HOME/Android/Sdk/platform-tools/adb" ] ||
    [ -x "$DEST/android-sdk/platform-tools/adb" ]
}
if have_adb; then
  say "adb sudah ada, dilewati"
else
  say "Mengunduh Android Platform-Tools resmi dari Google (tunduk pada lisensi SDK Google)"
  if curl -fSL "https://dl.google.com/android/repository/platform-tools-latest-linux.zip" -o "$TMP/pt.zip"; then
    mkdir -p "$DEST/android-sdk"
    if command -v unzip >/dev/null 2>&1; then unzip -q -o "$TMP/pt.zip" -d "$DEST/android-sdk"
    elif command -v python3 >/dev/null 2>&1; then python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$TMP/pt.zip" "$DEST/android-sdk"
    else warn "Butuh unzip atau python3 untuk mengekstrak Platform-Tools."; fi
    chmod +x "$DEST"/android-sdk/platform-tools/* 2>/dev/null || true
    have_adb || warn "adb belum terpasang. Pilih lokasinya manual di tab Pengaturan."
  else
    warn "Gagal mengunduh Platform-Tools. Pasang adb sendiri (sudo apt install adb) atau pilih lokasinya di tab Pengaturan."
  fi
fi

# ---------- 5. scrcpy (opsional) dan aturan udev USB ----------
if command -v scrcpy >/dev/null 2>&1; then
  say "scrcpy sudah ada, dilewati"
elif [ -n "$PM" ] && can_sudo && ask "Pasang scrcpy (cermin layar) lewat $PM?"; then
  pm_install scrcpy || warn "scrcpy gagal dipasang otomatis. Fitur scrcpy tidak aktif; pasang manual bila perlu."
else
  warn "scrcpy tidak dipasang. Fitur scrcpy tidak aktif sampai Anda memasangnya."
fi
if [ "$PM" = apt-get ] && can_sudo && ! ls /lib/udev/rules.d/*android* >/dev/null 2>&1 && ask "Pasang aturan udev supaya perangkat USB terbaca tanpa root?"; then
  pm_install android-sdk-platform-tools-common || warn "Aturan udev gagal dipasang. Lewat Wi-Fi tetap bisa."
fi

# ---------- 6. Peluncur, ikon menu, pencopot ----------
say "Membuat peluncur"
mkdir -p "$BIN" "$APPS"
cat > "$BIN/dvncyzm" <<LAUNCH
#!/usr/bin/env bash
D="$DEST"
if [ -z "\${ANDROID_HOME:-}" ] && [ -d "\$D/android-sdk/platform-tools" ]; then export ANDROID_HOME="\$D/android-sdk"; fi
exec "\$D/app/node_modules/electron/dist/electron" --no-sandbox "\$D/app" "\$@"
LAUNCH
chmod +x "$BIN/dvncyzm"
cat > "$APPS/dvncyzm.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=dvncyzm
Comment=Alat bantu Android: perangkat, logcat, aplikasi, file
Exec=$BIN/dvncyzm
Icon=$DEST/app/build/icon.png
Terminal=false
Categories=Development;
StartupWMClass=dvncyzm
DESK
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
cat > "$DEST/uninstall.sh" <<UNI
#!/usr/bin/env bash
rm -f "$BIN/dvncyzm" "$APPS/dvncyzm.desktop"
rm -rf "$DEST"
echo "dvncyzm dihapus. Pengaturan Anda tetap ada di ~/.config/dvncyzm (hapus sendiri bila tidak perlu)."
UNI
chmod +x "$DEST/uninstall.sh"

say "Selesai"
echo "Buka dari menu aplikasi ('dvncyzm') atau jalankan: $BIN/dvncyzm"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "(Tambahkan $BIN ke PATH bila ingin menjalankan 'dvncyzm' dari terminal.)" ;; esac
echo "Copot pemasangan: bash $DEST/uninstall.sh"
if [ "${#WARNINGS[@]}" -gt 0 ]; then
  printf '\n\033[33mCatatan:\033[0m\n'
  for w in "${WARNINGS[@]}"; do printf ' - %s\n' "$w"; done
fi
