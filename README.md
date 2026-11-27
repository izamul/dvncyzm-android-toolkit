# dvncyzm

Aplikasi desktop (Mac, Linux, Windows) untuk pekerjaan Android sehari-hari. Intinya "adb dengan tampilan": tidak perlu hafal perintah terminal.

Dibangun dengan Electron, Vue 3, TypeScript, Pinia, dan Tailwind. Rencana awal ada di `rencana-dvncyzm.md`.

## Fitur

| Tab / Fitur | Fungsi |
|---|---|
| **Perangkat** | Info model, baterai, memori, penyimpanan, IP. Kartu "Sedang dibuka" menampilkan aplikasi yang aktif di layar. Screenshot (dengan preview), rekam layar, scrcpy, aksi cepat (animasi, batas layout, reverse). |
| **Daftar perangkat** | USB dan Wi-Fi. Perangkat di jaringan yang sama (mDNS dan port 5555) muncul otomatis tanpa cek IP. Pairing dari sidebar. Sambung ulang otomatis. |
| **Remote TV** | Panel melayang yang bisa dipakai dari tab mana pun (`Shift+R`). Tombol 📌 memindahkannya ke jendela terpisah yang selalu di atas. |
| **Logcat** | Log langsung dengan filter per aplikasi, level, dan teks. Deteksi crash dan ANR, preset filter, simpan ke file. |
| **Aplikasi** | Install APK (tarik-lepas atau pilih file) dengan bar progres. Uninstall, force stop, clear data, buka, ambil APK, deep link, broadcast, macro "Pasang bersih". |
| **File** | Jelajah penyimpanan perangkat, kirim dan ambil file, ganti nama, hapus, buat folder. |
| **Shell** | Terminal langsung ke perangkat (xterm + node-pty), dengan perintah favorit. |
| **Pengaturan tes** | Resolusi dan density, tema gelap, proxy HTTP, jam dan tanggal, bahasa. |
| **Ikon (i)** | Penjelasan singkat bahasa awam di tiap fitur. |

Pintasan: `Cmd/Ctrl+1…7` pindah tab, `Cmd/Ctrl+Shift+S` screenshot, `Cmd/Ctrl+Shift+M` scrcpy, `Cmd/Ctrl+Shift+R` remote melayang.

## Panduan pasang (untuk pengguna)

Zip siap pakai ada di folder [`releases/`](releases/) di repo ini:

| OS | Unduh | Script di dalam zip | Jalankan |
|---|---|---|---|
| Mac | [`releases/dvncyzm-mac.zip`](releases/dvncyzm-mac.zip) | `dvncyzm-mac/install.command` | klik dua kali (jika diblokir: klik kanan → Open) |
| Linux | [`releases/dvncyzm-linux.zip`](releases/dvncyzm-linux.zip) | `dvncyzm-linux/install.sh` | `cd dvncyzm-linux && bash install.sh` |
| Windows | [`releases/dvncyzm-windows.zip`](releases/dvncyzm-windows.zip) | `dvncyzm-windows/install.bat` | klik dua kali |

Ekstrak zip, lalu jalankan **satu** script di folder paling luar (sejajar dengan `README.txt` dan folder `app/`). Di zip Windows ada juga `install.ps1`; itu dipanggil otomatis oleh `install.bat`.

Script memasang semua yang dibutuhkan (Electron, `adb` bila belum ada, `scrcpy` bila memungkinkan) lalu membuat peluncur aplikasi. Untuk memperbarui, unduh zip terbaru dan jalankan script yang sama lagi.

### Menyiapkan perangkat Android
1. Buka **Pengaturan → Tentang ponsel**, ketuk **Nomor build** 7 kali untuk mengaktifkan Opsi Pengembang.
2. Aktifkan **Debugging USB**, colok kabel, lalu izinkan "Allow USB debugging" di layar perangkat.
3. Opsional, tanpa kabel (Android 11+): aktifkan **Debugging nirkabel**. Perangkat muncul otomatis di bagian "Di jaringan" pada daftar kiri. Jika muncul "Siap dipasangkan", ketik kode 6 angka dari ponsel.

### scrcpy (opsional, untuk mirror layar)
- Mac: `brew install scrcpy`
- Linux: `sudo apt install scrcpy` (versi 1.x lama tetap jalan, tanpa audio)
- Windows: `winget install Genymobile.scrcpy`

## Pengembangan

Prasyarat: Node.js 20+ dan npm. Di Linux butuh `make`, `g++`, `python3` (kompilasi `node-pty`). Di Mac butuh Xcode Command Line Tools. Perlu `adb` untuk menguji dengan perangkat.

