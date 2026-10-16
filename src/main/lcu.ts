import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import https from 'node:https'
import { dirname, join } from 'node:path'
import WebSocket from 'ws'
import { getSettings, updateSettings } from './settings.ts'

// Public Riot Games root CA (https://static.developer.riotgames.com/docs/lol/riotgames.pem), used by the local LCU
const RIOT_ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIIEIDCCAwgCCQDJC+QAdVx4UDANBgkqhkiG9w0BAQUFADCB0TELMAkGA1UEBhMC
VVMxEzARBgNVBAgTCkNhbGlmb3JuaWExFTATBgNVBAcTDFNhbnRhIE1vbmljYTET
MBEGA1UEChMKUmlvdCBHYW1lczEdMBsGA1UECxMUTG9MIEdhbWUgRW5naW5lZXJp
bmcxMzAxBgNVBAMTKkxvTCBHYW1lIEVuZ2luZWVyaW5nIENlcnRpZmljYXRlIEF1
dGhvcml0eTEtMCsGCSqGSIb3DQEJARYeZ2FtZXRlY2hub2xvZ2llc0ByaW90Z2Ft
ZXMuY29tMB4XDTEzMTIwNDAwNDgzOVoXDTQzMTEyNzAwNDgzOVowgdExCzAJBgNV
BAYTAlVTMRMwEQYDVQQIEwpDYWxpZm9ybmlhMRUwEwYDVQQHEwxTYW50YSBNb25p
Y2ExEzARBgNVBAoTClJpb3QgR2FtZXMxHTAbBgNVBAsTFExvTCBHYW1lIEVuZ2lu
ZWVyaW5nMTMwMQYDVQQDEypMb0wgR2FtZSBFbmdpbmVlcmluZyBDZXJ0aWZpY2F0
ZSBBdXRob3JpdHkxLTArBgkqhkiG9w0BCQEWHmdhbWV0ZWNobm9sb2dpZXNAcmlv
dGdhbWVzLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKoJemF/
6PNG3GRJGbjzImTdOo1OJRDI7noRwJgDqkaJFkwv0X8aPUGbZSUzUO23cQcCgpYj
21ygzKu5dtCN2EcQVVpNtyPuM2V4eEGr1woodzALtufL3Nlyh6g5jKKuDIfeUBHv
JNyQf2h3Uha16lnrXmz9o9wsX/jf+jUAljBJqsMeACOpXfuZy+YKUCxSPOZaYTLC
y+0GQfiT431pJHBQlrXAUwzOmaJPQ7M6mLfsnpHibSkxUfMfHROaYCZ/sbWKl3lr
ZA9DbwaKKfS1Iw0ucAeDudyuqb4JntGU/W0aboKA0c3YB02mxAM4oDnqseuKV/CX
8SQAiaXnYotuNXMCAwEAATANBgkqhkiG9w0BAQUFAAOCAQEAf3KPmddqEqqC8iLs
lcd0euC4F5+USp9YsrZ3WuOzHqVxTtX3hR1scdlDXNvrsebQZUqwGdZGMS16ln3k
WObw7BbhU89tDNCN7Lt/IjT4MGRYRE+TmRc5EeIXxHkQ78bQqbmAI3GsW+7kJsoO
q3DdeE+M+BUJrhWorsAQCgUyZO166SAtKXKLIcxa+ddC49NvMQPJyzm3V+2b1roP
SvD2WV8gRYUnGmy/N0+u6ANq5EsbhZ548zZc+BI4upsWChTLyxt2RxR7+uGlS1+5
EcGfKZ+g024k/J32XP4hdho7WYAS2xMiV83CfLR/MNi8oSMaVQTdKD8cpgiWJk3L
XWehWA==
-----END CERTIFICATE-----`

const POLL_MS = 3000
// the cert is for a Riot hostname, not 127.0.0.1; the chain is still verified against the Riot CA
const skipHostCheck = () => undefined
const agent = new https.Agent({ ca: RIOT_ROOT_PEM, checkServerIdentity: skipHostCheck })

interface Creds {
  port: number
  password: string
}
export interface LcuResponse {
  status: number
  data: any
}

let creds: Creds | null = null
let ws: WebSocket | null = null
let timer: NodeJS.Timeout | null = null
let polls = 0
const emitter = new EventEmitter()
const subs = new Map<string, Set<(data: any, eventType: string) => void>>()

export const on = (event: 'connect' | 'disconnect', cb: () => void) => void emitter.on(event, cb)

export function subscribe(uri: string, cb: (data: any, eventType: string) => void): () => void {
  if (!subs.has(uri)) subs.set(uri, new Set())
  subs.get(uri)!.add(cb)
  return () => void subs.get(uri)?.delete(cb)
}

const basic = (c: Creds) => 'Basic ' + Buffer.from(`riot:${c.password}`).toString('base64')

function rawRequest(c: Creds, method: string, path: string, body?: unknown): Promise<LcuResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const req = https.request(
      {
        host: '127.0.0.1',
        port: c.port,
        path,
        method,
        agent,
        timeout: 10_000,
        headers: {
          Authorization: basic(c),
          Accept: 'application/json',
          ...(payload !== undefined && { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
        }
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (d) => chunks.push(d))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let data: any = text
          try {
            data = text ? JSON.parse(text) : undefined
          } catch {}
          resolve({ status: res.statusCode ?? 0, data })
        })
        res.on('error', reject)
      }
    )
    req.on('timeout', () => req.destroy(new Error('LCU request timeout')))
    req.on('error', reject)
    req.end(payload)
  })
}

export function request(method: string, path: string, body?: unknown): Promise<LcuResponse> {
  if (!creds) return Promise.reject(new Error('LCU not connected'))
  return rawRequest(creds, method, path, body)
}

// lockfile format: name:pid:port:password:protocol
const parseLockfile = (text: string): Creds | null => {
  const [, , port, password] = text.trim().split(':')
  return port && password ? { port: Number(port), password } : null
}

const readLockfile = (dir: string) => readFile(join(dir, 'lockfile'), 'utf8').then(parseLockfile)

const rememberInstallDir = (dir: string | undefined) => {
  if (dir && dir !== getSettings().installDir) updateSettings({ installDir: dir })
}

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { windowsHide: true, timeout: 8000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  )

async function fromInstallDir(): Promise<Creds | null> {
  const dir = getSettings().installDir
  return dir ? readLockfile(dir) : null
}

// Riot Client knows where League is installed even before League itself is running
async function fromRiotClient(): Promise<Creds | null> {
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  const riot = await readLockfile(join(local, 'Riot Games', 'Riot Client', 'Config'))
  if (!riot) return null
  const res = await rawRequest(riot, 'GET', '/product-session/v1/sessions')
  const session = Object.values<any>(res.data ?? {}).find((s) => s?.productId === 'league_of_legends')
  const cfg = session?.launchConfiguration
  const args: string[] = cfg?.arguments ?? []
  const dir: string | undefined =
    cfg?.workingDirectory ??
    args.find((a) => a.startsWith('--install-directory='))?.slice('--install-directory='.length) ??
    (cfg?.executablePath ? dirname(cfg.executablePath) : undefined)
  if (!dir) return null
  const found = await readLockfile(dir)
  if (found) rememberInstallDir(dir)
  return found
}

// last resort; powershell is slow so tasklist gates it and it runs on every 5th poll at most
async function fromProcess(): Promise<Creds | null> {
  if (polls % 5 !== 1) return null
  if (!(await run('tasklist', ['/FI', 'IMAGENAME eq LeagueClientUx.exe', '/NH'])).includes('LeagueClientUx.exe')) return null
  const cmdline = await run('powershell', [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process -Filter 'name=''LeagueClientUx.exe''' | Select -Expand CommandLine"
  ])
  const port = cmdline.match(/--app-port=(\d+)/)?.[1]
  const password = cmdline.match(/--remoting-auth-token=([\w-]+)/)?.[1]
  if (!port || !password) return null
  rememberInstallDir(cmdline.match(/--install-directory=([^"]+)/)?.[1]?.trim())
  return { port: Number(port), password }
}

// a lockfile may be stale, so only a live HTTP answer plus an open socket count as connected
async function open(c: Creds): Promise<boolean> {
  const probe = await rawRequest(c, 'GET', '/riotclient/region-locale')
  if (probe.status !== 200) return false
  const sock = new WebSocket(`wss://127.0.0.1:${c.port}`, 'wamp', {
    headers: { Authorization: basic(c) },
    handshakeTimeout: 5000,
    agent,
    ca: RIOT_ROOT_PEM,
    checkServerIdentity: skipHostCheck as never // ws types it as returning boolean, tls wants undefined
  })
  sock.on('error', () => {})
  await new Promise<void>((resolve, reject) => {
    sock.once('open', resolve)
    sock.once('error', reject)
  })
  sock.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg[0] !== 8 || msg[1] !== 'OnJsonApiEvent') return
      const { uri, eventType, data } = msg[2]
      subs.get(uri)?.forEach((cb) => {
        try {
          cb(data, eventType)
        } catch (e) {
          console.error('lcu subscriber', uri, e)
        }
      })
    } catch {}
  })
  sock.on('close', () => {
    if (ws !== sock) return
    ws = null
    creds = null
    emitter.emit('disconnect')
    schedule()
  })
  sock.send(JSON.stringify([5, 'OnJsonApiEvent']))
  ws = sock
  creds = c
  return true
}

async function poll() {
  timer = null
  polls++
  let found = false
  for (const find of [fromInstallDir, fromRiotClient, fromProcess]) {
    try {
      const c = await find()
      if (c && (await open(c))) {
        found = true
        break
      }
    } catch {}
  }
  if (found) emitter.emit('connect')
  else schedule()
}

function schedule() {
  if (!timer) timer = setTimeout(poll, POLL_MS)
}

export function startLcu() {
  void poll()
}

export function stopLcu() {
  if (timer) clearTimeout(timer)
  timer = null
  ws?.terminate()
}
