import { useEffect, useState, type ReactNode } from 'react'
import type { AppState, Lang, Settings as S } from '@shared/types'
import { useT } from '../i18n'
import { Button, Card, Eyebrow, Segmented, Select, Slider, Toggle } from '../components/ui'
import { SourcePicker } from '../components/SourcePicker'
import { TierSelect } from '../components/TierSelect'

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5 sm:py-4">
      <div className="min-w-0 flex-1 basis-[200px]">
        <div className="text-[14px] font-medium">{title}</div>
        {desc && <div className="mt-0.5 text-[12px] text-mute">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

export function Settings({ state }: { state: AppState }) {
  const t = useT()
  const s = state.settings
  const set = (p: Partial<S>) => window.lolay.setSettings(p)
  const imp = (k: keyof S['autoImport'], v: boolean) => set({ autoImport: { ...s.autoImport, [k]: v } })
  const [delay, setDelay] = useState(s.autoAcceptDelay)
  useEffect(() => setDelay(s.autoAcceptDelay), [s.autoAcceptDelay])
  const [mapW, setMapW] = useState(s.overlayMap)
  useEffect(() => setMapW(s.overlayMap), [s.overlayMap])

  return (
    <div className="mx-auto max-w-[760px] space-y-5 sm:space-y-6">
      <h1 className="text-[20px] sm:text-[22px] font-bold tracking-tight">{t('set.title')}</h1>

      <div>
        <Eyebrow>{t('set.source')}</Eyebrow>
        <SourcePicker value={s.source} onChange={(source) => set({ source })} />
        <p className="mt-2 px-1 text-[12px] text-mute">{t('set.source.d')}</p>
      </div>

      <div>
        <Eyebrow>{t('set.import')}</Eyebrow>
        <Card>
          {(['runes', 'spells', 'items'] as const).map((k) => (
            <Row key={k} title={t(`set.${k}`)} desc={t(`set.${k}.d`)}>
              <Toggle checked={s.autoImport[k]} label={t(`set.${k}`)} onChange={(v) => imp(k, v)} />
            </Row>
          ))}
          <Row title={t('set.flash')}>
            <Segmented
              label={t('set.flash')}
              value={s.flashOn}
              options={[{ value: 'D', label: 'D' }, { value: 'F', label: 'F' }]}
              onChange={(v) => set({ flashOn: v })}
            />
          </Row>
        </Card>
      </div>

      <div>
        <Eyebrow>{t('set.queue')}</Eyebrow>
        <Card>
          <Row title={t('set.accept')} desc={t('set.accept.d')}>
            <Toggle checked={s.autoAccept} label={t('set.accept')} onChange={(v) => set({ autoAccept: v })} />
          </Row>
          <Row title={t('set.delay')}>
            <div className="flex items-center gap-4">
              <Slider
                label={t('set.delay')}
                min={0}
                max={8}
                step={0.5}
                value={delay}
                onChange={(v) => { setDelay(v); set({ autoAcceptDelay: v }) }}
              />
              <span className="w-14 text-right text-[14px] font-semibold text-gold">{delay.toFixed(1)} {t('rc.sec')}</span>
            </div>
          </Row>
        </Card>
      </div>

      <div>
        <Eyebrow>{t('settings.overlayCard')}</Eyebrow>
        <Card>
          <Row title={t('settings.overlay')} desc={t('settings.overlayHint')}>
            <Toggle checked={s.overlay} label={t('settings.overlay')} onChange={(v) => set({ overlay: v })} />
          </Row>
          <div className={s.overlay ? '' : 'pointer-events-none opacity-50'}>
            <Row title={t('settings.overlaySkill')} desc={t('settings.overlaySkillHint')}>
              <Toggle checked={s.overlaySkill} label={t('settings.overlaySkill')} onChange={(v) => set({ overlaySkill: v })} />
            </Row>
            <Row title={t('settings.overlayRoute')} desc={t('settings.overlayRouteHint')}>
              <Toggle checked={s.overlayRoute} label={t('settings.overlayRoute')} onChange={(v) => set({ overlayRoute: v })} />
            </Row>
            <Row title={t('settings.overlayMap')} desc={t('settings.overlayMapHint')}>
              <div className="flex items-center gap-4">
                <Slider
                  label={t('settings.overlayMap')}
                  min={180}
                  max={420}
                  step={10}
                  value={mapW}
                  onChange={(v) => { setMapW(v); set({ overlayMap: v }) }}
                />
                <span className="w-16 text-right text-[14px] font-semibold text-gold">{mapW} px</span>
              </div>
            </Row>
            <Row title={t('settings.overlayReset')} desc={t('settings.overlayResetHint')}>
              <Button variant="ghost" className="px-3 py-1.5" disabled={!Object.keys(s.overlayPos).length} onClick={() => set({ overlayPos: {} })}>
                {t('settings.overlayReset')}
              </Button>
            </Row>
          </div>
        </Card>
      </div>

      <div>
        <Eyebrow>{t('set.general')}</Eyebrow>
        <Card>
          <Row title={t('set.startup')} desc={t('set.startup.d')}>
            <Toggle checked={s.startWithWindows} label={t('set.startup')} onChange={(v) => set({ startWithWindows: v })} />
          </Row>
          <Row title={t('set.lang')} desc={t('set.lang.d')}>
            <Select<'auto' | Lang>
              label={t('set.lang')}
              align="right"
              value={s.lang ?? 'auto'}
              options={[{ value: 'auto', label: t('lang.auto') }, { value: 'tr', label: t('lang.tr') }, { value: 'en', label: t('lang.en') }]}
              onChange={(v) => set({ lang: v === 'auto' ? null : v })}
            />
          </Row>
          <Row title={t('set.tier')} desc={t('set.tier.d')}>
            <TierSelect state={state} />
          </Row>
        </Card>
      </div>
    </div>
  )
}