```bash
npm install          # postinstall mengompilasi node-pty untuk Electron
npm run dev          # mode pengembangan
npm test             # Vitest
npm run typecheck    # vue-tsc dan tsc
npm run build        # build ke out/
npm run dist         # dmg/nsis/AppImage ke dist/
npm run build && bash scripts/make-dist.sh ./dist-installer   # 3 folder installer (mac, linux, windows)
# lalu zip ketiganya dan timpa isi releases/ sebelum commit (lihat bagian Rilis)
```

### Struktur
```
src/main/        proses utama: adb, logcat, apps, files, screen (scrcpy, rekam), shell, ipc.ts
src/preload/     jembatan bertipe window.dvncyzm
src/renderer/    Vue: views/, components/, stores/, tips.ts (teks ikon i)
src/shared/      tipe bersama
tests/           Vitest (parser, validasi, runner, install, screen)
scripts/         make-dist.sh, installers/ per OS
```

### Aturan penting saat menambah kode
- Renderer tidak boleh memanggil Node/Electron langsung. Tambahkan handler di `src/main/ipc.ts`, ekspos lewat `src/preload/index.ts`, dan **validasi semua argumen di main** (`src/main/validate.ts`).
- Semua perintah memakai `execFile`/`spawn` **tanpa shell**. Pengecualian hanya tab Shell.
- Jangan kirim objek reaktif Vue lewat IPC (error "An object could not be cloned"). Bungkus dengan `plain()` dari `src/renderer/src/fmt.ts`.
- `watch` dengan banyak sumber: pakai `watch([() => a, () => b], …)`, bukan getter yang mengembalikan array baru (memicu callback terus-menerus).
- Parser keluaran adb ditulis sebagai fungsi murni dan diuji di `tests/`.
- Tambahkan teks bantuan awam di `src/renderer/src/tips.ts` untuk fitur baru yang istilahnya teknis.

## Panduan PR

1. Buat branch dari `main`: `git checkout -b fix/nama-singkat` (atau `feat/...`).
2. Pastikan lolos sebelum push:
   ```bash
   npm run typecheck && npm test && npm run build
   ```
3. Commit kecil dan jelas, misalnya `fix: install APK gagal karena objek reaktif`.
4. Di deskripsi PR tulis: **apa yang berubah**, **kenapa**, **cara mengujinya**, dan OS/perangkat yang dipakai menguji.
5. Fitur yang menyentuh perangkat nyata (scrcpy, rekam layar, `dumpsys`) sebaiknya disebutkan sudah dicoba di perangkat apa, karena tes otomatis memakai adb tiruan.

## Rilis (memperbarui zip di `releases/`)
Zip dibuat dari kode yang sudah di-build, jadi urutannya:
```bash
npm run build
bash scripts/make-dist.sh ./dist-installer
cd dist-installer && for o in mac linux windows; do zip -qr ../releases/dvncyzm-$o.zip dvncyzm-$o; done
```
Lalu commit tiga zip itu bersama perubahan kodenya. Setiap rilis menambah sekitar 2,5 MB ke riwayat git; kalau repo mulai berat, pindahkan zip ke GitHub Releases.

## Keamanan
`contextIsolation`, `sandbox`, tanpa `nodeIntegration`, CSP ketat. Argumen divalidasi di main process. Tidak ada eksekusi lewat shell kecuali tab Shell yang memang terminal buatan pengguna.

## Pemecahan masalah

| Gejala | Coba |
|---|---|
| "adb tidak ditemukan" | Pasang Platform-Tools, atau pilih lokasi `adb` di Pengaturan. |
| Perangkat berstatus `unauthorized` | Izinkan debugging di layar perangkat, cabut lalu colok lagi. |
| Perangkat tidak muncul | Cek kabel data (bukan kabel charger), mode USB "Transfer file", dan Debugging USB aktif. |
| scrcpy tidak mau jalan | Pesan penyebab tampil di notifikasi. Perbarui scrcpy. Cek versinya di Pengaturan. |
| scrcpy layar hitam (Linux) | Centang "Atasi layar hitam" di pengaturan scrcpy. |
| Install APK gagal | Baca pesan di bawah bar progres. Contoh umum: tanda tangan beda (uninstall dulu), versi lebih lama, penyimpanan penuh. |
| Rekam layar gagal | Beberapa perangkat tidak punya `screenrecord`, atau encoder menolak resolusi bawaan. Aplikasi otomatis mencoba 720p. |
| Layar aplikasi aktif tidak terbaca | Layar mati atau di layar kunci. Format `dumpsys` bervariasi antar versi Android. |

## Belum ada
- Diagnosa (grafik memori/CPU, frame lambat, bugreport).
- Pairing lewat QR, pembaruan otomatis, pembundelan adb/scrcpy.
- Persen install untuk APK split (banyak file).
