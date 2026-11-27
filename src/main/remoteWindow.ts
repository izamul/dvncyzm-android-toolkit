import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'

let remote: BrowserWindow | null = null

/**
 * Remote TV sebagai jendela kecil yang selalu berada di atas jendela lain
 * (termasuk scrcpy), jadi bisa dipakai sambil melihat layar perangkat.
 */
export function openRemoteWindow(serial: string, label: string): void {
  const title = `Remote ${label || serial}`.slice(0, 60)
  if (remote && !remote.isDestroyed()) remote.close()
  const w = new BrowserWindow({
    width: 280,
    height: 500,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    title,
    icon: join(__dirname, '../../build/icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E1210' : '#ECEEEA',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  remote = w
  // 'floating' tetap di atas jendela aplikasi lain; di macOS ikut ke semua desktop/Space
  w.setAlwaysOnTop(true, 'floating')
  if (process.platform === 'darwin') w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  w.setMenuBarVisibility(false)
  w.once('ready-to-show', () => w.show())
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  w.on('closed', () => {
    if (remote === w) remote = null
  })
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) void w.loadURL(`${dev}?remote=${encodeURIComponent(serial)}`)
  else void w.loadFile(join(__dirname, '../renderer/index.html'), { query: { remote: serial } })
}

export function closeRemoteWindow(): void {
  if (remote && !remote.isDestroyed()) remote.close()
}
