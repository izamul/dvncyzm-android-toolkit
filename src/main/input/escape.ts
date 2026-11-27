/** Escape teks untuk `adb shell input text`. Spasi menjadi %s, karakter khusus shell di-escape. */
export const NON_ASCII = /[^\x00-\x7F]/

export function hasNonAscii(text: string): boolean {
  return NON_ASCII.test(text)
}

export function escapeInputText(text: string): string {
  let out = ''
  for (const ch of text) {
    if (ch === ' ') out += '%s'
    else if (ch === '%') out += '\\%'
    else if ('\\\'"`$&|;<>()*?~#'.includes(ch)) out += '\\' + ch
    else if (ch === '\n' || ch === '\r') continue
    else out += ch
  }
  return out
}

/** Pecah jadi potongan ≤ size karakter tanpa memotong di tengah escape (\x). */
export function chunkEscaped(escaped: string, size = 40): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < escaped.length) {
    let end = Math.min(i + size, escaped.length)
    // jangan memisahkan "\x" atau "%s"
    if (end < escaped.length) {
      const before = escaped.slice(i, end)
      const trailingBackslashes = /\\+$/.exec(before)?.[0].length ?? 0
      if (trailingBackslashes % 2 === 1) end -= 1
      else if (before.endsWith('%')) end -= 1
    }
    if (end <= i) end = i + 1
    chunks.push(escaped.slice(i, end))
    i = end
  }
  return chunks
}
