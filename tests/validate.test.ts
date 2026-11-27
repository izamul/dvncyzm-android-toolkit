import { describe, it, expect } from 'vitest'
import { validSerial, validPackage, validPort, validAddress } from '../src/main/validate'

describe('validSerial', () => {
  it.each(['emulator-5554', '192.168.1.20:5555', '2B091FDH2000AB'])('terima %s', (s) => expect(validSerial(s)).toBe(s))
  it.each(['a;b', 'a b', '$(id)', '', 'a`b`', 'x|y', 'a&b', 5 as unknown as string])('tolak %s', (s) => expect(() => validSerial(s)).toThrow())
})
describe('validPackage', () => {
  it('terima nama paket', () => expect(validPackage('com.izam.tv')).toBe('com.izam.tv'))
  it.each(['com', 'com..a', '1com.a', 'com.a;rm', 'com.a b', 'com.a$(x)'])('tolak %s', (s) => expect(() => validPackage(s)).toThrow())
})
describe('validPort', () => {
  it('terima 1 dan 65535 dan string angka', () => {
    expect(validPort(1)).toBe(1)
    expect(validPort(65535)).toBe(65535)
    expect(validPort('5555')).toBe(5555)
  })
  it.each([0, 65536, -1, 1.5, 'abc', '12;3', null])('tolak %s', (p) => expect(() => validPort(p)).toThrow())
})
describe('validAddress', () => {
  it('port bawaan 5555', () => expect(validAddress('192.168.1.5')).toBe('192.168.1.5:5555'))
  it('menyertakan port', () => expect(validAddress(' 192.168.1.5:5556 ')).toBe('192.168.1.5:5556'))
  it.each(['1.2.3.4:99999', '1.2.3.4;ls', '-s foo', 'a b'])('tolak %s', (a) => expect(() => validAddress(a)).toThrow())
})
