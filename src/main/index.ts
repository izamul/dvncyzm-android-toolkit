import { app, BrowserWindow, Menu, nativeTheme, session } from 'electron'
import { join } from 'path'
import { AdbRunner } from './adb/runner'
import { DeviceWatcher } from './devices/watcher'
import { Store } from './store'
import { registerIpc } from './ipc'
import { validAddress } from './validate'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    icon: join(__dirname, '../../build/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E1210' : '#ECEEEA',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win?.show())

  // Tidak memuat URL luar di jendela aplikasi.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (!(dev && url.startsWith(dev)) && !url.startsWith('file://')) e.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => (win = null))
}

function buildMenu(): void {
  const mac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' as const },
      { role: 'editMenu' as const },
      {
        label: 'Tampilan',
        submenu: [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }, { type: 'separator' as const }, { role: 'resetZoom' as const }, { role: 'zoomIn' as const }, { role: 'zoomOut' as const }, { type: 'separator' as const }, { role: 'togglefullscreen' as const }]
      },
      { role: 'windowMenu' as const }
    ])
  )
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    try {
      app.dock?.setIcon(join(__dirname, '../../build/icon.png'))
    } catch {
      /* ikon bawaan */
    }
  }
  // Tolak semua permintaan izin (kamera, lokasi, dll.); aplikasi tidak memerlukannya.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  const store = new Store()
  const holder: { path?: string; scrcpy?: string } = {}
  const adb = new AdbRunner(() => holder.path)
  const send = (ch: string, payload: unknown): void => win?.webContents.send(ch, payload)
  const lastTry = new Map<string, number>()
  const autoReconnect = (devices: { serial: string; state: string }[]): void => {
    const on = store.get().autoReconnect
    for (const [serial, enabled] of Object.entries(on)) {
      if (!enabled || !serial.includes(':')) continue
      const d = devices.find((x) => x.serial === serial)
      if (d?.state === 'device') continue
      if (Date.now() - (lastTry.get(serial) ?? 0) < 10_000) continue
      lastTry.set(serial, Date.now())
      try {
        adb.run(['connect', validAddress(serial)], { timeoutMs: 8000 }).catch(() => undefined)
      } catch {
        /* serial tidak valid: abaikan */
      }
    }
  }
  const watcher = new DeviceWatcher(
    adb,
    (devices) => {
      const lastSeen = { ...store.get().lastSeen }
      for (const d of devices) if (d.state === 'device') lastSeen[d.serial] = { alias: store.get().aliases[d.serial], at: d.lastSeenAt }
      store.set({ lastSeen })
      send('devices', devices)
      autoReconnect(devices)
    },
    (message) => send('devices:error', message)
  )
  const ipc = registerIpc({ adb, watcher, store, holder, getWindow: () => win, send })

  // TV box sering memutus Wi-Fi adb setelah tidur: cek ulang berkala untuk sambung ulang otomatis
  setInterval(() => watcher.refresh().catch(() => undefined), 15_000).unref()

  buildMenu()
  nativeTheme.on('updated', () => send('theme', nativeTheme.shouldUseDarkColors))
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
  app.on('before-quit', () => {
    watcher.stop()
    ipc.shutdown()
  })
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
