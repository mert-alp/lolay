import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const FILE = 'LoLo.json'

// The client copies the sets it gets through the LCU into the game files without `priority`, so a set another app
// writes there directly with priority (OP.GG) stays above ours. Ours goes there too: one file in the champion's folder
// (the client only manages its own RIOT_ItemSet_* files there), and the LoLo file of any other champion goes away.
export async function writeGameItemSet(installDir: string, champ: string, set: object): Promise<void> {
  const root = join(installDir, 'Config', 'Champions')
  for (const c of await readdir(root).catch(() => [])) if (c !== champ) await rm(join(root, c, 'Recommended', FILE), { force: true })
  await mkdir(join(root, champ, 'Recommended'), { recursive: true })
  await writeFile(join(root, champ, 'Recommended', FILE), JSON.stringify({ ...set, priority: true }))
}
