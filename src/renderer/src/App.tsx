import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lane } from '@shared/types'
import { LangCtx, makeT } from './i18n'
import { useAppState, useStatic } from './hooks'
import { TitleBar } from './components/TitleBar'
import { Rail, type Page } from './components/Rail'
import { ReadyCheck } from './components/ReadyCheck'
import { Toasts, useToasts } from './components/Toasts'
import { Button } from './components/ui'
import { Home } from './pages/Home'
import { Draft } from './pages/Draft'
import { Champion } from './pages/Champion'
import { Meta } from './pages/Meta'
import { LiveMatch } from './pages/LiveMatch'
import { Settings } from './pages/Settings'
import { OpenProfileCtx, Profile } from './pages/Profile'

export default function App() {
  const state = useAppState()
  const lang = state?.lang ?? 'tr'
  const { data: st, error: stErr, reload } = useStatic(state?.lang, state?.dataVersion)
  const ctx = useMemo(() => ({ lang, t: makeT(lang) }), [lang])
  const [page, setPage] = useState<Page>('home')
  const [sel, setSel] = useState<{ id: number; lane?: Lane } | null>(null)
  const [toasts, toast] = useToasts()

  // entering the champion page remembers where we came from, so its back button returns there
  const pageRef = useRef<Page>(page)
  pageRef.current = page
  const hist = useRef<Page[]>([])
  const go = (p: Page) => {
    if (p === 'champion' && pageRef.current !== 'champion') hist.current = [...hist.current, pageRef.current].slice(-10)
    setPage(p)
  }
  const back = () => setPage(hist.current.pop() ?? 'home')

  // profile page: 'me', "Name#TAG" or "search:fragment" (results view); the title-bar search and match rows open it
  const [profileId, setProfileId] = useState('me')
  const openProfile = (riotId: string) => { setProfileId(riotId); go('profile') }

  // CSS uppercase follows <html lang>: "tr" turns i into İ in English text
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // one match page: draft view in champ select, live view in game
  const prev = useRef<string | undefined>(undefined)
  useEffect(() => {
    const inGame = (p?: string) => p === 'GameStart' || p === 'InProgress'
    if (state?.phase === 'ChampSelect' && prev.current !== 'ChampSelect') setPage('live')
    if (inGame(state?.phase) && !inGame(prev.current)) setPage((p) => (p === 'home' ? 'live' : p))
    prev.current = state?.phase
  }, [state?.phase])

  // a finished game opens its end-of-game screen
  const pgId = state?.postGame?.id
  useEffect(() => { if (pgId) setPage('live') }, [pgId])

  // follow the hovered/locked champion and lane
  const cs = state?.champSelect
  useEffect(() => {
    if (cs && cs.championId > 0) setSel({ id: cs.championId, lane: cs.lane ?? undefined })
  }, [cs?.championId, cs?.lane])

  if (!state) return <div className="h-screen bg-bg" />
  const t = ctx.t
  const pick = (id: number, lane?: Lane) => { setSel({ id, lane }); go('champion') }

  return (
    <LangCtx value={ctx}><OpenProfileCtx value={openProfile}>
      <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-bg text-fg">
        <TitleBar state={state} />
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <Rail page={page} onNav={(p) => { if (p === 'profile' && page !== 'profile') setProfileId('me'); go(p) }} liveOn={!!state.live} />
          <main className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            {stErr && !st ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="mb-3 font-semibold">{t('err.title')}</p>
                  <Button onClick={reload}>{t('err.retry')}</Button>
                </div>
              </div>
            ) : page === 'champion' ? (
              // owns its own container
              <Champion state={state} st={st} champId={sel?.id ?? null} followLane={sel?.lane} onPick={pick} onHome={back} toast={toast} />
            ) : (
              <div className="mx-auto w-full max-w-[1280px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5">
                {page === 'home' ? (
                  <Home state={state} st={st} onPick={pick} />
                ) : page === 'profile' ? (
                  <Profile key={pgId ?? 'profile'} target={profileId} st={st} />
                ) : page === 'meta' ? (
                  <Meta state={state} st={st} onPick={pick} />
                ) : page === 'live' ? (
                  state.phase === 'ChampSelect' ? (
                    <Draft state={state} st={st} onDetails={() => go('champion')} toast={toast} />
                  ) : (
                    <LiveMatch state={state} st={st} onPick={(id) => pick(id)} />
                  )
                ) : (
                  <Settings state={state} />
                )}
              </div>
            )}
          </main>
        </div>
        {state.readyCheck && <ReadyCheck rc={state.readyCheck} autoAccept={state.settings.autoAccept} />}
        <Toasts list={toasts} />
      </div>
    </OpenProfileCtx></LangCtx>
  )
}
