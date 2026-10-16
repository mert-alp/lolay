import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localeToLang, rankToTier } from '../src/main/rank.ts'

test('rankToTier', () => {
  const table: [string | null, string][] = [
    [null, 'all'],
    ['', 'all'],
    ['NONE', 'all'],
    ['UNRANKED', 'all'],
    ['IRON', 'all'],
    ['BRONZE', 'all'],
    ['SILVER', 'all'],
    ['GOLD', 'gold_plus'],
    ['PLATINUM', 'platinum_plus'],
    ['EMERALD', 'emerald_plus'],
    ['DIAMOND', 'diamond_plus'],
    ['MASTER', 'master_plus'],
    ['GRANDMASTER', 'grandmaster_plus'],
    ['CHALLENGER', 'challenger'],
    ['gold', 'gold_plus']
  ]
  for (const [rank, tier] of table) assert.equal(rankToTier(rank), tier, String(rank))
})

test('localeToLang', () => {
  assert.equal(localeToLang('tr_TR'), 'tr')
  assert.equal(localeToLang('en_US'), 'en')
  assert.equal(localeToLang(null), 'en')
})
