import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OverlayService } from '../src/main/services/OverlayService'
import type { PerssuaState } from '../src/preload/index.d'

describe('Máquina de Estados e Transições do Assistente (OverlayService)', () => {
  let mockSettings: any
  let overlayService: OverlayService

  beforeEach(() => {
    mockSettings = {
      hasApiKey: vi.fn().mockReturnValue(true),
      getBounds: vi.fn().mockReturnValue({ width: 440, height: 640 }),
      saveBounds: vi.fn(),
      getNotes: vi.fn().mockReturnValue('# Anotações importantes do usuário'),
      saveNotes: vi.fn()
    }

    overlayService = new OverlayService(mockSettings)
  })

  it('1. Estado Inicial: inicia no modo Inativo e editável', () => {
    const state = overlayService.getState()
    expect(state.isAssistantActive).toBe(false)
    expect(state.isAudioCapturing).toBe(false)
    expect(state.isTranscribing).toBe(false)
    expect(state.isGeneratingResponse).toBe(false)
    expect(state.isPanelVisible).toBe(true)
    expect(state.panelMode).toBe('edit')
    expect(state.whisperServerStatus).toBe('stopped')
    expect(state.hasApiKey).toBe(true)
  })

  it('2. Transição Inativo -> Ativo: ativa assistente e inicia worker de áudio', () => {
    const startAudioSpy = vi.spyOn(overlayService, 'startAudioCaptureWorker').mockImplementation(() => {})

    overlayService.setAssistantActive(true)

    const state = overlayService.getState()
    expect(state.isAssistantActive).toBe(true)
    expect(startAudioSpy).toHaveBeenCalledOnce()
  })

  it('3. Transição Ativo -> Gravando / Transcrevendo: reflete estado de streaming de áudio', () => {
    overlayService.setAssistantActive(true)

    // Simula confirmação do worker de áudio e whisper-server running
    overlayService.updateState({
      isAudioCapturing: true,
      isTranscribing: true,
      whisperServerStatus: 'running'
    })

    const state = overlayService.getState()
    expect(state.isAssistantActive).toBe(true)
    expect(state.isAudioCapturing).toBe(true)
    expect(state.isTranscribing).toBe(true)
    expect(state.whisperServerStatus).toBe('running')
  })

  it('4. Transição Gravando -> Pausado (toggleTranscription sem desativar assistente)', () => {
    overlayService.setAssistantActive(true)
    overlayService.updateState({ isAudioCapturing: true, isTranscribing: true })

    // Pausa a captura de áudio
    overlayService.toggleTranscription()

    const state = overlayService.getState()
    expect(state.isAudioCapturing).toBe(false)
    // O assistente em si continua ATIVO para chat manual e visão de tela
    expect(state.isAssistantActive).toBe(true)
  })

  it('5. Transição Pausado -> Retomado: retoma captura com o assistente já ativo', () => {
    overlayService.setAssistantActive(true)
    overlayService.updateState({ isAudioCapturing: false })

    // Retoma a captura
    overlayService.toggleTranscription()

    const state = overlayService.getState()
    expect(state.isAudioCapturing).toBe(true)
    expect(state.isAssistantActive).toBe(true)
  })

  it('6. Transição Gravando/Ativo -> Encerrando: encerra captura e limpa flags, preservando notas', () => {
    const stopAudioSpy = vi.spyOn(overlayService, 'stopAudioCaptureWorker').mockImplementation(() => {})

    overlayService.setAssistantActive(true)
    overlayService.updateState({
      isAudioCapturing: true,
      isTranscribing: true,
      isGeneratingResponse: true
    })

    // Desativação mestre (ou atalho de pânico)
    overlayService.setAssistantActive(false)

    const state = overlayService.getState()
    expect(state.isAssistantActive).toBe(false)
    expect(state.isAudioCapturing).toBe(false)
    expect(state.isTranscribing).toBe(false)
    expect(state.isGeneratingResponse).toBe(false)
    expect(stopAudioSpy).toHaveBeenCalledOnce()

    // Valida que as notas do usuário permanecem intactas
    expect(mockSettings.getNotes()).toBe('# Anotações importantes do usuário')
    expect(mockSettings.saveNotes).not.toHaveBeenCalled()
  })

  it('7. Ocultar painel (togglePanelVisibility) altera visibilidade sem interromper áudio em background', () => {
    overlayService.setAssistantActive(true)
    overlayService.updateState({ isAudioCapturing: true, isTranscribing: true })

    overlayService.updateState({ isPanelVisible: false })

    const state = overlayService.getState()
    expect(state.isPanelVisible).toBe(false)
    // A captura de loopback em background NÃO pode ser afetada
    expect(state.isAudioCapturing).toBe(true)
    expect(state.isTranscribing).toBe(true)
    expect(state.isAssistantActive).toBe(true)
  })

  it('8. Alternar entre modos de painel (edit <-> query)', () => {
    overlayService.setPanelMode('query')
    expect(overlayService.getState().panelMode).toBe('query')

    overlayService.setPanelMode('edit')
    expect(overlayService.getState().panelMode).toBe('edit')
  })

  it('9. Emite callback de estado sempre que o estado sofrer mutação', () => {
    const stateCallback = vi.fn()
    overlayService.setStateCallback(stateCallback)

    overlayService.updateState({ activeTab: 'transcript' })
    expect(stateCallback).toHaveBeenCalledWith(
      expect.objectContaining({ activeTab: 'transcript' })
    )
  })
})
