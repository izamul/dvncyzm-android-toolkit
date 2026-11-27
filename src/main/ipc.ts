import { ipcMain, dialog, shell, Notification, BrowserWindow, app } from 'electron'
import { execFile } from 'child_process'
import { statSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { AdbRunner } from './adb/runner'
import { AdbError } from './adb/runner'
import { locateTool } from './adb/locate'
import type { DeviceWatcher } from './devices/watcher'
import type { Store } from './store'
import type { AdbStatus, AppError, Result, Settings } from '../shared/types'
import { ValidationError, validAddress, validPackage, validPort, validSerial } from './validate'
import { DeviceInfoService } from './devices/info'
import { WifiService } from './devices/wifi'
import { InputService } from './input/service'
import { openRemoteWindow } from './remoteWindow'
import { readForeground } from './devices/foreground'
import { ScreenService, type ScrcpyOptions } from './screen/service'
import { TweaksService, type RebootMode } from './tweaks/service'
import { LogcatStream } from './logcat/stream'
import { AppsService, type AppKind } from './apps/service'
import { FilesService } from './files/service'
import { runMacro } from './macros/runner'
import { ShellService } from './shell/service'

function toError(e: unknown): AppError {
  if (e instanceof AdbError || e instanceof ValidationError) return e.toAppError()
  return { code: 'COMMAND_FAILED', message: (e as Error)?.message ?? 'Galat tidak dikenal' }
}
async function wrap<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    return { ok: false, error: toError(e) }
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handle(ch: string, fn: (...a: any[]) => unknown): void {
  ipcMain.handle(ch, (_e, ...a) => wrap(() => fn(...a) as Promise<unknown>))
}

const EXTERNAL_ALLOWED = ['https://developer.android.com/', 'https://github.com/Genymobile/scrcpy', 'https://github.com/']

/** Path lokal dari drag-drop: harus mutlak dan benar-benar ada. */
function existingPath(p: unknown): string {
  if (typeof p !== 'string' || !p.startsWith('/') && !/^[A-Za-z]:\\/.test(p)) throw new ValidationError('Path lokal tidak valid')
  try {
    statSync(p)
  } catch {
    throw new ValidationError('File tidak ditemukan')
  }
  return p
}

export interface IpcDeps {
  adb: AdbRunner
  watcher: DeviceWatcher
  store: Store
  holder: { path?: string; scrcpy?: string }
  getWindow: () => BrowserWindow | null
  send: (ch: string, payload: unknown) => void
}

export function registerIpc(d: IpcDeps): { shutdown: () => void } {
  const { adb, watcher, store, holder, getWindow, send } = d

  const resolveAdb = (): AdbStatus => {
    const found = locateTool('adb', store.get().adbPath)
    holder.path = found?.path
    holder.scrcpy = locateTool('scrcpy', store.get().scrcpyPath)?.path
    return found ? { found: true, path: found.path, source: found.source } : { found: false }
  }
  const withVersion = (s: AdbStatus): Promise<AdbStatus> =>
    new Promise((resolve) => {
      if (!s.path) return resolve(s)
      execFile(s.path, ['version'], { timeout: 5000 }, (err, out) => {
        if (err) return resolve({ found: false })
        resolve({ ...s, version: /Version ([\d.\-\w]+)/.exec(out)?.[1] })
      })
    })
  resolveAdb()

  const info = new DeviceInfoService(adb)
  const wifi = new WifiService(adb)
  const input = new InputService(adb)
  const tweaks = new TweaksService(adb)
  const apps = new AppsService(adb)
  const files = new FilesService(adb)
  const screen = new ScreenService(adb, () => holder.path, () => holder.scrcpy, () => store.get().screenshotDir, {
    record: (e) => send('record:done', e),
    scrcpyExit: (e) => send('scrcpy:exit', e)
  })
  const aliasOf = (serial: string): string => store.get().aliases[serial] || serial
  const focused = (): boolean => !!getWindow()?.isFocused()

  const logcat = new LogcatStream(adb, {
    lines: (serial, batch) => send('logcat:lines', { serial, batch }),
    reset: (serial, entries) => send('logcat:reset', { serial, entries }),
    crash: (serial, ev) => {
      send('logcat:crash', { serial, ev })
      if (!focused() && Notification.isSupported()) new Notification({ title: `${ev.kind === 'anr' ? 'ANR' : 'Crash'} di ${aliasOf(serial)}`, body: ev.title }).show()
    }
  })
  const sh = new ShellService(() => holder.path, (id, data) => send('shell:data', { id, data }), (id, code) => send('shell:exit', { id, code }))

  // ---- adb ----
  handle('adb:status', async () => withVersion(resolveAdb()))
  handle('adb:pickPath', async () => {
    const r = await dialog.showOpenDialog({ title: 'Pilih file adb', properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return resolveAdb()
    store.set({ adbPath: r.filePaths[0] })
    const st = await withVersion(resolveAdb())
    if (!st.found) {
      store.set({ adbPath: undefined })
      resolveAdb()
      throw new AdbError('ADB_NOT_FOUND', 'File yang dipilih bukan adb yang valid.')
    }
    return st
  })
  handle('scrcpy:pickPath', async () => {
    const r = await dialog.showOpenDialog({ title: 'Pilih file scrcpy', properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return holder.scrcpy ?? null
    store.set({ scrcpyPath: r.filePaths[0] })
    resolveAdb()
    return holder.scrcpy ?? null
  })
  handle('scrcpy:status', async () => ({ path: holder.scrcpy ?? null, version: holder.scrcpy ? await screen.scrcpyVersion() : null }))

  // ---- perangkat ----
  handle('devices:list', () => watcher.refresh())
  handle('devices:watch', () => watcher.start())
  handle('devices:connect', async (addr: unknown) => {
    const a = validAddress(addr)
    const out = await adb.run(['connect', a], { timeoutMs: 10_000 })
    if (!/connected to/i.test(out) || /cannot|failed/i.test(out)) throw new AdbError('COMMAND_FAILED', out.trim())
    store.set({ wifiHistory: [a, ...store.get().wifiHistory.filter((x) => x !== a)].slice(0, 10) })
    await watcher.refresh()
    return out.trim()
  })
  handle('devices:disconnect', async (s: unknown) => {
    await adb.run(['disconnect', validSerial(s)])
    await watcher.refresh()
  })
  handle('devices:reconnect', async (s: unknown) => {
    const serial = validSerial(s)
    if (serial.includes(':')) await adb.run(['connect', serial], { timeoutMs: 10_000 })
    else await adb.runOn(serial, ['reconnect'])
    await watcher.refresh()
  })
  handle('devices:setAlias', (s: unknown, alias: unknown) => {
    const serial = validSerial(s)
    const aliases = { ...store.get().aliases }
    const a = typeof alias === 'string' ? alias.trim().slice(0, 60) : ''
    if (a) aliases[serial] = a
    else delete aliases[serial]
    store.set({ aliases })
    return aliases
  })
  handle('devices:setAutoReconnect', (s: unknown, on: unknown) => {
    const serial = validSerial(s)
    store.set({ autoReconnect: { ...store.get().autoReconnect, [serial]: !!on } })
    return store.get().autoReconnect
  })
  handle('devices:info', (s: unknown) => info.get(validSerial(s)))
  handle('devices:live', (s: unknown) => info.live(validSerial(s)))
  handle('devices:foreground', (s: unknown) => readForeground(adb, validSerial(s)))
  handle('devices:toWifi', (s: unknown) => wifi.usbToWifi(validSerial(s)))
  handle('devices:pair', (addr: unknown, code: unknown) => wifi.pair(String(addr), String(code)))
  handle('devices:discover', (sweep: unknown) => wifi.discover(!!sweep))
  handle('devices:ip', (s: unknown) => info.ip(validSerial(s)))

  // ---- layar ----
  handle('screen:screenshot', async (s: unknown, copy: unknown) => {
    const serial = validSerial(s)
    return screen.screenshot(serial, aliasOf(serial), !!copy)
  })
  handle('screen:recordStart', (s: unknown, sec: unknown) => {
    const serial = validSerial(s)
    return screen.startRecord(serial, aliasOf(serial), Number(sec) || 30)
  })
  handle('screen:recordStop', (s: unknown) => {
    const serial = validSerial(s)
    return screen.stopRecord(serial, aliasOf(serial))
  })
  handle('screen:recording', (s: unknown) => screen.isRecording(validSerial(s)))
  handle('screen:scrcpy', (s: unknown, opts: ScrcpyOptions) => {
    const serial = validSerial(s)
    const o: ScrcpyOptions = {
      maxSize: opts?.maxSize, bitRate: opts?.bitRate, turnScreenOff: !!opts?.turnScreenOff, stayAwake: !!opts?.stayAwake,
      alwaysOnTop: !!opts?.alwaysOnTop, noAudio: !!opts?.noAudio, compat: opts?.compat === undefined ? undefined : !!opts.compat
    }
    store.set({ scrcpy: { ...store.get().scrcpy, [serial]: { ...o } } })
    return screen.launchScrcpy(serial, aliasOf(serial), o)
  })
  handle('screen:pickDir', async () => {
    const r = await dialog.showOpenDialog({ title: 'Pilih folder simpan', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return store.get().screenshotDir ?? null
    store.set({ screenshotDir: r.filePaths[0] })
    return r.filePaths[0]
  })
  handle('app:reveal', (p: unknown) => {
    shell.showItemInFolder(existingPath(p))
  })

  // ---- input ----
  handle('remote:popout', (s: unknown) => {
    const serial = validSerial(s)
    openRemoteWindow(serial, aliasOf(serial))
  })
  handle('input:key', (s: unknown, key: unknown, long: unknown) => input.key(validSerial(s), String(key), !!long))
  handle('input:text', (s: unknown, text: unknown) => input.text(validSerial(s), String(text)))

  // ---- tweaks ----
  handle('tweaks:reverse', (s: unknown, p: unknown) => tweaks.reverse(validSerial(s), validPort(p)))
  handle('tweaks:unreverse', (s: unknown, p: unknown) => tweaks.unreverse(validSerial(s), validPort(p)))
  handle('tweaks:reverseList', (s: unknown) => tweaks.reverseList(validSerial(s)))
  handle('tweaks:forward', (s: unknown, l: unknown, r: unknown) => tweaks.forward(validSerial(s), validPort(l), validPort(r)))
  handle('tweaks:animations', (s: unknown, on: unknown) => tweaks.setAnimations(validSerial(s), !!on))
  handle('tweaks:layoutBounds', (s: unknown, on: unknown) => tweaks.layoutBounds(validSerial(s), !!on))
  handle('tweaks:pointer', (s: unknown, on: unknown) => tweaks.pointer(validSerial(s), !!on))
  handle('tweaks:reboot', (s: unknown, mode: unknown) => {
    if (!['normal', 'recovery', 'bootloader'].includes(String(mode))) throw new ValidationError('Mode reboot tidak dikenal')
    return tweaks.reboot(validSerial(s), mode as RebootMode)
  })
  handle('tweaks:wmSize', (s: unknown, v: unknown) => tweaks.wmSize(validSerial(s), String(v)))
  handle('tweaks:wmDensity', (s: unknown, v: unknown) => tweaks.wmDensity(validSerial(s), v === 'reset' ? 'reset' : Number(v)))
  handle('tweaks:darkMode', (s: unknown, on: unknown) => tweaks.darkMode(validSerial(s), !!on))
  handle('tweaks:fontScale', (s: unknown, v: unknown) => tweaks.fontScale(validSerial(s), Number(v)))
  handle('tweaks:proxy', (s: unknown, v: unknown) => tweaks.proxy(validSerial(s), v ? String(v) : null))
  handle('tweaks:autoTime', (s: unknown, on: unknown) => tweaks.autoTime(validSerial(s), !!on))
  handle('tweaks:setDate', (s: unknown, iso: unknown) => {
    const dt = new Date(String(iso))
    if (isNaN(dt.getTime())) throw new ValidationError('Tanggal tidak valid')
    return tweaks.setDate(validSerial(s), dt)
  })
  handle('tweaks:localeSettings', (s: unknown) => tweaks.openLocaleSettings(validSerial(s)))

  // ---- logcat ----
  handle('logcat:start', (s: unknown) => logcat.start(validSerial(s)))
  handle('logcat:stop', (s: unknown) => logcat.stop(validSerial(s)))
  handle('logcat:setFilter', (s: unknown, f: unknown) => {
    const filter = f as { pkg?: string; levels?: string[]; tags?: string[]; query?: string }
    const lv = (filter?.levels ?? []).filter((x) => ['V', 'D', 'I', 'W', 'E', 'F'].includes(x))
    return logcat.setFilter(validSerial(s), {
      pkg: filter?.pkg ? validPackage(filter.pkg) : undefined,
      levels: lv as never,
      tags: (filter?.tags ?? []).map(String).slice(0, 50),
      query: filter?.query ? String(filter.query).slice(0, 500) : undefined
    })
  })
  handle('logcat:loadHistory', (s: unknown, n: unknown) => logcat.loadHistory(validSerial(s), Number(n) || 5000))
  handle('logcat:clear', (s: unknown) => logcat.clear(validSerial(s)))
  handle('logcat:stack', (s: unknown, id: unknown) => logcat.stack(validSerial(s), Number(id)))
  handle('logcat:save', async (s: unknown) => {
    const serial = validSerial(s)
    const r = await dialog.showSaveDialog({ title: 'Simpan log', defaultPath: `${aliasOf(serial)}-logcat.txt`, filters: [{ name: 'Teks', extensions: ['txt'] }] })
    if (r.canceled || !r.filePath) return null
    return { path: r.filePath, count: await logcat.save(serial, r.filePath) }
  })

  // ---- aplikasi ----
  handle('apps:list', (s: unknown, kind: unknown) => apps.list(validSerial(s), (['all', 'user', 'system'].includes(String(kind)) ? kind : 'user') as AppKind))
  handle('apps:detail', (s: unknown, p: unknown) => apps.detail(validSerial(s), validPackage(p)))
  handle('apps:memory', (s: unknown, p: unknown) => apps.memory(validSerial(s), validPackage(p)))
  handle('apps:pickApks', async () => {
    const r = await dialog.showOpenDialog({ title: 'Pilih APK', properties: ['openFile', 'multiSelections'], filters: [{ name: 'APK', extensions: ['apk'] }] })
    return r.canceled ? [] : r.filePaths
  })
  handle('apps:install', async (serials: unknown, apks: unknown) => {
    if (!Array.isArray(serials) || !serials.length || serials.length > 20) throw new ValidationError('Pilih perangkat')
    if (!Array.isArray(apks)) throw new ValidationError('Pilih APK')
    const list = apks.map(existingPath)
    return Promise.all(
      serials.map(async (s) => {
        const serial = validSerial(s)
        send('install:progress', { serial, state: 'running' })
        try {
          const r = await apps.install(serial, list, (st) => send('install:progress', { serial, state: 'running', ...st }))
          send('install:progress', { serial, state: r.ok ? 'ok' : 'error', message: r.message, percent: r.ok ? 100 : undefined })
          return { serial, ...r }
        } catch (e) {
          const err = toError(e)
          send('install:progress', { serial, state: 'error', message: err.message })
          return { serial, ok: false, message: err.message }
        }
      })
    )
  })
  handle('apps:uninstall', (s: unknown, p: unknown, keep: unknown) => apps.uninstall(validSerial(s), validPackage(p), !!keep))
  handle('apps:forceStop', (s: unknown, p: unknown) => apps.forceStop(validSerial(s), validPackage(p)))
  handle('apps:clearData', (s: unknown, p: unknown) => apps.clearData(validSerial(s), validPackage(p)))
  handle('apps:launch', (s: unknown, p: unknown) => apps.launch(validSerial(s), validPackage(p)))
  handle('apps:restart', (s: unknown, p: unknown) => apps.restart(validSerial(s), validPackage(p)))
  handle('apps:pullApk', async (s: unknown, p: unknown) => {
    const r = await dialog.showOpenDialog({ title: 'Simpan APK ke folder', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return []
    return apps.pullApk(validSerial(s), validPackage(p), r.filePaths[0])
  })
  handle('apps:grant', (s: unknown, p: unknown, perm: unknown) => apps.grant(validSerial(s), validPackage(p), String(perm)))
  handle('apps:revoke', (s: unknown, p: unknown, perm: unknown) => apps.revoke(validSerial(s), validPackage(p), String(perm)))
  handle('apps:deepLink', (s: unknown, uri: unknown) => apps.deepLink(validSerial(s), String(uri)))
  handle('apps:broadcast', (s: unknown, a: unknown, c: unknown) => apps.broadcast(validSerial(s), String(a), c ? String(c) : undefined))

  // ---- macro ----
  handle('macros:save', (list: unknown) => {
    if (!Array.isArray(list)) throw new ValidationError('Macro tidak valid')
    const clean = list.slice(0, 50).map((m) => ({
      id: String(m.id).slice(0, 40), name: String(m.name).slice(0, 60), pkg: validPackage(m.pkg),
      apkDir: String(m.apkDir), grant: (Array.isArray(m.grant) ? m.grant : []).map(String).slice(0, 30)
    }))
    store.set({ macros: clean })
    return clean
  })
  handle('macros:pickDir', async () => {
    const r = await dialog.showOpenDialog({ title: 'Folder APK', properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  handle('macros:run', (s: unknown, id: unknown) => {
    const serial = validSerial(s)
    const m = store.get().macros.find((x) => x.id === id)
    if (!m) throw new ValidationError('Macro tidak ditemukan')
    return runMacro(apps, serial, m, (steps) => send('macro:step', { serial, id, steps }))
  })

  // ---- file ----
  handle('files:ls', (s: unknown, p: unknown, pkg: unknown) => files.ls(validSerial(s), String(p), pkg ? String(pkg) : undefined))
  handle('files:push', async (s: unknown, locals: unknown, remoteDir: unknown) => {
    if (!Array.isArray(locals)) throw new ValidationError('Pilih file')
    for (const l of locals) await files.push(validSerial(s), existingPath(l), String(remoteDir))
  })
  handle('files:pushPick', async (s: unknown, remoteDir: unknown) => {
    const r = await dialog.showOpenDialog({ title: 'Pilih file untuk dikirim', properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return 0
    for (const l of r.filePaths) await files.push(validSerial(s), l, String(remoteDir))
    return r.filePaths.length
  })
  handle('files:pull', async (s: unknown, remote: unknown) => {
    const r = await dialog.showOpenDialog({ title: 'Simpan ke folder', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    await files.pull(validSerial(s), String(remote), r.filePaths[0])
    return r.filePaths[0]
  })
  handle('files:rm', (s: unknown, p: unknown) => files.rm(validSerial(s), String(p)))
  handle('files:rename', (s: unknown, dir: unknown, from: unknown, to: unknown) => files.rename(validSerial(s), String(dir), String(from), String(to)))
  handle('files:mkdir', (s: unknown, dir: unknown, name: unknown) => files.mkdir(validSerial(s), String(dir), String(name)))
  handle('files:pullRunAs', async (s: unknown, pkg: unknown, remote: unknown) => {
    const name = String(remote).split('/').pop() || 'file'
    const r = await dialog.showSaveDialog({ title: 'Simpan file', defaultPath: name })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, await files.pullRunAs(validSerial(s), validPackage(pkg), String(remote)))
    return r.filePath
  })

  // ---- shell ----
  handle('shell:open', (s: unknown, c: unknown, r: unknown) => sh.open(validSerial(s), Number(c) || 80, Number(r) || 24))
  handle('shell:write', (id: unknown, data: unknown) => sh.write(String(id), String(data)))
  handle('shell:resize', (id: unknown, c: unknown, r: unknown) => sh.resize(String(id), Number(c), Number(r)))
  handle('shell:close', (id: unknown) => sh.close(String(id)))

  // ---- pengaturan ----
  handle('store:get', () => store.get())
  handle('store:set', (patch: Partial<Settings>) => {
    const ok: Partial<Settings> = {}
    if (patch?.theme && ['light', 'dark', 'system'].includes(patch.theme)) ok.theme = patch.theme
    if (Array.isArray(patch?.logPresets)) ok.logPresets = patch.logPresets.slice(0, 100)
    if (Array.isArray(patch?.favorites)) ok.favorites = patch.favorites.slice(0, 100).map((f) => ({ id: String(f.id), name: String(f.name).slice(0, 60), cmd: String(f.cmd).slice(0, 1000) }))
    if (patch?.scrcpy && typeof patch.scrcpy === 'object') ok.scrcpy = patch.scrcpy
    return store.set(ok)
  })
  handle('app:openExternal', (url: unknown) => {
    if (typeof url !== 'string' || !EXTERNAL_ALLOWED.some((p) => url.startsWith(p))) throw new ValidationError('Tautan tidak diizinkan')
    return shell.openExternal(url)
  })
  void join
  void app
  return {
    shutdown: () => {
      logcat.stopAll()
      sh.closeAll()
      screen.shutdown()
    }
  }
}
