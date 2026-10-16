import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRich, type RichNode } from '../src/shared/richText.ts'

const text = (nodes: RichNode[]): string =>
  nodes.map((n) => (typeof n === 'string' ? n : n.t === 'br' ? '\n' : n.t === 'hr' ? '---' : text(n.ch))).join('')

test('known tags become styled spans, unknown tags are unwrapped', () => {
  const out = parseRich('<mainText><stats><attention>60</attention> Attack Damage</stats><br><br><passive>Rapture</passive> hits</mainText>')
  assert.equal(text(out), '60 Attack Damage\n\nRapture hits')
  assert.deepEqual(out[0], { t: 'span', color: '#f0e6d2', b: true, ch: ['60'] })
})

test('markup that could run or load is never passed through', () => {
  const out = parseRich(`a<script>alert(1)</script>b<img src=x onerror="alert(1)">c<a href="javascript:x" onclick="y">d</a><iframe>e</iframe>`)
  assert.equal(text(out), 'abcd')
  assert.ok(!JSON.stringify(out).includes('onerror'))
})

test('font color must be a hex value', () => {
  const [a] = parseRich(`<font color='#48C4B7'>x</font>`)
  assert.deepEqual(a, { t: 'span', color: '#48C4B7', ch: ['x'] })
  const out = parseRich(`<font color="red;background:url(x)">y</font><font color='#fff" onload="z'>w</font>`)
  assert.equal(text(out), 'yw')
  assert.ok(out.every((n) => typeof n === 'string' || !('color' in n && n.color)))
})

test('entities are decoded to text, stray < stays text, br runs collapse and trim', () => {
  assert.equal(text(parseRich('<br>1 &lt; 2 &amp; &#65;<br><br><br><br>end<br>')), '1 < 2 & A\n\nend')
  assert.equal(text(parseRich('a < b')), 'a < b')
  assert.equal(text(parseRich('x<hr>y')), 'x---y')
})

test('unbalanced tags do not throw or leak', () => {
  assert.equal(text(parseRich('<b>bold <i>both</b> tail</i> end')), 'bold both tail end')
  assert.equal(text(parseRich('</b>lonely<b>')), 'lonely')
})
