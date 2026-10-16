// Tiny whitelist converter for the HTML-ish text in Data Dragon / CommunityDragon descriptions.
// Output is a plain node tree the renderer maps to elements: nothing from the source ever reaches the DOM as markup.

export type RichNode = string | { t: 'br' } | { t: 'hr' } | { t: 'span'; color?: string; b?: true; i?: true; ch: RichNode[] }

type Style = { color?: string; b?: true; i?: true }

const GOLD = '#f0b232'
const STYLES: Record<string, Style> = {
  b: { b: true }, strong: { b: true }, i: { i: true }, em: { i: true },
  attention: { color: '#f0e6d2', b: true },
  passive: { color: GOLD, b: true }, active: { color: GOLD, b: true }, unique: { color: GOLD, b: true },
  rules: { color: '#7d8597', i: true }, flavortext: { color: '#7d8597', i: true },
  status: { color: '#d8a8f0' }, speed: { color: '#c9f27a' }, keywordmajor: { color: '#f0e6d2', b: true },
  scalead: { color: '#ff8a3d' }, physicaldamage: { color: '#ff8a3d' },
  scaleap: { color: '#7ab8ff' }, magicdamage: { color: '#35d6ff' }, truedamage: { color: '#ffffff' },
  scalehealth: { color: '#5de08f' }, healing: { color: '#5de08f' }, shield: { color: '#d9c58c' },
  scalearmor: { color: '#e8b04a' }, scalemr: { color: '#7fc4e8' }, scalemana: { color: '#6ab0ff' },
  ornnbonus: { color: '#ff9d4a' }, raritymythic: { color: '#ff9d4a' }, raritylegendary: { color: '#e8a64a' }, raritygeneric: { color: '#cfc7b3' },
  onhit: { color: '#f0e6d2' }
}
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed'])
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })

const HEX = /^#[0-9a-f]{3,8}$/i
const fontColor = (attrs: string) => {
  const c = /\bcolor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
  const v = (c?.[1] ?? c?.[2] ?? c?.[3])?.trim()
  return v && HEX.test(v) ? v : undefined
}

interface Frame { tag: string; style: Style | null; ch: RichNode[] }

function push(list: RichNode[], n: RichNode) {
  // never more than one blank line
  if (typeof n !== 'string' && n.t === 'br') {
    const a = list[list.length - 1]
    const b = list[list.length - 2]
    if (a && b && typeof a !== 'string' && a.t === 'br' && typeof b !== 'string' && b.t === 'br') return
  }
  if (typeof n === 'string' && n === '') return
  list.push(n)
}

function trimBr(list: RichNode[]): RichNode[] {
  const isBr = (n?: RichNode) => !!n && typeof n !== 'string' && n.t === 'br'
  let a = 0
  let b = list.length
  while (a < b && isBr(list[a])) a++
  while (b > a && isBr(list[b - 1])) b--
  return list.slice(a, b)
}

export function parseRich(html: string): RichNode[] {
  const root: Frame = { tag: '', style: null, ch: [] }
  const stack: Frame[] = [root]
  let dropping = 0 // depth inside a dropped element
  const top = () => stack[stack.length - 1]
  const re = /<(\/?)([a-zA-Z][\w:-]*)([^<>]*)>|([^<]+)|</g
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    if (m[4] !== undefined || m[2] === undefined) {
      if (!dropping) push(top().ch, decode(m[4] ?? '<'))
      continue
    }
    const close = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (DROP.has(tag)) {
      if (!/\/\s*$/.test(m[3])) dropping = Math.max(0, dropping + (close ? -1 : 1))
      continue
    }
    if (dropping) continue
    if (tag === 'br') { if (!close) push(top().ch, { t: 'br' }); continue }
    if (tag === 'hr') { if (!close) push(top().ch, { t: 'hr' }); continue }
    if (close) {
      const at = stack.map((f) => f.tag).lastIndexOf(tag)
      if (at > 0) while (stack.length > at) fold(stack.pop()!, top())
      continue
    }
    if (/\/\s*$/.test(m[3])) continue
    let style: Style | null = STYLES[tag] ?? null
    if (tag === 'font') {
      const color = fontColor(m[3])
      style = color ? { color } : null
    }
    stack.push({ tag, style, ch: [] })
  }
  while (stack.length > 1) fold(stack.pop()!, top())
  return trimBr(root.ch)
}

// a styled frame becomes a span, an unknown or plain one hands its children to the parent
function fold(f: Frame, parent: Frame) {
  if (!f.style) {
    for (const n of f.ch) push(parent.ch, n)
    return
  }
  const ch = trimBr(f.ch)
  if (ch.length) parent.ch.push({ t: 'span', ...f.style, ch })
}
