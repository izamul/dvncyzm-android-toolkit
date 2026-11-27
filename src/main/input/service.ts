import type { AdbRunner } from '../adb/runner'
import { chunkEscaped, escapeInputText, hasNonAscii } from './escape'
import { ValidationError } from '../validate'

export const KEYCODES: Record<string, number> = {
  up: 19, down: 20, left: 21, right: 22, ok: 23, back: 4, home: 3,
  volup: 24, voldown: 25, menu: 82, playpause: 85, power: 26, mute: 164, search: 84, delete: 67, enter: 66
}

export class InputService {
  constructor(private adb: AdbRunner) {}

  async key(serial: string, key: string, longpress = false): Promise<void> {
    const code = KEYCODES[key]
    if (code === undefined) throw new ValidationError('Tombol tidak dikenal')
    const args = ['shell', 'input', 'keyevent', ...(longpress ? ['--longpress'] : []), String(code)]
    await this.adb.runOn(serial, args)
  }

  async text(serial: string, text: string): Promise<void> {
    if (typeof text !== 'string' || text.length > 2000) throw new ValidationError('Teks terlalu panjang')
    if (hasNonAscii(text)) throw new ValidationError('Huruf non-ASCII tidak didukung oleh input text')
    for (const chunk of chunkEscaped(escapeInputText(text))) {
      // adb shell menggabungkan argumen menjadi satu string untuk shell perangkat; bagian ini sudah di-escape
      await this.adb.runOn(serial, ['shell', 'input', 'text', chunk])
    }
  }
}
