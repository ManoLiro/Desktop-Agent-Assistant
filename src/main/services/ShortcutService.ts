import { globalShortcut } from 'electron'
import type { SettingsService } from './SettingsService'

export interface ShortcutHandlers {
  onToggleAssistant: () => void
  onTogglePanel: () => void
  onFocusChat: () => void
  onCaptureScreen: () => void
  onSuggestAnswer: () => void
  onSummarize: () => void
  onToggleTranscription: () => void
  onOpenNotes: () => void
  onPanicStop: () => void
}

const FALLBACK_SHORTCUTS: Record<string, string[]> = {
  summarize: ['CommandOrControl+Alt+U', 'CommandOrControl+Shift+M'],
  focusChat: ['CommandOrControl+Alt+I', 'CommandOrControl+Shift+Return'],
  suggestAnswer: ['CommandOrControl+Alt+A', 'CommandOrControl+Shift+R']
}

export class ShortcutService {
  private settingsService: SettingsService
  private handlers: ShortcutHandlers
  private registeredShortcuts: Map<string, string> = new Map() // accelerator -> actionKey
  private activeShortcutsMap: Record<string, string> = {} // actionKey -> accelerator
  private conflicts: string[] = []

  constructor(settingsService: SettingsService, handlers: ShortcutHandlers) {
    this.settingsService = settingsService
    this.handlers = handlers
  }

  public getActiveShortcuts(): Record<string, string> {
    return { ...this.activeShortcutsMap }
  }

  public getConflicts(): string[] {
    return [...this.conflicts]
  }

  public registerAll(): { success: boolean; conflicts: string[]; active: Record<string, string> } {
    this.unregisterAll()

    const shortcuts = this.settingsService.getSettings().shortcuts
    this.conflicts = []
    this.activeShortcutsMap = {}

    const actionMap: Record<string, () => void> = {
      toggleAssistant: this.handlers.onToggleAssistant,
      togglePanel: this.handlers.onTogglePanel,
      focusChat: this.handlers.onFocusChat,
      captureScreen: this.handlers.onCaptureScreen,
      suggestAnswer: this.handlers.onSuggestAnswer,
      summarize: this.handlers.onSummarize,
      toggleTranscription: this.handlers.onToggleTranscription,
      openNotes: this.handlers.onOpenNotes,
      panicStop: this.handlers.onPanicStop
    }

    for (const [actionKey, accelerator] of Object.entries(shortcuts)) {
      const handler = actionMap[actionKey]
      if (!handler || !accelerator) continue

      let registered = false

      // 1. Tenta registrar o atalho configurado
      try {
        if (globalShortcut.register(accelerator, handler)) {
          this.registeredShortcuts.set(accelerator, actionKey)
          this.activeShortcutsMap[actionKey] = accelerator
          registered = true
        }
      } catch (err) {
        console.error(`[ShortcutService] Erro ao registrar atalho: ${accelerator} (${actionKey})`, err)
      }

      // 2. Se falhou (conflito com outro app no Windows), tenta alternativas (fallback)
      if (!registered) {
        console.warn(`[ShortcutService] Conflito ao registrar atalho: ${accelerator} (${actionKey})`)
        this.conflicts.push(`${accelerator} (${actionKey})`)

        const fallbacks = FALLBACK_SHORTCUTS[actionKey] || []
        for (const alt of fallbacks) {
          try {
            if (globalShortcut.register(alt, handler)) {
              console.log(`[ShortcutService] Fallback registrado com sucesso para ${actionKey}: ${alt}`)
              this.registeredShortcuts.set(alt, actionKey)
              this.activeShortcutsMap[actionKey] = alt
              registered = true
              break
            }
          } catch {}
        }
      }
    }

    return {
      success: this.conflicts.length === 0,
      conflicts: this.conflicts,
      active: this.activeShortcutsMap
    }
  }

  public unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registeredShortcuts.clear()
  }

  public updateShortcuts(newShortcuts: Record<string, string>): { success: boolean; conflicts: string[] } {
    const previous = { ...this.settingsService.getSettings().shortcuts }
    this.settingsService.saveSettings({ shortcuts: newShortcuts })

    const result = this.registerAll()
    if (!result.success) {
      // Se falhou, restaura os anteriores
      console.warn('[ShortcutService] Revertendo para atalhos anteriores devido a conflitos:', result.conflicts)
      this.settingsService.saveSettings({ shortcuts: previous })
      this.registerAll()
    }

    return result
  }
}
