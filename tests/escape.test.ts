import { describe, it, expect } from 'vitest'
import { escapeInputText, chunkEscaped, hasNonAscii } from '../src/main/input/escape'

describe('escapeInputText', () => {
  it('spasi menjadi %s', () => expect(escapeInputText('a b')).toBe('a%sb'))
  it('tanda kutip di-escape', () => expect(escapeInputText(`it's "x"`)).toBe(`it\\'s%s\\"x\\"`))
  it('& dan $ di-escape', () => expect(escapeInputText('a&b$c')).toBe('a\\&b\\$c'))
  it('semua karakter khusus shell di-escape', () => {
    for (const ch of '\\\'"`$&|;<>()*?~#') expect(escapeInputText(ch)).toBe('\\' + ch)
  })
  it('baris baru dibuang', () => expect(escapeInputText('a\nb')).toBe('ab'))
  it('huruf biasa tidak berubah', () => expect(escapeInputText('Abc123.-_/@')).toBe('Abc123.-_/@'))
})
describe('chunkEscaped', () => {
  it('memotong per 40 karakter', () => {
    const c = chunkEscaped('a'.repeat(100))
    expect(c.map((x) => x.length)).toEqual([40, 40, 20])
  })
  it('tidak memutus pasangan escape', () => {
    const s = 'a'.repeat(39) + '\\&' + 'b'.repeat(10)
    const c = chunkEscaped(s)
    expect(c.join('')).toBe(s)
    for (const x of c) expect(/(^|[^\\])(\\\\)*\\$/.test(x)).toBe(false)
  })
  it('string kosong', () => expect(chunkEscaped('')).toEqual([]))
})
describe('hasNonAscii', () => {
  it('mendeteksi', () => {
    expect(hasNonAscii('halo')).toBe(false)
    expect(hasNonAscii('café')).toBe(true)
    expect(hasNonAscii('こんにちは')).toBe(true)
  })
})
