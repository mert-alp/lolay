/// <reference types="vite/client" />
import type { LolayApi } from '@shared/types'

declare global {
  interface Window {
    lolay: LolayApi
  }
}
