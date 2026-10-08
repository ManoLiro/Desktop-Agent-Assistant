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

export class ShortcutService {
  private settingsService: SettingsService
  private handlers: ShortcutHandlers
  private registeredShortcuts: Map<string, string> = new Map() // accelerator -> actionKey

  constructor(settingsService: SettingsService, handlers: ShortcutHandlers) {
    this.settingsService = settingsService
    this.handlers = handlers
  }

  public registerAll(): { success: boolean; conflicts: string[] } {
    this.unregisterAll()

    const shortcuts = this.settingsService.getSettings().shortcuts
    const conflicts: string[] = []

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

      try {
        const ok = globalShortcut.register(accelerator, handler)
        if (ok) {
          this.registeredShortcuts.set(accelerator, actionKey)
        } else {
          console.warn(`[ShortcutService] Conflito ao registrar atalho: ${accelerator} (${actionKey})`)
          conflicts.push(accelerator)
        }
      } catch (err) {
        console.error(`[ShortcutService] Atalho inválido: ${accelerator} (${actionKey})`, err)
        conflicts.push(accelerator)
      }
    }

    return {
      success: conflicts.length === 0,
      conflicts
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
