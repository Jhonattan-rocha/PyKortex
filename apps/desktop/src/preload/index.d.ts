import type { PyKortexApi } from './index'

declare global {
  interface Window {
    pykortex: PyKortexApi
  }
}

export {}
