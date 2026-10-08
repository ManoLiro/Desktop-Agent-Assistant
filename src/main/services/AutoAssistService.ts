import type { SettingsService } from './SettingsService'
import type { OverlayService } from './OverlayService'
import type { TranscriptionService } from './TranscriptionService'
import type { ContextService } from './ContextService'
import type { GeminiProvider } from './GeminiProvider'
import type { ChatMessage } from '../../preload/index.d'

export class AutoAssistService {
  private settingsService: SettingsService
  private overlayService: OverlayService
  private transcriptionService: TranscriptionService
  private contextService: ContextService
  private geminiProvider: GeminiProvider
  private intervalTimer: NodeJS.Timeout | null = null
  private lastProcessedSegmentCount = 0

  constructor(
    settingsService: SettingsService,
    overlayService: OverlayService,
    transcriptionService: TranscriptionService,
    contextService: ContextService,
    geminiProvider: GeminiProvider
  ) {
    this.settingsService = settingsService
    this.overlayService = overlayService
    this.transcriptionService = transcriptionService
    this.contextService = contextService
    this.geminiProvider = geminiProvider
  }

  public start(): void {
    this.stop()
    const settings = this.settingsService.getSettings()
    if (!settings.autoAssistEnabled) return

    const intervalMs = Math.max(10, settings.autoAssistIntervalSeconds || 30) * 1000
    this.intervalTimer = setInterval(() => {
      this.checkAndTriggerAutoAssist()
    }, intervalMs)
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }
  }

  private async checkAndTriggerAutoAssist(): Promise<void> {
    const state = this.overlayService.getState()
    if (!state.isAssistantActive || !state.hasApiKey) return
    if (this.geminiProvider.isGenerating()) return // Prioriza perguntas manuais

    const segments = this.transcriptionService.getSegments()
    if (segments.length <= this.lastProcessedSegmentCount) {
      // Sem novo texto consolidado
      return
    }

    this.lastProcessedSegmentCount = segments.length

    const prompt =
      'Atualização automática rápida da conversa: forneça 2 a 3 pontos-chave do que foi dito recentemente e ' +
      'se houver alguma pergunta pendente direcionada ao participante, destaque-a.'

    const composedPrompt = this.contextService.composePrompt(prompt)

    try {
      this.overlayService.updateState({ isGeneratingResponse: true })
      const win = this.overlayService.getMainWindow()

      const fullResponse = await this.geminiProvider.generateContentStream({
        prompt: composedPrompt,
        onChunk: (chunk) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('perssua:chat-chunk', chunk)
          }
        }
      })

      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `**[Atualização Automática]**\n\n${fullResponse}`,
        timestamp: Date.now()
      }

      if (win && !win.isDestroyed()) {
        win.webContents.send('perssua:chat-done', assistantMessage)
      }
    } catch (err: any) {
      console.warn('[AutoAssistService] Falha na atualização automática:', err?.message)
    } finally {
      this.overlayService.updateState({ isGeneratingResponse: false })
    }
  }
}
