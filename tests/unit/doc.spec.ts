import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseDoc, serializeDoc } from '../../src/shared/doc'
import { mk } from './cells'

const fixture = readFileSync(join(__dirname, '../fixtures/hf-trace.walkthrough'), 'utf8')
const doc = (cells: unknown[]) => JSON.stringify({ format: 'walkthrough', version: 1, cells })
const issuePath = (text: string) => {
  try {
    parseDoc(text)
  } catch (e) {
    return (e as { issues: { path: unknown[] }[] }).issues[0].path
  }
  throw new Error('parsed')
}

test('fixture round-trips byte for byte', () => {
  expect(serializeDoc(parseDoc(fixture).cells)).toBe(fixture)
})

test('rejects an empty document (kills: dropping .min(1))', () => {
  expect(issuePath(doc([]))).toEqual(['cells'])
})

test('rejects a first cell that is indented (kills: max = 0 → depth+1 for i=0)', () => {
  expect(issuePath(doc(mk('c1 A')))).toEqual(['cells', 0, 'depth'])
})

test('rejects a depth jump of two (kills: <= max → <= max + 1)', () => {
  expect(issuePath(doc(mk('c0 A', 'c2 B')))).toEqual(['cells', 1, 'depth'])
})

test('accepts one step in and any step out', () => {
  expect(parseDoc(doc(mk('c0 A', 'c1 B', 'c2 C', 'c0 D'))).cells).toHaveLength(4)
})

test('rejects an unknown kind, a code cell with height, an unknown language, a duplicate id', () => {
  const [a] = mk('c0 A')
  expect(issuePath(doc([{ ...a, kind: 'x' }]))).toEqual(['cells', 0, 'kind'])
  expect(issuePath(doc([{ ...a, height: 3 }]))).toEqual(['cells', 0])
  expect(issuePath(doc([{ ...a, lang: 'Klingon' }]))).toEqual(['cells', 0, 'lang'])
  expect(issuePath(doc([a, { ...a, depth: 1 }]))).toEqual(['cells', 1, 'id'])
})
