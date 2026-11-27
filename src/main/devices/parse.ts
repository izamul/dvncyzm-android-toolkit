import type { Device, DeviceState, Transport } from '../../shared/types'

const STATES: DeviceState[] = ['device', 'offline', 'unauthorized']

export function transportOf(serial: string): Transport {
  if (serial.startsWith('emulator-')) return 'emulator'
  if (serial.includes(':')) return 'wifi'
  return 'usb'
}

function normalizeState(s: string): DeviceState | null {
  if ((STATES as string[]).includes(s)) return s as DeviceState
  // keadaan lain (mis. "no permissions", "recovery", "sideload") dianggap offline
  return s ? 'offline' : null
}

/** Parse keluaran `adb devices -l`. */
export function parseDevicesL(output: string, now = Date.now()): Device[] {
  const result: Device[] = []
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('List of devices') || line.startsWith('*')) continue
    const m = /^(\S+)\s+(device|offline|unauthorized|no permissions|recovery|sideload|bootloader|authorizing|connecting)\b(.*)$/.exec(line)
    if (!m) continue
    const [, serial, rawState, rest] = m
    const state = normalizeState(rawState)
    if (!state) continue
    const props: Record<string, string> = {}
    for (const kv of rest.trim().split(/\s+/)) {
      const i = kv.indexOf(':')
      if (i > 0) props[kv.slice(0, i)] = kv.slice(i + 1)
    }
    result.push({
      serial,
      state,
      transport: transportOf(serial),
      model: props.model?.replace(/_/g, ' '),
      product: props.product,
      transportId: props.transport_id,
      lastSeenAt: now
    })
  }
  return result
}

/** Parse satu muatan `adb track-devices`: baris "serial\tstate". */
export function parseTrackDevices(payload: string, now = Date.now()): Device[] {
  const result: Device[] = []
  for (const line of payload.split(/\r?\n/)) {
    const [serial, rawState] = line.trim().split(/\s+/)
    if (!serial || !rawState) continue
    const state = normalizeState(rawState)
    if (!state) continue
    result.push({ serial, state, transport: transportOf(serial), lastSeenAt: now })
  }
  return result
}
