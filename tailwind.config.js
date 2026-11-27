export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', rail: 'var(--rail)', card: 'var(--card)', line: 'var(--border)',
        inp: 'var(--border-input)', ink: 'var(--ink)', ink2: 'var(--ink-2)',
        accent: 'var(--accent)', ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)'
      },
      fontFamily: { sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'], mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'] }
    }
  }
}
