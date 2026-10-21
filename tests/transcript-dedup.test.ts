import { describe, it, expect, vi } from 'vitest'
import { TranscriptionService } from '../src/main/services/TranscriptionService'

describe('Deduplicação de Overlap de Transcrição (TranscriptionService)', () => {
  const mockSettings = {
    getSettings: vi.fn().mockReturnValue({
      whisperBinaryPath: '',
      whisperModelPath: '',
      transcriptionLanguage: 'pt'
    })
  } as any

  const mockOverlay = {
    updateState: vi.fn(),
    getState: vi.fn().mockReturnValue({ isAudioCapturing: true }),
    getMainWindow: vi.fn()
  } as any

  const service = new TranscriptionService(mockSettings, mockOverlay)

  it('remove palavras duplicadas quando há sobreposição no início do novo bloco', () => {
    const prev = 'Olá pessoal, sejam bem-vindos à nossa reunião'
    const next = 'à nossa reunião de planejamento do projeto Perssua'
    const result = service.deduplicateOverlap(prev, next)
    expect(result).toBe('de planejamento do projeto Perssua')
  })

  it('mantém o texto original intacto quando não há sobreposição', () => {
    const prev = 'Discutimos o primeiro ponto da pauta.'
    const next = 'Agora vamos falar sobre a arquitetura do Electron.'
    const result = service.deduplicateOverlap(prev, next)
    expect(result).toBe('Agora vamos falar sobre a arquitetura do Electron.')
  })

  it('remove sobreposição mesmo quando há pontuações no fim das palavras ou maiúsculas distintas', () => {
    const prev = 'precisamos validar o loopback de áudio,'
    const next = 'Loopback de áudio no Windows 11.'
    const result = service.deduplicateOverlap(prev, next)
    expect(result).toBe('no Windows 11.')
  })

  it('não corta palavras se a sobreposição for de apenas 1 palavra curta (evita falso positivo)', () => {
    const prev = 'Eu acho que o código está bom'
    const next = 'bom dia para todos'
    const result = service.deduplicateOverlap(prev, next)
    expect(result).toBe('bom dia para todos')
  })

  it('suporta pontuações complexas como exclamações, aspas e reticências', () => {
    const prev = 'Vamos em frente com o "sprint"!'
    const next = 'com o "sprint"!... Começando pelas tarefas.'
    const result = service.deduplicateOverlap(prev, next)
    expect(result).toBe('Começando pelas tarefas.')
  })

  it('retorna texto novo intacto se o texto anterior for vazio ou apenas espaços', () => {
    expect(service.deduplicateOverlap('', 'Início da conversa.')).toBe('Início da conversa.')
    expect(service.deduplicateOverlap('   ', 'Início da conversa.')).toBe('Início da conversa.')
  })

  it('retorna vazio se o novo texto for vazio ou apenas espaços', () => {
    expect(service.deduplicateOverlap('Texto anterior', '')).toBe('')
    expect(service.deduplicateOverlap('Texto anterior', '   ')).toBe('')
  })

  it('suporta sobreposição longa de até 10 palavras consecutivas', () => {
    const prev = 'um dois três quatro cinco seis sete oito nove dez onze doze'
    const next = 'três quatro cinco seis sete oito nove dez onze doze treze catorze'
    const result = service.deduplicateOverlap(prev, next)
    expect(result).toBe('treze catorze')
  })
})
