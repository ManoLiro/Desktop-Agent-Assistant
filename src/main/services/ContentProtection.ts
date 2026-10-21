import type { BrowserWindow } from 'electron'

/**
 * Proteção contra captura de tela (Windows).
 *
 * `BrowserWindow.setContentProtection(true)` chama `SetWindowDisplayAffinity` internamente,
 * mas o Electron/Chromium pode resetar a afinidade em transições de janela (hide/show,
 * restore, mudanças de estilo como setIgnoreMouseEvents), deixando a janela visível no
 * Google Meet / Teams. Este módulo chama a API Win32 diretamente via koffi, verifica o valor
 * real com `GetWindowDisplayAffinity` e permite reaplicar sempre que necessário.
 */

const WDA_NONE = 0x00
const WDA_MONITOR = 0x01
export const WDA_EXCLUDEFROMCAPTURE = 0x11

export type ProtectionResult = {
  /** Afinidade efetivamente aplicada na janela (lida do SO), ou null se não foi possível ler */
  affinity: number | null
  /** true quando a janela está realmente excluída da captura */
  excluded: boolean
  /** true quando a API nativa está disponível (koffi carregado) */
  nativeAvailable: boolean
}

type NativeApi = {
  setAffinity: (hwnd: bigint, affinity: number) => boolean
  getAffinity: (hwnd: bigint) => number | null
}

let nativeApi: NativeApi | null | undefined

function loadNativeApi(): NativeApi | null {
  if (nativeApi !== undefined) return nativeApi
  nativeApi = null
  if (process.platform !== 'win32') return nativeApi

  try {
    // require dinâmico: se o módulo nativo falhar, o app continua com o fallback do Electron
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    const SetWindowDisplayAffinity = user32.func(
      'bool __stdcall SetWindowDisplayAffinity(intptr_t hWnd, uint32_t dwAffinity)'
    )
    const GetWindowDisplayAffinity = user32.func(
      'bool __stdcall GetWindowDisplayAffinity(intptr_t hWnd, _Out_ uint32_t *pdwAffinity)'
    )

    nativeApi = {
      setAffinity: (hwnd, affinity) => Boolean(SetWindowDisplayAffinity(hwnd, affinity)),
      getAffinity: (hwnd) => {
        const out: number[] = [0]
        const ok = Boolean(GetWindowDisplayAffinity(hwnd, out))
        return ok ? out[0] : null
      }
    }
  } catch (err) {
    console.warn('[ContentProtection] API nativa indisponível, usando apenas setContentProtection:', err)
    nativeApi = null
  }
  return nativeApi
}

function getHwnd(win: BrowserWindow): bigint {
  const buf = win.getNativeWindowHandle()
  return buf.length >= 8 ? buf.readBigInt64LE(0) : BigInt(buf.readInt32LE(0))
}

export function describeAffinity(affinity: number | null): string {
  switch (affinity) {
    case WDA_EXCLUDEFROMCAPTURE:
      return 'WDA_EXCLUDEFROMCAPTURE'
    case WDA_MONITOR:
      return 'WDA_MONITOR'
    case WDA_NONE:
      return 'WDA_NONE'
    case null:
      return 'desconhecida'
    default:
      return `0x${affinity.toString(16)}`
  }
}

/** Lê a afinidade atual da janela sem alterá-la. */
export function readProtection(win: BrowserWindow): ProtectionResult {
  const api = loadNativeApi()
  if (!api || win.isDestroyed()) {
    return { affinity: null, excluded: false, nativeAvailable: Boolean(api) }
  }
  const affinity = api.getAffinity(getHwnd(win))
  return { affinity, excluded: affinity === WDA_EXCLUDEFROMCAPTURE, nativeAvailable: true }
}

/**
 * Aplica (ou reaplica) a exclusão de captura e verifica o resultado real no SO.
 * Seguro para chamar repetidamente.
 */
export function applyExcludeFromCapture(win: BrowserWindow): ProtectionResult {
  if (win.isDestroyed()) {
    return { affinity: null, excluded: false, nativeAvailable: false }
  }

  // 1. Caminho oficial do Electron (também configura WS_EX_LAYERED internamente)
  try {
    win.setContentProtection(true)
  } catch (err) {
    console.warn('[ContentProtection] setContentProtection falhou:', err)
  }

  const api = loadNativeApi()
  if (!api) {
    return { affinity: null, excluded: false, nativeAvailable: false }
  }

  // 2. Garante WDA_EXCLUDEFROMCAPTURE diretamente via Win32 e verifica
  const hwnd = getHwnd(win)
  let affinity = api.getAffinity(hwnd)
  if (affinity !== WDA_EXCLUDEFROMCAPTURE) {
    const ok = api.setAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)
    affinity = api.getAffinity(hwnd)
    if (!ok || affinity !== WDA_EXCLUDEFROMCAPTURE) {
      console.warn(
        `[ContentProtection] Falha ao aplicar WDA_EXCLUDEFROMCAPTURE (resultado: ${describeAffinity(affinity)})`
      )
    }
  }

  return { affinity, excluded: affinity === WDA_EXCLUDEFROMCAPTURE, nativeAvailable: true }
}

/** Remove a exclusão de captura: a janela volta a aparecer em compartilhamentos/gravações. */
export function removeExcludeFromCapture(win: BrowserWindow): ProtectionResult {
  if (win.isDestroyed()) {
    return { affinity: null, excluded: false, nativeAvailable: false }
  }

  try {
    win.setContentProtection(false)
  } catch (err) {
    console.warn('[ContentProtection] setContentProtection(false) falhou:', err)
  }

  const api = loadNativeApi()
  if (!api) {
    return { affinity: null, excluded: false, nativeAvailable: false }
  }

  const hwnd = getHwnd(win)
  if (api.getAffinity(hwnd) !== WDA_NONE) {
    api.setAffinity(hwnd, WDA_NONE)
  }
  const affinity = api.getAffinity(hwnd)
  return { affinity, excluded: affinity === WDA_EXCLUDEFROMCAPTURE, nativeAvailable: true }
}
