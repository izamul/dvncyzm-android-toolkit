import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AdbStatus, AppInfo, CrashEvent, Device, DiscoverResult, ForegroundApp, LogEntry, LogFilter, Result, ScrcpyPrefs, Settings } from '../shared/types'

const call = <T>(ch: string, ...args: unknown[]): Promise<Result<T>> => ipcRenderer.invoke(ch, ...args)

export interface DeviceInfo {
  model?: string; manufacturer?: string; android?: string; sdk?: number
  size?: { w: number; h: number }; dpi?: number
  battery?: { level: number; charging: boolean } | null
  storage?: { freeBytes: number; totalBytes: number }
  memory?: { availBytes: number; totalBytes: number }
  ip?: string; clockSkewMs?: number
}
export interface FileEntry {
  name: string; type: 'dir' | 'file' | 'link' | 'other'; size: number; modified: string; perms: string; linkTarget?: string
}
export interface MacroStep { id: string; label: string; status: 'pending' | 'running' | 'ok' | 'error'; detail?: string }
export interface InstallResult { serial: string; ok: boolean; message: string; code?: string }

export type Events = {
  devices: Device[]
  'devices:error': string
  theme: boolean
  'logcat:lines': { serial: string; batch: LogEntry[] }
  'logcat:reset': { serial: string; entries: LogEntry[] }
  'logcat:crash': { serial: string; ev: CrashEvent }
  'macro:step': { serial: string; id: string; steps: MacroStep[] }
  'install:progress': { serial: string; state: 'running' | 'ok' | 'error'; message?: string; percent?: number; phase?: string }
  'shell:data': { id: string; data: string }
  'shell:exit': { id: string; code: number }
  'record:done': { serial: string; path?: string; error?: string }
  'scrcpy:exit': { serial: string; code: number | null; message: string }
}

