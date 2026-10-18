# LoLo

[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20LoLo-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/schelterhub)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/mert-alp/lolo)](../../releases/latest)

An open-source League of Legends client companion for Windows (Electron). Similar to Blitz / OP.GG, but without an in-game overlay; build data comes from **Lolalytics** by default.

## Features

- **Accept screen** – the window comes to the front when a match is found; queue name and countdown with Accept (Enter) / Decline (Esc), optional delayed auto-accept. If you accept from the client, the screen in the app closes too.
- **Draft screen** (opens automatically in champ select)
  - In the ban phase: the champions you ban most (the app records your bans) and the most banned champions in your lane
  - Suggestions: your own champions (with WR against the enemy laner), counter picks against the enemy laner, personalized suggestions, watchlist, most played / banned champions
  - All-champions picker: search + lane filter, **hover / lock / ban** from the app
  - Build tab: rune pages (most picked, highest WR, keystone variants, "Ekko vs Vi" matchup pages with champion icons, pro player pages), runes editable by clicking, D ⇄ F spell control, items, skill order
  - Team cards (rank, WR, mastery, recent games, Autofill / OTP tags), team damage split, bans
  - Picks are applied to the client automatically in champ select; your Flash key and per-champion/per-lane rune & spell preferences are remembered
- **Champion page** – build, rune / item / spell descriptions (LoL tooltips), counters, lane and rank filters
- **Meta** – tier list per lane, risers / fallers, ★ watchlist
- **Match** – live match player cards
- **Profile** – rank cards, recent match stats, encounter history + match details, multi-region player search (Ctrl+K)
- TR / EN interface, automatic rank detection, runs in the system tray, responsive design from 380 px wide

## Installation

Download `LoLo-Setup-x.y.z.exe` from the [Releases](../../releases) page and run it.
If Windows shows an "unknown publisher" warning, click **More info → Run anyway** (the app is unsigned).
Open the League client and LoLo connects automatically. No extra setup or keys needed.

- The ✕ button sends the app to the system tray; to quit, use the tray icon → **Quit**.
- Error log: `%APPDATA%\lolay\lolay.log`

## Data sources

| Data | Source |
|---|---|
| Builds, runes, items, skills, counters, tier list | Lolalytics (default) · OP.GG · U.GG · METAsrc – selectable in Settings |
| Static data and icons | Riot Data Dragon, CommunityDragon |
| Profile, search, match history | Blitz → OP.GG (fallback) |
| Pro player rune pages | Blitz ProBuilds |
| Champ select, rank, import | League client (LCU, local) |

A Riot Games API client exists in the code but is **disabled** (`src/main/riotService.ts` → `RIOT_ENABLED`): a personal key can't be embedded in a distributed app, and there is no proxy server.

Third-party site data is read from unofficial endpoints and may break when those sites change. LoLo isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties.

## Development

Requirements: Node.js 22+

```bash
npm install
npm run dev        # development
npm test           # node:test unit tests
npm run typecheck
npm run dist       # Setup + portable exe under dist/
```

Structure: `src/main` (Electron main process: LCU, data providers, import), `src/preload`, `src/renderer` (React + Tailwind UI), `src/shared` (shared types and pure helpers), `test` (tests and fixtures).

Contributions are welcome – open an issue or a pull request.

## Support

LoLo is free and open source. If it helps you climb, you can buy me a coffee on [Ko-fi](https://ko-fi.com/schelterhub). ☕

## License

[MIT](LICENSE)
