import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseDevicesL, parseTrackDevices, transportOf } from '../src/main/devices/parse'

const fixture = readFileSync(new URL('./fixtures/devices-l.txt', import.meta.url), 'utf8')

describe('parseDevicesL', () => {
  const list = parseDevicesL(fixture, 1000)
  it('membaca semua perangkat dan status', () => {
    expect(list.map((d) => [d.serial, d.state])).toEqual([
      ['192.168.1.20:5555', 'device'],
      ['emulator-5554', 'device'],
      ['2B091FDH2000AB', 'unauthorized'],
      ['192.168.1.34:5555', 'offline']
    ])
  })
  it('menentukan jenis sambungan', () => {
    expect(list.map((d) => d.transport)).toEqual(['wifi', 'emulator', 'usb', 'wifi'])
  })
  it('membaca model dan transport_id', () => {
    expect(list[0].model).toBe('X96 Mini')
    expect(list[0].transportId).toBe('3')
    expect(list[2].model).toBeUndefined()
  })
  it('mengabaikan daemon start dan baris kosong', () => {
    expect(parseDevicesL('* daemon not running; starting now at tcp:5037\n* daemon started successfully\nList of devices attached\n\n')).toEqual([])
  })
  it('keadaan lain dianggap offline', () => {
    expect(parseDevicesL('abc123 no permissions (user in plugdev group)\n')[0].state).toBe('offline')
  })
})

describe('parseTrackDevices', () => {
  it('membaca baris serial\\tstate', () => {
    const l = parseTrackDevices('emulator-5554\tdevice\n192.168.1.20:5555\toffline\n')
    expect(l).toHaveLength(2)
    expect(l[1].state).toBe('offline')
  })
  it('muatan kosong berarti tidak ada perangkat', () => {
    expect(parseTrackDevices('')).toEqual([])
  })
})

describe('transportOf', () => {
  it.each([['emulator-5554', 'emulator'], ['10.0.0.2:5555', 'wifi'], ['ABCDEF123', 'usb']])('%s', (s, t) => {
    expect(transportOf(s)).toBe(t)
  })
})
