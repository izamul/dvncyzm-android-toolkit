# dvncyzm - pemasang untuk Windows. Jalankan lewat install.bat (klik dua kali).
# Tidak butuh hak Administrator. Berkas ini sengaja hanya berisi karakter ASCII.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'dvncyzm-app'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('dvncyzm-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$warnings = New-Object System.Collections.Generic.List[string]
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Say($m)  { Write-Host ''; Write-Host "==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "! $m" -ForegroundColor Yellow; $warnings.Add($m) | Out-Null }
# Jalankan perintah native; kembalikan kode keluar tanpa membuat stderr menjadi galat fatal
function Native([scriptblock]$sb) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $sb 2>&1 | Out-Host; return $LASTEXITCODE } finally { $ErrorActionPreference = $old }
}
function NativeQuiet([scriptblock]$sb) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $sb *> $null; return $LASTEXITCODE } catch { return 1 } finally { $ErrorActionPreference = $old }
}

try {
  if (-not (Test-Path (Join-Path $here 'app\out\main\index.js'))) { throw "Folder 'app' tidak lengkap. Ekstrak ulang seluruh arsip lalu jalankan lagi." }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }

  # ---------- 1. Node.js (hanya untuk memasang; sementara bila belum ada) ----------
  $nodeOk = $false
  try { $v = & node -p "process.versions.node.split('.')[0]" 2>$null; $nodeOk = ([int]$v -ge 20) -and [bool](Get-Command npm -ErrorAction SilentlyContinue) } catch { $nodeOk = $false }
  if ($nodeOk) {
    Say "Memakai Node.js yang sudah terpasang"
  } else {
    Say 'Mengunduh Node.js sementara (dihapus setelah selesai)'
    $base = 'https://nodejs.org/dist/latest-v22.x'
    $sums = [string](Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt").Content
    $m = [regex]::Match($sums, "(?m)^([0-9a-f]{64})\s+(node-v[\d.]+-win-$arch\.zip)\s*$")
    if (-not $m.Success) { throw 'Tidak bisa menemukan berkas Node.js. Periksa koneksi internet.' }
    $zip = Join-Path $tmp $m.Groups[2].Value
    Invoke-WebRequest -UseBasicParsing "$base/$($m.Groups[2].Value)" -OutFile $zip
    if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $m.Groups[1].Value) { throw 'Checksum Node.js tidak cocok. Unduhan dibatalkan.' }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $nodeRoot = Join-Path $tmp ([IO.Path]::GetFileNameWithoutExtension($m.Groups[2].Value))
    $env:Path = "$nodeRoot;$env:Path"
  }

  # ---------- 2. Salin aplikasi dan pasang Electron ----------
  Say "Memasang aplikasi ke $dest"
  New-Item -ItemType Directory -Force -Path "$dest\app" | Out-Null
  foreach ($d in 'out', 'build') { if (Test-Path "$dest\app\$d") { Remove-Item -Recurse -Force "$dest\app\$d" } }
  Copy-Item -Recurse -Force -Path "$here\app\*" -Destination "$dest\app"
  if (Test-Path "$here\README.txt") { Copy-Item -Force "$here\README.txt" "$dest\README.txt" }
  Push-Location "$dest\app"
  try {
    $rc = Native { npm install --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error }
    if ($rc -ne 0) { throw 'npm install gagal. Periksa koneksi internet lalu jalankan lagi.' }
    Say 'Mengunduh Electron'
    $rc = Native { node node_modules\electron\install.js }
    if ($rc -ne 0) { throw 'Gagal mengunduh Electron.' }
    if (-not (Test-Path "$dest\app\node_modules\electron\dist\electron.exe")) { throw 'Berkas Electron tidak ditemukan setelah pemasangan.' }
    # modul terminal (tab Shell): binari siap pakai ikut paketnya
    $ptyOk = NativeQuiet { node -e "require('node-pty')" }
    if ($ptyOk -ne 0) { Warn 'Tab Shell tidak aktif (modul terminal tidak bisa dimuat). Fitur lain tetap berfungsi.' }
  } finally { Pop-Location }

  # ---------- 3. adb ----------
  $haveAdb = [bool](Get-Command adb -ErrorAction SilentlyContinue) -or
    (Test-Path "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe") -or
    ($env:ANDROID_HOME -and (Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe")) -or
    (Test-Path "$dest\android-sdk\platform-tools\adb.exe")
  if ($haveAdb) {
    Say 'adb sudah ada, dilewati'
  } else {
    Say 'Mengunduh Android Platform-Tools resmi dari Google (tunduk pada lisensi SDK Google)'
    try {
      $pt = Join-Path $tmp 'pt.zip'
      Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $pt
      New-Item -ItemType Directory -Force -Path "$dest\android-sdk" | Out-Null
      Expand-Archive -Path $pt -DestinationPath "$dest\android-sdk" -Force
    } catch {
      Warn 'Gagal mengunduh Platform-Tools. Pasang adb sendiri atau pilih lokasinya di tab Pengaturan.'
    }
  }

  # ---------- 4. scrcpy (opsional, lewat winget) ----------
  $haveScrcpy = [bool](Get-Command scrcpy -ErrorAction SilentlyContinue) -or (Test-Path "$env:LOCALAPPDATA\Microsoft\WinGet\Links\scrcpy.exe")
  if ($haveScrcpy) {
    Say 'scrcpy sudah ada, dilewati'
  } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    Say 'Memasang scrcpy lewat winget'
    $rc = Native { winget install --id Genymobile.scrcpy -e --accept-package-agreements --accept-source-agreements }
    if ($rc -ne 0) { Warn 'scrcpy gagal dipasang otomatis. Fitur scrcpy tidak aktif; coba: winget install Genymobile.scrcpy' }
  } else {
    Warn 'scrcpy tidak dipasang (winget tidak ditemukan). Fitur scrcpy aktif setelah Anda memasangnya dari github.com/Genymobile/scrcpy.'
  }

  # ---------- 5. Peluncur dan pintasan ----------
  Say 'Membuat pintasan'
  $vbs = @'
Option Explicit
Dim sh, env, fso, base, sdk, exe
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set env = sh.Environment("Process")
base = "__DEST__"
sdk = base & "\android-sdk"
If env("ANDROID_HOME") = "" Then
  If fso.FolderExists(sdk & "\platform-tools") Then env("ANDROID_HOME") = sdk
End If
exe = base & "\app\node_modules\electron\dist\electron.exe"
sh.Run """" & exe & """ """ & base & "\app""", 1, False
'@
  $vbs = ($vbs -replace '__DEST__', $dest) -replace "`r?`n", "`r`n"
  [IO.File]::WriteAllText("$dest\launch.vbs", $vbs, [Text.Encoding]::Unicode)

  $wsh = New-Object -ComObject WScript.Shell
  function MakeLnk($path) {
    $s = $wsh.CreateShortcut($path)
    $s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $s.Arguments = '"' + "$dest\launch.vbs" + '"'
    $s.WorkingDirectory = $dest
    $s.IconLocation = "$dest\app\build\icon.ico"
    $s.Description = 'dvncyzm - alat bantu Android'
    $s.Save()
  }
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  MakeLnk (Join-Path $startMenu 'dvncyzm.lnk')
  try { MakeLnk (Join-Path ([Environment]::GetFolderPath('Desktop')) 'dvncyzm.lnk') } catch { }

  $un = "@echo off`r`ndel `"%APPDATA%\Microsoft\Windows\Start Menu\Programs\dvncyzm.lnk`" 2>nul`r`ndel `"%USERPROFILE%\Desktop\dvncyzm.lnk`" 2>nul`r`necho dvncyzm dihapus. Pengaturan Anda tetap ada di %APPDATA%\dvncyzm.`r`ncd /d `"%TEMP%`"`r`nrmdir /s /q `"$dest`"`r`n"
  [IO.File]::WriteAllText("$dest\uninstall.bat", $un, [Text.Encoding]::ASCII)

  Say 'Selesai'
  Write-Host "Buka dari Start Menu atau pintasan di Desktop: dvncyzm"
  Write-Host "Copot pemasangan: $dest\uninstall.bat"
  if ($warnings.Count -gt 0) {
    Write-Host ''; Write-Host 'Catatan:' -ForegroundColor Yellow
    foreach ($w in $warnings) { Write-Host " - $w" }
  }
} catch {
  Write-Host ''
  Write-Host "GAGAL: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
