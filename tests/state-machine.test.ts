import { describe, it, expect, vi } from 'vitest'

interface AppState {
  isAssistantActive: boolean
  isPanelVisible: boolean
  isAudioCapturing: boolean
  isGeneratingResponse: boolean
  notesContent: string
}

class AssistantStateMachine {
  public state: AppState = {
    isAssistantActive: false, // Inicia desativado
    isPanelVisible: true,
    isAudioCapturing: false,
    isGeneratingResponse: false,
    notesContent: 'Notas existentes do usuário'
  }

  public setAssistantActive(active: boolean, onCancelGen?: () => void, onStopAudio?: () => void): void {
    this.state.isAssistantActive = active

    if (!active) {
      // Regra do MVP: Desativar encerra tracks, cancela solicitações e limpa filas. Não apaga notas!
      this.state.isAudioCapturing = false
      this.state.isGeneratingResponse = false
      onCancelGen?.()
      onStopAudio?.()
    } else {
      this.state.isAudioCapturing = true
    }
  }

  public togglePanelVisibility(): void {
    // Regra do MVP: Mostrar/ocultar painel altera apenas a visibilidade; sessão de áudio já iniciada continua.
    this.state.isPanelVisible = !this.state.isPanelVisible
  }
}

describe('Máquina de Estados do Perssua', () => {
  it('inicia no estado desativado por padrão', () => {
    const sm = new AssistantStateMachine()
    expect(sm.state.isAssistantActive).toBe(false)
    expect(sm.state.isAudioCapturing).toBe(false)
  })

  it('ao desativar o assistente, encerra captura e cancela geração, mas preserva notas', () => {
    const sm = new AssistantStateMachine()
    const cancelSpy = vi.fn()
    const stopAudioSpy = vi.fn()

    // Ativa
    sm.setAssistantActive(true)
    expect(sm.state.isAssistantActive).toBe(true)
    expect(sm.state.isAudioCapturing).toBe(true)

    // Simula geração em andamento
    sm.state.isGeneratingResponse = true

    // Desativa
    sm.setAssistantActive(false, cancelSpy, stopAudioSpy)
    expect(sm.state.isAssistantActive).toBe(false)
    expect(sm.state.isAudioCapturing).toBe(false)
    expect(sm.state.isGeneratingResponse).toBe(false)
    expect(cancelSpy).toHaveBeenCalledOnce()
    expect(stopAudioSpy).toHaveBeenCalledOnce()
    // Notas continuam intactas
    expect(sm.state.notesContent).toBe('Notas existentes do usuário')
  })

  it('ocultar o painel altera apenas visibilidade e preserva captura de áudio ativa', () => {
    const sm = new AssistantStateMachine()
    sm.setAssistantActive(true)
    expect(sm.state.isAudioCapturing).toBe(true)
    expect(sm.state.isPanelVisible).toBe(true)

    // Oculta painel
    sm.togglePanelVisibility()
    expect(sm.state.isPanelVisible).toBe(false)
    // Áudio continua capturando!
    expect(sm.state.isAudioCapturing).toBe(true)
    expect(sm.state.isAssistantActive).toBe(true)
  })
})
