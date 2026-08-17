/// <reference types="vite/client" />

import type { Api } from '../main/preload'

declare global {
  interface Window {
    api: Api
  }
}
