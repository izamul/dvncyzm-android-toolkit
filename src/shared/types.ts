export type Transport = 'usb' | 'wifi' | 'emulator'
export type DeviceState = 'device' | 'offline' | 'unauthorized' | 'disconnected'

export interface Device {
  serial: string
  state: DeviceState
  transport: Transport
  alias?: string
  model?: string
  product?: string
  transportId?: string
  lastSeenAt: number
}

export type ErrorCode =
  | 'ADB_NOT_FOUND'
  | 'DEVICE_OFFLINE'
  | 'UNAUTHORIZED'
  | 'TIMEOUT'
  | 'COMMAND_FAILED'
  | 'INVALID_ARGUMENT'

export interface AppError {
  code: ErrorCode
  message: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

export interface AdbStatus {
  found: boolean
  path?: string
  version?: string
  source?: 'setting' | 'ANDROID_HOME' | 'sdk-default' | 'PATH'
}

export interface Settings {
  adbPath?: string
  scrcpyPath?: string
  theme: 'light' | 'dark' | 'system'
  aliases: Record<string, string>
  wifiHistory: string[]
  lastSeen: Record<string, { alias?: string; at: number }>
  logPresets: Array<{ name: string; filter: LogFilter }>
  scrcpy: Record<string, ScrcpyPrefs>
  macros: Array<{ id: string; name: string; pkg: string; apkDir: string; grant: string[] }>
  favorites: Array<{ id: string; name: string; cmd: string }>
  autoReconnect: Record<string, boolean>
  screenshotDir?: string
}

export interface ScrcpyPrefs {
  maxSize?: number
  bitRate?: string
  turnScreenOff?: boolean
  stayAwake?: boolean
  alwaysOnTop?: boolean
  noAudio?: boolean
  /** Mode kompatibilitas tampilan (render software, paksa X11): atasi layar scrcpy hitam di Linux */
  compat?: boolean
}

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F'

export interface LogEntry {
  id: number
  date: string
  time: string
  pid: number
  tid: number
  level: LogLevel
  tag: string
  msg: string
  crash?: boolean
}

export interface LogFilter {
  pkg?: string
  levels: LogLevel[]
  tags?: string[]
  query?: string
}

export interface CrashEvent {
  entryId: number
  kind: 'crash' | 'anr' | 'native'
  title: string
}

export interface AppInfo {
  pkg: string
  versionName?: string
  versionCode?: number
  targetSdk?: number
  system: boolean
  running: boolean
  apkPaths: string[]
  sizeBytes?: number
  firstInstallTime?: string
  lastUpdateTime?: string
  permissions?: Array<{ name: string; granted: boolean }>
}

export interface ForegroundApp {
  pkg: string
  activity: string
}

export interface Discovered {
  addr: string
  ip: string
  kind: 'connect' | 'pairing'
  source: 'mdns' | 'scan'
  /** nama layanan mDNS, mis. adb-R5CT123-AbCdEf */
  name?: string
}
export interface DiscoverResult {
  connect: Discovered[]
  pairing: Discovered[]
}
