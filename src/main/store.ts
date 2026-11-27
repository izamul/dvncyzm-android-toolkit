import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import type { Settings } from '../shared/types'

const DEFAULTS: Settings = {
  theme: 'system', aliases: {}, wifiHistory: [], lastSeen: {}, logPresets: [], scrcpy: {}, macros: [], favorites: [], autoReconnect: {}
}

export class Store {
  private data: Settings = { ...DEFAULTS }
  constructor(private file = join(app.getPath('userData'), 'dvncyzm.json')) {
    try {
      this.data = { ...DEFAULTS, ...JSON.parse(readFileSync(this.file, 'utf8')) }
    } catch {
      /* file belum ada atau rusak: pakai bawaan */
    }
  }
  get(): Settings {
    return this.data
  }
  set(patch: Partial<Settings>): Settings {
    this.data = { ...this.data, ...patch }
    mkdirSync(join(this.file, '..'), { recursive: true })
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
    return this.data
  }
}
