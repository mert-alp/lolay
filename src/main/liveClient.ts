import https from 'node:https'

// The in-game Live Client API uses a self-signed cert. This agent is only ever passed to the 127.0.0.1:2999 request below.
const agent = new https.Agent({ rejectUnauthorized: false })

export interface ClientPlayer {
  riotIdGameName?: string
  riotIdTagLine?: string
  position?: string // TOP | JUNGLE | MIDDLE | BOTTOM | UTILITY, "" outside ranked-style Summoner's Rift
}

// null = game client not reachable (yet)
export function playerList(): Promise<ClientPlayer[] | null> {
  return new Promise((resolve) => {
    const req = https.get({ host: '127.0.0.1', port: 2999, path: '/liveclientdata/playerlist', agent, timeout: 2000 }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (d) => chunks.push(d))
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          resolve(res.statusCode === 200 && Array.isArray(data) ? data : null)
        } catch {
          resolve(null)
        }
      })
      res.on('error', () => resolve(null))
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
  })
}

// any Live Client Data endpoint; null = not reachable (game still loading) or not JSON
export function liveGet<T = any>(path: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = https.get({ host: '127.0.0.1', port: 2999, path, agent, timeout: 2000 }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (d) => chunks.push(d))
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null)
        } catch {
          resolve(null)
        }
      })
      res.on('error', () => resolve(null))
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
  })
}
