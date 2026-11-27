import { AppError } from '../shared/types'

const SERIAL = /^[\w.:\-]+$/
const PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/

export class ValidationError extends Error {
  code = 'INVALID_ARGUMENT' as const
  constructor(message: string) {
    super(message)
  }
  toAppError(): AppError {
    return { code: this.code, message: this.message }
  }
}

export function validSerial(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 128 || !SERIAL.test(v)) {
    throw new ValidationError('Serial perangkat tidak valid')
  }
  return v
}

export function validPackage(v: unknown): string {
  if (typeof v !== 'string' || v.length > 255 || !PACKAGE.test(v)) {
    throw new ValidationError('Nama paket tidak valid')
  }
  return v
}

export function validPort(v: unknown): number {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 65535) {
    throw new ValidationError('Port harus angka 1–65535')
  }
  return n
}

/** Alamat "ip:port" atau "host:port" untuk adb connect. Port bawaan 5555 bila dikosongkan. */
export function validAddress(v: unknown): string {
  if (typeof v !== 'string') throw new ValidationError('Alamat tidak valid')
  const m = /^([\w.\-]+)(?::(\d{1,5}))?$/.exec(v.trim())
  if (!m) throw new ValidationError('Alamat tidak valid')
  const port = m[2] ? validPort(m[2]) : 5555
  return `${m[1]}:${port}`
}
