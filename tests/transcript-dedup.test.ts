import { describe, it, expect } from 'vitest'

// Função pura que espelha a lógica do TranscriptionService para teste unitário
function deduplicateOverlap(previousText: string, newText: string): string {
  const prevWords = previousText.trim().split(/\s+/).filter(Boolean)
  const newWords = newText.trim().split(/\s+/).filter(Boolean)

  if (prevWords.length === 0 || newWords.length === 0) {
    return newText
  }

  const maxCheck = Math.min(8, prevWords.length, newWords.length)
  for (let len = maxCheck; len >= 2; len--) {
    const prevTail = prevWords.slice(-len).join(' ').toLowerCase()
    const newHead = newWords.slice(0, len).join(' ').toLowerCase()
    if (prevTail === newHead) {
      return newWords.slice(len).join(' ')
    }
  }

  return newText
}

describe('Deduplicação de Overlap de Transcrição', () => {
  it('remove palavras duplicadas quando há sobreposição no início do novo bloco', () => {
    const prev = 'Olá pessoal, sejam bem-vindos à nossa reunião'
    const next = 'à nossa reunião de planejamento do projeto Perssua'
    const result = deduplicateOverlap(prev, next)
    expect(result).toBe('de planejamento do projeto Perssua')
  })

  it('mantém o texto original intacto quando não há sobreposição', () => {
    const prev = 'Discutimos o primeiro ponto da pauta.'
    const next = 'Agora vamos falar sobre a arquitetura do Electron.'
    const result = deduplicateOverlap(prev, next)
    expect(result).toBe('Agora vamos falar sobre a arquitetura do Electron.')
  })

  it('trata pontuação ou maiúsculas/minúsculas de forma insensível', () => {
    const prev = 'precisamos validar o loopback de áudio'
    const next = 'Loopback de áudio no Windows 11'
    const result = deduplicateOverlap(prev, next)
    expect(result).toBe('no Windows 11')
  })

  it('não corta palavras se a sobreposição for de apenas 1 palavra curta (evita falso positivo)', () => {
    const prev = 'Eu acho que o código está bom'
    const next = 'bom dia para todos'
    const result = deduplicateOverlap(prev, next)
    expect(result).toBe('bom dia para todos')
  })
})
