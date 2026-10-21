import type { SettingsService } from './SettingsService'
import type { OverlayService } from './OverlayService'
import type { TranscriptionService } from './TranscriptionService'
import type { ContextService } from './ContextService'
import type { GeminiProvider } from './GeminiProvider'
import type { GenerationCoordinator } from './GenerationCoordinator'
import type { ChatMessage } from '../../preload/index.d'

export class AutoAssistService {
  private settingsService: SettingsService
  private overlayService: OverlayService
  private transcriptionService: TranscriptionService
  private contextService: ContextService
  private geminiProvider: GeminiProvider
  private coordinator: GenerationCoordinator
  private intervalTimer: NodeJS.Timeout | null = null
  private lastProcessedSequence = 0
  private lastErrorTimestamp = 0

  constructor(
    settingsService: SettingsService,
    overlayService: OverlayService,
    transcriptionService: TranscriptionService,
    contextService: ContextService,
    geminiProvider: GeminiProvider,
    coordinator: GenerationCoordinator
  ) {
    this.settingsService = settingsService
    this.overlayService = overlayService
    this.transcriptionService = transcriptionService
    this.contextService = contextService
    this.geminiProvider = geminiProvider
    this.coordinator = coordinator
  }

  public resetSession(): void {
    this.lastProcessedSequence = 0
    this.lastErrorTimestamp = 0
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
    this.coordinator.cancelAutoAssist()
  }

  private async checkAndTriggerAutoAssist(): Promise<void> {
    const state = this.overlayService.getState()
    if (!state.isAssistantActive || !state.hasApiKey) return

    // Respeita backoff em caso de erro recente (15s)
    if (Date.now() - this.lastErrorTimestamp < 15000) {
      return
    }

    const latestSequence = this.transcriptionService.getLatestSequenceNumber()
    if (latestSequence <= this.lastProcessedSequence) {
      return
    }

    // Verifica se os novos segmentos trazem conteúdo significativo (> 40 caracteres consolidados)
    const allSegments = this.transcriptionService.getSegments()
    const newSegments = allSegments.filter((s) => s.sequenceNumber > this.lastProcessedSequence)
    const newCharsCount = newSegments.reduce((acc, s) => acc + s.text.trim().length, 0)
    if (newCharsCount < 40) {
      return
    }

    // Congela a sequência coberta por este lote de execução
    const targetSequence = latestSequence
    const currentSessionId = this.coordinator.getSessionId()

    // Reserva síncrona no GenerationCoordinator (preempcionável por ação manual)
    const reservation = this.coordinator.reserve('auto-assist', currentSessionId)
    if (!reservation.ok || !reservation.requestId || !reservation.abortController) {
      return
    }

    const { requestId, abortController } = reservation

    const prompt =
      'Micro-atualização periódica (30s): Apresente de 2 a 3 pontos-chave do que foi dito recentemente na conversa. ' +
      'Se alguma pergunta ou solicitação foi feita ao usuário e ainda não foi respondida, destaque-a.'

    const contextResult = this.contextService.composeContext(prompt)

    try {
      this.overlayService.updateState({ isGeneratingResponse: true })
      const win = this.overlayService.getMainWindow()

      const fullResponse = await this.geminiProvider.generateContentStream({
        prompt: contextResult.prompt,
        signal: abortController.signal,
        onChunk: (chunk) => {
          // Só encaminha para a janela se esta requisição ainda for a ativa
          if (this.coordinator.isJobActive(requestId, currentSessionId) && win && !win.isDestroyed()) {
            win.webContents.send('perssua:chat-chunk', chunk)
          }
        }
      })

      // Só finaliza se a requisição não tiver sido preempcionada durante a geração
      if (this.coordinator.isJobActive(requestId, currentSessionId)) {
        const assistantMessage: ChatMessage = {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: fullResponse,
          timestamp: Date.now(),
          origin: 'auto-assist'
        }

        if (win && !win.isDestroyed()) {
          win.webContents.send('perssua:chat-done', assistantMessage)
        }

        // Sucesso confirmado: avança o marcador para o targetSequence congelado
        this.lastProcessedSequence = targetSequence
      }
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        this.lastErrorTimestamp = Date.now()
        console.warn('[AutoAssistService] Falha na atualização automática:', err?.message)
      }
    } finally {
      this.coordinator.release(requestId)
      if (!this.coordinator.isGenerating()) {
        this.overlayService.updateState({ isGeneratingResponse: false })
      }
    }
  }
}
