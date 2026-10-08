import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ShortcutService } from '../src/main/services/ShortcutService'
import type { SettingsService } from '../src/main/services/SettingsService'
import { globalShortcut } from 'electron'

vi.mock('electron', () => {
  const registeredMap = new Map<string, Function>()
  return {
    globalShortcut: {
      register: vi.fn((accelerator: string, callback: Function) => {
        registeredMap.set(accelerator, callback)
        return true
      }),
      unregisterAll: vi.fn(() => {
        registeredMap.clear()
      }),
      isRegistered: vi.fn((acc: string) => registeredMap.has(acc))
    }
  }
})

describe('ShortcutService - Registro e Fallbacks de Atalhos', () => {
  let mockSettingsService: Partial<SettingsService>
  let mockHandlers: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockSettingsService = {
      getSettings: vi.fn().mockReturnValue({
        shortcuts: {
          toggleAssistant: 'CommandOrControl+Alt+Space',
          togglePanel: 'CommandOrControl+Alt+O',
          focusChat: 'CommandOrControl+Alt+Return',
          captureScreen: 'CommandOrControl+Alt+S',
          suggestAnswer: 'CommandOrControl+Alt+R',
          summarize: 'CommandOrControl+Alt+M',
          toggleTranscription: 'CommandOrControl+Alt+T',
          openNotes: 'CommandOrControl+Alt+N',
          panicStop: 'CommandOrControl+Alt+Backspace'
        }
      }),
      saveSettings: vi.fn()
    }

    mockHandlers = {
      onToggleAssistant: vi.fn(),
      onTogglePanel: vi.fn(),
      onFocusChat: vi.fn(),
      onCaptureScreen: vi.fn(),
      onSuggestAnswer: vi.fn(),
      onSummarize: vi.fn(),
      onToggleTranscription: vi.fn(),
      onOpenNotes: vi.fn(),
      onPanicStop: vi.fn()
    }
  })

  it('registra todos os atalhos configurados com sucesso sem conflito', () => {
    const service = new ShortcutService(mockSettingsService as SettingsService, mockHandlers)
    const result = service.registerAll()

    expect(result.success).toBe(true)
    expect(result.conflicts).toHaveLength(0)
    expect(result.active['captureScreen']).toBe('CommandOrControl+Alt+S')
    expect(result.active['suggestAnswer']).toBe('CommandOrControl+Alt+R')
    expect(globalShortcut.register).toHaveBeenCalledWith('CommandOrControl+Alt+S', mockHandlers.onCaptureScreen)
  })

  it('usa fallback para captureScreen quando CommandOrControl+Alt+S falha por conflito no SO', () => {
    vi.mocked(globalShortcut.register).mockImplementation((acc: string) => {
      // Simula conflito do Windows onde Ctrl+Alt+S já está em uso por outro app
      if (acc === 'CommandOrControl+Alt+S') {
        return false
      }
      return true
    })

    const service = new ShortcutService(mockSettingsService as SettingsService, mockHandlers)
    const result = service.registerAll()

    // Registrou fallback (ex: CommandOrControl+Shift+S)
    expect(result.conflicts).toContain('CommandOrControl+Alt+S (captureScreen)')
    expect(result.active['captureScreen']).toBe('CommandOrControl+Shift+S')
    expect(globalShortcut.register).toHaveBeenCalledWith('CommandOrControl+Shift+S', mockHandlers.onCaptureScreen)
  })

  it('executa o callback configurado quando o atalho é disparado', () => {
    let capturedCallback: Function | null = null
    vi.mocked(globalShortcut.register).mockImplementation((acc: string, callback: any) => {
      if (acc === 'CommandOrControl+Alt+S') {
        capturedCallback = callback
      }
      return true
    })

    const service = new ShortcutService(mockSettingsService as SettingsService, mockHandlers)
    service.registerAll()

    expect(capturedCallback).not.toBeNull()
    capturedCallback!()
    expect(mockHandlers.onCaptureScreen).toHaveBeenCalledTimes(1)
  })
})
