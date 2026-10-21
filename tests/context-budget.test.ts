import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextService } from '../src/main/services/ContextService'
import type { TranscriptSegment, ChatMessage } from '../src/preload/index.d'

describe('ContextService - Orquestração de Contexto e Extração de Perguntas', () => {
  let mockSettings: any
  let mockTranscription: any
  let contextService: ContextService

  beforeEach(() => {
    mockSettings = {
      getSettings: vi.fn().mockReturnValue({
        includeNotesInContext: true,
        responseLanguage: 'pt-BR'
      }),
      getNotes: vi.fn().mockReturnValue('Lembrete: mencionar complexidade de tempo O(N).')
    }

    mockTranscription = {
      getSegments: vi.fn().mockReturnValue([])
    }

    contextService = new ContextService(mockSettings, mockTranscription)
  })

  describe('Reconstrução de Trechos de Fala e Extração de Perguntas', () => {
    it('funde pergunta fragmentada entre dois segmentos consecutivos próximos no tempo', () => {
      const now = Date.now()
      const segments: TranscriptSegment[] = [
        {
          id: 'seg_1',
          sequenceNumber: 1,
          timestamp: now - 3000,
          source: 'Áudio do sistema',
          text: 'What is the difference between',
          isFinal: true
        },
        {
          id: 'seg_2',
          sequenceNumber: 2,
          timestamp: now - 1000,
          source: 'Áudio do sistema',
          text: 'a process and a thread?',
          isFinal: true
        }
      ]

      const detected = contextService.extractRecentQuestions(segments)
      expect(detected).not.toBeNull()
      expect(detected?.questionText).toBe('What is the difference between a process and a thread?')
      expect(detected?.isImperativeRequest).toBe(false)
    })

    it('ignora falsos positivos com "como/how" em frases meramente afirmativas', () => {
      const segments: TranscriptSegment[] = [
        {
          id: 'seg_1',
          sequenceNumber: 1,
          timestamp: Date.now() - 2000,
          source: 'Áudio do sistema',
          text: 'Foi exatamente assim que descobrimos como resolver o problema de latência.',
          isFinal: true
        }
      ]

      const detected = contextService.extractRecentQuestions(segments)
      expect(detected).toBeNull()
    })

    it('identifica solicitações imperativas comuns em entrevistas (Compare, Tell me about, Explique)', () => {
      const segments: TranscriptSegment[] = [
        {
          id: 'seg_1',
          sequenceNumber: 1,
          timestamp: Date.now() - 4000,
          source: 'Áudio do sistema',
          text: 'Compare REST e GraphQL em termos de caching e payload.',
          isFinal: true
        }
      ]

      const detected = contextService.extractRecentQuestions(segments)
      expect(detected).not.toBeNull()
      expect(detected?.isImperativeRequest).toBe(true)
      expect(detected?.questionText).toContain('Compare REST e GraphQL')
    })

    it('limita fusão de blocos se a duração total exceder 20 segundos ou 500 caracteres', () => {
      const baseTime = 1700000000000
      const segments: TranscriptSegment[] = [
        {
          id: 'seg_1',
          sequenceNumber: 1,
          timestamp: baseTime,
          source: 'Áudio do sistema',
          text: 'Primeira fala curta.',
          isFinal: true
        },
        {
          id: 'seg_2',
          sequenceNumber: 2,
          timestamp: baseTime + 25000, // 25s depois (> 20s cap)
          source: 'Áudio do sistema',
          text: 'Segunda fala após intervalo longo.',
          isFinal: true
        }
      ]

      const chunks = contextService.reconstructSpeechChunks(segments)
      expect(chunks.length).toBe(2)
      expect(chunks[0].text).toBe('Primeira fala curta.')
      expect(chunks[1].text).toBe('Segunda fala após intervalo longo.')
    })

    it('não funde segmentos de fontes diferentes (sistema vs microfone)', () => {
      const now = Date.now()
      const segments: TranscriptSegment[] = [
        {
          id: 'seg_1',
          sequenceNumber: 1,
          timestamp: now - 2000,
          source: 'Áudio do sistema',
          text: 'Você pode explicar isso?',
          isFinal: true
        },
        {
          id: 'seg_2',
          sequenceNumber: 2,
          timestamp: now - 1000,
          source: 'Microfone',
          text: 'Sim, com certeza.',
          isFinal: true
        }
      ]

      const chunks = contextService.reconstructSpeechChunks(segments)
      expect(chunks.length).toBe(2)
      expect(chunks[0].source).toBe('Áudio do sistema')
      expect(chunks[1].source).toBe('Microfone')
    })
  })

  describe('Prompts Especializados e Fallbacks sem Alucinação', () => {
    it('prompt de sugestão de resposta direciona para a pergunta detectada quando houver', () => {
      const prompt = contextService.getSuggestAnswerPrompt('Qual a complexidade do QuickSort?')
      expect(prompt).toContain('Qual a complexidade do QuickSort?')
      expect(prompt).toContain('Sugestão de Fala Curta')
      expect(prompt).toContain('Aprofundamento Técnico')
    })

    it('prompt de fallback orienta explicitamente a pedir esclarecimento se o contexto for inconclusivo', () => {
      const prompt = contextService.getSuggestAnswerPrompt(undefined)
      expect(prompt).toContain('peça esclarecimento ao usuário em vez de inventar uma pergunta')
    })
  })

  describe('Orçamento Estimado de Contexto e Metadados Pós-Descarte', () => {
    it('filtra mensagens de auto-assist do histórico do chat', () => {
      const chatHistory: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Pergunta manual anterior', timestamp: 1, origin: 'manual' },
        { id: '2', role: 'assistant', content: 'Atualização periódica automática', timestamp: 2, origin: 'auto-assist' },
        { id: '3', role: 'user', content: 'Pergunta atual', timestamp: 3, origin: 'manual' }
      ]

      const result = contextService.composeContext('Teste de filtro', { chatHistory })
      expect(result.prompt).toContain('Pergunta manual anterior')
      expect(result.prompt).not.toContain('Atualização periódica automática')
    })

    it('calcula o intervalo de horário do resumo estritamente APÓS o descarte dos segmentos pelo orçamento', () => {
      const baseTime = 1700000000000 // Fix timestamp
      const segments: TranscriptSegment[] = []

      // Gera 40 segmentos longos com 10 segundos de diferença cada
      for (let i = 0; i < 40; i++) {
        segments.push({
          id: `seg_${i}`,
          sequenceNumber: i + 1,
          timestamp: baseTime + i * 10000,
          source: 'Áudio do sistema',
          text: `Discussão técnica número ${i} com texto detalhado sobre arquitetura e escalabilidade distribuída.`,
          isFinal: true
        })
      }

      mockTranscription.getSegments.mockReturnValue(segments)

      // Executa com teto restrito para forçar descarte de segmentos antigos
      const result = contextService.composeContext('Resumir conversa', {
        forSummarize: true,
        maxEstimatedTokens: 800
      })

      expect(result.intervalStart).toBeDefined()
      expect(result.intervalEnd).toBeDefined()
      expect(result.includedSegmentIds.length).toBeLessThan(40)

      // O primeiro segmento incluído não deve ser o seg_0 (pois foi descartado)
      expect(result.includedSegmentIds).not.toContain('seg_0')
      // O último segmento incluído deve ser o mais recente
      expect(result.includedSegmentIds).toContain('seg_39')
    })

    it('trunca notas longas suavemente e emite aviso de truncamento', () => {
      const longNotes = 'Linha 1\n'.repeat(400) // ~3200 caracteres
      mockSettings.getNotes.mockReturnValue(longNotes)

      const result = contextService.composeContext('Pedido de teste')
      expect(result.prompt).toContain('[... notas truncadas para respeitar o orçamento de contexto]')
      expect(result.truncationWarnings.some((w) => w.includes('anotações foram truncadas'))).toBe(true)
    })

    it('emite aviso se o pedido do usuário sozinho exceder o orçamento máximo', () => {
      const hugePrompt = 'A'.repeat(25000) // ~6500 tokens
      const result = contextService.composeContext(hugePrompt)
      expect(result.truncationWarnings.some((w) => w.includes('ultrapassou o orçamento máximo'))).toBe(true)
    })
  })
})
