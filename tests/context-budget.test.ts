import { describe, it, expect } from 'vitest'

interface MockSegment {
  id: string
  timestamp: number
  source: string
  text: string
}

interface MockChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Lógica isolada de orçamento de contexto para teste unitário
function composePromptWithBudget(
  prompt: string,
  options: {
    includeNotes: boolean
    notesContent?: string
    segments: MockSegment[]
    chatHistory: MockChatMessage[]
    maxRecentSegments?: number
  }
): string {
  const parts: string[] = []

  if (options.includeNotes && options.notesContent?.trim()) {
    parts.push(`=== NOTAS E ROTEIRO DO USUÁRIO ===\n${options.notesContent.trim()}`)
  }

  const maxSegs = options.maxRecentSegments || 25
  if (options.segments.length > 0) {
    const recent = options.segments.slice(-maxSegs)
    const transcriptText = recent
      .map((s) => `[${new Date(s.timestamp).toLocaleTimeString()}] ${s.source}: ${s.text}`)
      .join('\n')
    parts.push(`=== TRANSCRIÇÃO RECENTE DA REUNIÃO/AULA ===\n${transcriptText}`)
  }

  if (options.chatHistory.length > 0) {
    const recentChat = options.chatHistory.slice(-4)
    const chatText = recentChat
      .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
      .join('\n')
    parts.push(`=== HISTÓRICO RECENTE DO CHAT ===\n${chatText}`)
  }

  parts.push(`=== PEDIDO DO USUÁRIO ===\n${prompt}`)

  return parts.join('\n\n')
}

describe('Orçamento de Contexto (ContextService)', () => {
  it('inclui notas do usuário apenas quando a opção estiver habilitada', () => {
    const prompt = 'Explique a pergunta do entrevistador'
    const notes = 'Lembre-se de citar a complexidade O(N).'

    const withNotes = composePromptWithBudget(prompt, {
      includeNotes: true,
      notesContent: notes,
      segments: [],
      chatHistory: []
    })
    expect(withNotes).toContain('=== NOTAS E ROTEIRO DO USUÁRIO ===')
    expect(withNotes).toContain('complexidade O(N)')

    const withoutNotes = composePromptWithBudget(prompt, {
      includeNotes: false,
      notesContent: notes,
      segments: [],
      chatHistory: []
    })
    expect(withoutNotes).not.toContain('=== NOTAS E ROTEIRO DO USUÁRIO ===')
  })

  it('limita a janela de transcrição aos últimos N segmentos para evitar estouro de tokens', () => {
    const segments: MockSegment[] = []
    for (let i = 1; i <= 60; i++) {
      segments.push({
        id: `seg_${i}`,
        timestamp: 1700000000000 + i * 2000,
        source: 'Áudio do sistema',
        text: `Segmento de fala número ${i}`
      })
    }

    const composed = composePromptWithBudget('Resumir conversa', {
      includeNotes: false,
      segments,
      chatHistory: [],
      maxRecentSegments: 15
    })

    // Deve conter os segmentos mais recentes
    expect(composed).toContain('Segmento de fala número 60')
    expect(composed).toContain('Segmento de fala número 46')
    // Não deve conter segmentos antigos fora da janela deslizante
    expect(composed).not.toContain('Segmento de fala número 1\n')
    expect(composed).not.toContain('Segmento de fala número 30\n')
  })

  it('limita o histórico do chat às últimas 4 interações', () => {
    const chatHistory: MockChatMessage[] = [
      { role: 'user', content: 'Pergunta 1' },
      { role: 'assistant', content: 'Resposta 1' },
      { role: 'user', content: 'Pergunta 2' },
      { role: 'assistant', content: 'Resposta 2' },
      { role: 'user', content: 'Pergunta 3' },
      { role: 'assistant', content: 'Resposta 3' }
    ]

    const composed = composePromptWithBudget('Pergunta 4', {
      includeNotes: false,
      segments: [],
      chatHistory
    })

    expect(composed).toContain('Pergunta 2')
    expect(composed).toContain('Resposta 3')
    expect(composed).not.toContain('Pergunta 1')
  })
})