// Hanya fungsi bertipe yang dibuka ke renderer; tidak ada perintah shell mentah.
const api = {
  platform: process.platform as string,
  adb: { status: () => call<AdbStatus>('adb:status'), pickPath: () => call<AdbStatus>('adb:pickPath') },
  scrcpyPath: { status: () => call<{ path: string | null; version: string | null }>('scrcpy:status'), pick: () => call<string | null>('scrcpy:pickPath') },
  devices: {
    list: () => call<Device[]>('devices:list'),
    watch: () => call<void>('devices:watch'),
    connect: (addr: string) => call<string>('devices:connect', addr),
    disconnect: (s: string) => call<void>('devices:disconnect', s),
    reconnect: (s: string) => call<void>('devices:reconnect', s),
    setAlias: (s: string, alias: string) => call<Record<string, string>>('devices:setAlias', s, alias),
    setAutoReconnect: (s: string, on: boolean) => call<Record<string, boolean>>('devices:setAutoReconnect', s, on),
    info: (s: string) => call<DeviceInfo>('devices:info', s),
    foreground: (s: string) => call<ForegroundApp | null>('devices:foreground', s),
    live: (s: string) => call<Pick<DeviceInfo, 'battery' | 'memory' | 'clockSkewMs'>>('devices:live', s),
    toWifi: (s: string) => call<string>('devices:toWifi', s),
    pair: (addr: string, code: string) => call<string>('devices:pair', addr, code),
    discover: (sweep: boolean) => call<DiscoverResult>('devices:discover', sweep),
    ip: (s: string) => call<string | null>('devices:ip', s)
  },
  screen: {
    screenshot: (s: string, copy: boolean) => call<{ path: string; copied: boolean; preview: string }>('screen:screenshot', s, copy),
    recordStart: (s: string, sec: number) => call<void>('screen:recordStart', s, sec),
    recordStop: (s: string) => call<string>('screen:recordStop', s),
    recording: (s: string) => call<boolean>('screen:recording', s),
    scrcpy: (s: string, o: ScrcpyPrefs) => call<void>('screen:scrcpy', s, o),
    pickDir: () => call<string | null>('screen:pickDir'),
    reveal: (p: string) => call<void>('app:reveal', p)
  },
  input: {
    popout: (s: string) => call<void>('remote:popout', s),
    key: (s: string, key: string, long = false) => call<void>('input:key', s, key, long),
    text: (s: string, t: string) => call<void>('input:text', s, t)
  },
  tweaks: {
    reverse: (s: string, p: number) => call<void>('tweaks:reverse', s, p),
    unreverse: (s: string, p: number) => call<void>('tweaks:unreverse', s, p),
    reverseList: (s: string) => call<Array<{ remote: string; local: string }>>('tweaks:reverseList', s),
    forward: (s: string, l: number, r: number) => call<void>('tweaks:forward', s, l, r),
    animations: (s: string, on: boolean) => call<void>('tweaks:animations', s, on),
    layoutBounds: (s: string, on: boolean) => call<void>('tweaks:layoutBounds', s, on),
    pointer: (s: string, on: boolean) => call<void>('tweaks:pointer', s, on),
    reboot: (s: string, mode: 'normal' | 'recovery' | 'bootloader') => call<void>('tweaks:reboot', s, mode),
    wmSize: (s: string, v: string) => call<void>('tweaks:wmSize', s, v),
    wmDensity: (s: string, v: number | 'reset') => call<void>('tweaks:wmDensity', s, v),
    darkMode: (s: string, on: boolean) => call<void>('tweaks:darkMode', s, on),
    fontScale: (s: string, v: number) => call<void>('tweaks:fontScale', s, v),
    proxy: (s: string, v: string | null) => call<void>('tweaks:proxy', s, v),
    autoTime: (s: string, on: boolean) => call<void>('tweaks:autoTime', s, on),
    setDate: (s: string, iso: string) => call<string>('tweaks:setDate', s, iso),
    localeSettings: (s: string) => call<void>('tweaks:localeSettings', s)
  },
  logcat: {
    start: (s: string) => call<void>('logcat:start', s),
    stop: (s: string) => call<void>('logcat:stop', s),
    setFilter: (s: string, f: LogFilter) => call<{ queryError?: string }>('logcat:setFilter', s, f),
    loadHistory: (s: string, n = 5000) => call<void>('logcat:loadHistory', s, n),
    clear: (s: string) => call<void>('logcat:clear', s),
    stack: (s: string, id: number) => call<string>('logcat:stack', s, id),
    save: (s: string) => call<{ path: string; count: number } | null>('logcat:save', s)
  },
  apps: {
    list: (s: string, kind: 'all' | 'user' | 'system') => call<AppInfo[]>('apps:list', s, kind),
    detail: (s: string, p: string) => call<AppInfo>('apps:detail', s, p),
    memory: (s: string, p: string) => call<number | undefined>('apps:memory', s, p),
    pickApks: () => call<string[]>('apps:pickApks'),
    install: (serials: string[], apks: string[]) => call<InstallResult[]>('apps:install', serials, apks),
    uninstall: (s: string, p: string, keep: boolean) => call<string>('apps:uninstall', s, p, keep),
    forceStop: (s: string, p: string) => call<void>('apps:forceStop', s, p),
    clearData: (s: string, p: string) => call<void>('apps:clearData', s, p),
    launch: (s: string, p: string) => call<void>('apps:launch', s, p),
    restart: (s: string, p: string) => call<void>('apps:restart', s, p),
    pullApk: (s: string, p: string) => call<string[]>('apps:pullApk', s, p),
    grant: (s: string, p: string, perm: string) => call<void>('apps:grant', s, p, perm),
    revoke: (s: string, p: string, perm: string) => call<void>('apps:revoke', s, p, perm),
    deepLink: (s: string, uri: string) => call<string>('apps:deepLink', s, uri),
    broadcast: (s: string, a: string, c?: string) => call<string>('apps:broadcast', s, a, c)
  },
  macros: {
    save: (list: Settings['macros']) => call<Settings['macros']>('macros:save', list),
    pickDir: () => call<string | null>('macros:pickDir'),
    run: (s: string, id: string) => call<{ ok: boolean; openLogcatFor?: string }>('macros:run', s, id)
  },
  files: {
    ls: (s: string, p: string, pkg?: string) => call<FileEntry[]>('files:ls', s, p, pkg),
    push: (s: string, locals: string[], remoteDir: string) => call<void>('files:push', s, locals, remoteDir),
    pushPick: (s: string, remoteDir: string) => call<number>('files:pushPick', s, remoteDir),
    pull: (s: string, remote: string) => call<string | null>('files:pull', s, remote),
    rm: (s: string, p: string) => call<void>('files:rm', s, p),
    rename: (s: string, dir: string, from: string, to: string) => call<void>('files:rename', s, dir, from, to),
    mkdir: (s: string, dir: string, name: string) => call<void>('files:mkdir', s, dir, name),
    pullRunAs: (s: string, pkg: string, remote: string) => call<string | null>('files:pullRunAs', s, pkg, remote)
  },
  shell: {
    open: (s: string, cols: number, rows: number) => call<string>('shell:open', s, cols, rows),
    write: (id: string, d: string) => call<void>('shell:write', id, d),
    resize: (id: string, c: number, r: number) => call<void>('shell:resize', id, c, r),
    close: (id: string) => call<void>('shell:close', id)
  },
  store: {
    get: () => call<Settings>('store:get'),
    set: (patch: Partial<Pick<Settings, 'theme' | 'logPresets' | 'favorites' | 'scrcpy'>>) => call<Settings>('store:set', patch)
  },
  pathForFile: (f: File): string => webUtils.getPathForFile(f),
  openExternal: (url: string) => call<void>('app:openExternal', url),
  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): () => void {
    const h = (_: unknown, p: Events[K]): void => cb(p)
    ipcRenderer.on(event, h)
    return () => ipcRenderer.removeListener(event, h)
  }
}

contextBridge.exposeInMainWorld('dvncyzm', api)
export type DvncyzmApi = typeof api
