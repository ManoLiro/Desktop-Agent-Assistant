import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutoAssistService } from '../src/main/services/AutoAssistService'
import { GenerationCoordinator } from '../src/main/services/GenerationCoordinator'
import type { TranscriptSegment } from '../src/preload/index.d'

describe('AutoAssistService - Disparo Periódico e Sequenciamento', () => {
  let mockSettings: any
  let mockOverlay: any
  let mockTranscription: any
  let mockContext: any
  let mockGemini: any
  let coordinator: GenerationCoordinator
  let autoAssistService: AutoAssistService

  beforeEach(() => {
    vi.useFakeTimers()

    mockSettings = {
      getSettings: vi.fn().mockReturnValue({
        autoAssistEnabled: true,
        autoAssistIntervalSeconds: 30
      })
    }

    mockOverlay = {
      getState: vi.fn().mockReturnValue({
        isAssistantActive: true,
        hasApiKey: true
      }),
      updateState: vi.fn(),
      getMainWindow: vi.fn().mockReturnValue({
        isDestroyed: vi.fn().mockReturnValue(false),
        webContents: {
          send: vi.fn()
        }
      })
    }

    mockTranscription = {
      getLatestSequenceNumber: vi.fn().mockReturnValue(0),
      getSegments: vi.fn().mockReturnValue([])
    }

    mockContext = {
      composeContext: vi.fn().mockReturnValue({
        prompt: 'Prompt de teste'
      })
    }

    mockGemini = {
      generateContentStream: vi.fn().mockResolvedValue('Micro-resumo gerado pelo Gemini')
    }

    coordinator = new GenerationCoordinator('sess_test')

    autoAssistService = new AutoAssistService(
      mockSettings,
      mockOverlay,
      mockTranscription,
      mockContext,
      mockGemini,
      coordinator
    )
  })

  afterEach(() => {
    autoAssistService.stop()
    vi.useRealTimers()
  })

  it('não agenda timer se autoAssistEnabled estiver desativado nas configurações', () => {
    mockSettings.getSettings.mockReturnValue({ autoAssistEnabled: false })
    autoAssistService.start()

    // Avança 30 segundos
    vi.advanceTimersByTime(30000)

    expect(mockGemini.generateContentStream).not.toHaveBeenCalled()
  })

  it('não dispara se não houver novos segmentos consolidados (latestSequence <= lastProcessed)', async () => {
    mockTranscription.getLatestSequenceNumber.mockReturnValue(0)
    autoAssistService.start()

    await vi.advanceTimersByTimeAsync(30000)

    expect(mockGemini.generateContentStream).not.toHaveBeenCalled()
  })

  it('não dispara se o incremento de texto for menor que 40 caracteres (ruído ou fala curta)', async () => {
    mockTranscription.getLatestSequenceNumber.mockReturnValue(1)
    mockTranscription.getSegments.mockReturnValue([
      {
        id: 'seg_1',
        sequenceNumber: 1,
        timestamp: Date.now(),
        source: 'Áudio do sistema',
        text: 'Ok.', // apenas 3 caracteres
        isFinal: true
      }
    ])

    autoAssistService.start()
    await vi.advanceTimersByTimeAsync(30000)

    expect(mockGemini.generateContentStream).not.toHaveBeenCalled()
  })

  it('dispara, congela targetSequence e avança marcador após sucesso', async () => {
    const segments: TranscriptSegment[] = [
      {
        id: 'seg_1',
        sequenceNumber: 1,
        timestamp: Date.now(),
        source: 'Áudio do sistema',
        text: 'Esta é uma discussão longa sobre arquitetura de microsserviços e mensageria distribuída com Kafka.',
        isFinal: true
      }
    ]
    mockTranscription.getLatestSequenceNumber.mockReturnValue(1)
    mockTranscription.getSegments.mockReturnValue(segments)

    autoAssistService.start()
    await vi.advanceTimersByTimeAsync(30000)

    expect(mockGemini.generateContentStream).toHaveBeenCalled()

    // No segundo ciclo sem novos segmentos, não deve disparar novamente
    mockGemini.generateContentStream.mockClear()
    await vi.advanceTimersByTimeAsync(30000)

    expect(mockGemini.generateContentStream).not.toHaveBeenCalled()
  })

  it('não avança o marcador em caso de erro na geração e aplica backoff', async () => {
    const segments: TranscriptSegment[] = [
      {
        id: 'seg_1',
        sequenceNumber: 1,
        timestamp: Date.now(),
        source: 'Áudio do sistema',
        text: 'Discussão técnica suficientemente longa para ultrapassar o limite mínimo de quarenta caracteres.',
        isFinal: true
      }
    ]
    mockTranscription.getLatestSequenceNumber.mockReturnValue(1)
    mockTranscription.getSegments.mockReturnValue(segments)

    // Simula erro na API
    mockGemini.generateContentStream.mockRejectedValueOnce(new Error('Erro de conexão'))

    autoAssistService.start()
    await vi.advanceTimersByTimeAsync(30000)

    expect(mockGemini.generateContentStream).toHaveBeenCalledTimes(1)

    // Próximo ciclo imediato (10s) cai no backoff de erro (15s)
    await vi.advanceTimersByTimeAsync(10000)
    expect(mockGemini.generateContentStream).toHaveBeenCalledTimes(1)
  })

  it('stop() limpa timer e cancela qualquer job de auto-assist em andamento no coordinator', () => {
    autoAssistService.start()
    expect(coordinator.isGenerating()).toBe(false)

    // Reserva artificial de auto-assist
    coordinator.reserve('auto-assist', coordinator.getSessionId())
    expect(coordinator.isGenerating()).toBe(true)

    autoAssistService.stop()
    expect(coordinator.isGenerating()).toBe(false)
  })
})
