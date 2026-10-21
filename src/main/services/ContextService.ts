import type { SettingsService } from './SettingsService'
import type { TranscriptionService } from './TranscriptionService'
import type { ChatMessage, TranscriptSegment } from '../../preload/index.d'

export interface DetectedQuestion {
  questionText: string
  isImperativeRequest: boolean
  source: string
  timestamp: number
}

export interface ReconstructedChunk {
  text: string
  source: string
  startTime: number
  endTime: number
  segmentIds: string[]
}

export interface ComposeContextOptions {
  chatHistory?: ChatMessage[]
  attachScreen?: boolean
  forSummarize?: boolean
  detectedQuestion?: string
  maxEstimatedTokens?: number
}

export interface ComposedContext {
  prompt: string
  includedSegmentIds: string[]
  intervalStart?: string
  intervalEnd?: string
  estimatedInputTokens: number
  truncationWarnings: string[]
  detectedQuestion?: string
}

export class ContextService {
  private settingsService: SettingsService
  private transcriptionService: TranscriptionService

  // Orçamento estimado conservador: ~3.8 caracteres por token
  public static readonly CHARS_PER_TOKEN = 3.8
  public static readonly MAX_INPUT_TOKENS = 6000
  public static readonly SCREEN_IMAGE_TOKEN_ESTIMATE = 258
  public static readonly BASE_OVERHEAD_TOKENS = 350 // Delimitadores e system prompt

  constructor(settingsService: SettingsService, transcriptionService: TranscriptionService) {
    this.settingsService = settingsService
    this.transcriptionService = transcriptionService
  }

  /**
   * Reconstrói blocos contínuos de fala fundindo segmentos próximos da mesma fonte
   * Respeita teto de duração (máx 20s) e tamanho (máx 500 chars) para evitar blocos infinitos.
   */
  public reconstructSpeechChunks(segments: TranscriptSegment[]): ReconstructedChunk[] {
    if (segments.length === 0) return []

    const chunks: ReconstructedChunk[] = []
    let currentChunk: ReconstructedChunk | null = null

    for (const seg of segments) {
      if (!currentChunk) {
        currentChunk = {
          text: seg.text.trim(),
          source: seg.source,
          startTime: seg.timestamp,
          endTime: seg.timestamp,
          segmentIds: [seg.id]
        }
        continue
      }

      const sameSource = currentChunk.source === seg.source
      const timeDelta = seg.timestamp - currentChunk.endTime
      const totalDuration = seg.timestamp - currentChunk.startTime
      const totalChars = currentChunk.text.length + seg.text.length + 1

      // Funde se mesma fonte, delta < 5s, duração total <= 20s e texto <= 500 chars
      if (sameSource && timeDelta >= 0 && timeDelta <= 5000 && totalDuration <= 20000 && totalChars <= 500) {
        currentChunk.text = `${currentChunk.text} ${seg.text.trim()}`
        currentChunk.endTime = seg.timestamp
        currentChunk.segmentIds.push(seg.id)
      } else {
        chunks.push(currentChunk)
        currentChunk = {
          text: seg.text.trim(),
          source: seg.source,
          startTime: seg.timestamp,
          endTime: seg.timestamp,
          segmentIds: [seg.id]
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk)
    }

    return chunks
  }

  /**
   * Extrai a solicitação ou pergunta mais recente dentro dos trechos de fala reconstruídos.
   * Suporta interrogações com '?' e comandos imperativos (compare, tell me, etc).
   * Filtra falsos positivos afirmativos com 'como/how'.
   */
  public extractRecentQuestions(segments?: TranscriptSegment[]): DetectedQuestion | null {
    const segList = segments || this.transcriptionService.getSegments()
    if (segList.length === 0) return null

    const chunks = this.reconstructSpeechChunks(segList)

    // Regex para comandos imperativos em PT e EN
    const imperativeRegex =
      /^(compare|descreva|explique|me dê um exemplo|dê um exemplo|fale sobre|como você|o que você|qual a diferença|quais são|será que|tell me about|describe|explain|give me an example|how would you|what is the difference|what are|could you explain|can you explain)\b/i

    // Analisa os chunks do mais recente para o mais antigo
    for (let i = chunks.length - 1; i >= 0; i--) {
      const chunk = chunks[i]
      // Divide em sentenças preservando pontuações
      const sentences = chunk.text
        .split(/(?<=[.!?;\n])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      // Analisa as sentenças do final do bloco para o início
      for (let j = sentences.length - 1; j >= 0; j--) {
        const sentence = sentences[j]
        const cleanSentence = sentence.replace(/^[–—\s]+/, '').trim()
        const wordCount = cleanSentence.split(/\s+/).length

        // 1. Termina com '?' e tem pelo menos 2 palavras
        if (cleanSentence.endsWith('?') && wordCount >= 2) {
          // Previne falso positivo se for apenas uma hesitação afirmativa
          return {
            questionText: cleanSentence,
            isImperativeRequest: false,
            source: chunk.source,
            timestamp: chunk.endTime
          }
        }

        // 2. Comando imperativo explícito
        if (imperativeRegex.test(cleanSentence) && wordCount >= 3) {
          return {
            questionText: cleanSentence,
            isImperativeRequest: true,
            source: chunk.source,
            timestamp: chunk.endTime
          }
        }
      }
    }

    return null
  }

  /**
   * Orquestra o contexto completo com cálculo de orçamento estimado de tokens,
   * descarte hierárquico nas fronteiras e metadados de intervalo calculados após o descarte.
   */
  public composeContext(rawPrompt: string, options: ComposeContextOptions = {}): ComposedContext {
    const settings = this.settingsService.getSettings()
    const truncationWarnings: string[] = []
    const maxTokens = options.maxEstimatedTokens || ContextService.MAX_INPUT_TOKENS

    // 1. Avalia custo fixo (overhead, tela se anexada)
    let fixedTokens = ContextService.BASE_OVERHEAD_TOKENS
    if (options.attachScreen) {
      fixedTokens += ContextService.SCREEN_IMAGE_TOKEN_ESTIMATE
    }

    // 2. Avalia custo do pedido obrigatório (Tier 1)
    const promptTokens = Math.ceil(rawPrompt.length / ContextService.CHARS_PER_TOKEN)
    if (promptTokens + fixedTokens > maxTokens) {
      truncationWarnings.push(
        `O pedido do usuário (~${promptTokens} tokens) ultrapassou o orçamento máximo disponível (~${maxTokens} tokens).`
      )
    }

    // Orçamento restante para fontes contextuais dinâmicas
    let availableTokens = Math.max(0, maxTokens - promptTokens - fixedTokens)

    // 3. Notas do usuário (Tier 2)
    let notesContent = ''
    if (settings.includeNotesInContext) {
      const rawNotes = this.settingsService.getNotes().trim()
      if (rawNotes) {
        const maxNoteChars = 2500 // ~650 tokens
        if (rawNotes.length > maxNoteChars) {
          // Trunca suavemente na última quebra de linha antes do limite
          const slice = rawNotes.slice(0, maxNoteChars)
          const lastLine = slice.lastIndexOf('\n')
          notesContent = `${slice.slice(0, lastLine > 0 ? lastLine : maxNoteChars)}\n[... notas truncadas para respeitar o orçamento de contexto]`
          truncationWarnings.push('As anotações foram truncadas para respeitar o orçamento de contexto.')
        } else {
          notesContent = rawNotes
        }
        const noteTokens = Math.ceil(notesContent.length / ContextService.CHARS_PER_TOKEN)
        availableTokens = Math.max(0, availableTokens - noteTokens)
      }
    }

    // 4. Histórico de Chat (Tier 4 - filtrando mensagens de auto-assist)
    const allChat = (options.chatHistory || []).filter((m) => m.origin !== 'auto-assist')
    const includedChatMessages: ChatMessage[] = []
    let chatBudgetChars = Math.min(3000, Math.floor(availableTokens * 0.4 * ContextService.CHARS_PER_TOKEN))

    // Pega do mais recente para o mais antigo até atingir o limite
    for (let i = allChat.length - 1; i >= 0 && includedChatMessages.length < 6; i--) {
      const msg = allChat[i]
      const msgChars = msg.content.length + 30
      if (chatBudgetChars >= msgChars) {
        includedChatMessages.unshift(msg)
        chatBudgetChars -= msgChars
      } else {
        truncationWarnings.push('Mensagens mais antigas do chat foram descartadas pelo orçamento de contexto.')
        break
      }
    }

    const chatTokens = Math.ceil(
      includedChatMessages.reduce((acc, m) => acc + m.content.length + 30, 0) / ContextService.CHARS_PER_TOKEN
    )
    availableTokens = Math.max(0, availableTokens - chatTokens)

    // 5. Transcrição (Tier 3)
    const allSegments = this.transcriptionService.getSegments()
    const maxSegmentsCap = options.forSummarize ? 60 : 25
    const candidateSegments = allSegments.slice(-maxSegmentsCap)

    const includedSegments: TranscriptSegment[] = []
    let transcriptCharsBudget = Math.floor(availableTokens * ContextService.CHARS_PER_TOKEN)

    // Adiciona segmentos do mais recente para o mais antigo respeitando o orçamento
    for (let i = candidateSegments.length - 1; i >= 0; i--) {
      const seg = candidateSegments[i]
      const segChars = seg.text.length + 40 // Overhead de timestamp e source
      if (transcriptCharsBudget >= segChars) {
        includedSegments.unshift(seg)
        transcriptCharsBudget -= segChars
      } else {
        truncationWarnings.push('Segmentos mais antigos de transcrição foram descartados pelo orçamento de contexto.')
        break
      }
    }

    // 6. Calcula intervalo real de horário DEPOIS do descarte
    let intervalStart: string | undefined
    let intervalEnd: string | undefined
    if (includedSegments.length > 0) {
      intervalStart = new Date(includedSegments[0].timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      intervalEnd = new Date(includedSegments[includedSegments.length - 1].timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }

    // 7. Monta as partes do prompt estruturado
    const parts: string[] = []

    if (notesContent) {
      parts.push(`=== NOTAS E ROTEIRO DO USUÁRIO ===\n${notesContent}`)
    }

    if (includedSegments.length > 0) {
      const intervalLabel = intervalStart && intervalEnd ? ` (${intervalStart} – ${intervalEnd})` : ''
      const transcriptText = includedSegments
        .map((s) => `[${new Date(s.timestamp).toLocaleTimeString()}] ${s.source}: ${s.text}`)
        .join('\n')
      parts.push(`=== TRANSCRIÇÃO RECENTE DA REUNIÃO/AULA${intervalLabel} ===\n${transcriptText}`)
    }

    if (includedChatMessages.length > 0) {
      const chatText = includedChatMessages
        .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
        .join('\n')
      parts.push(`=== HISTÓRICO RECENTE DO CHAT ===\n${chatText}`)
    }

    if (options.detectedQuestion) {
      parts.push(`=== PERGUNTA / SOLICITAÇÃO IDENTIFICADA ===\n"${options.detectedQuestion}"`)
    }

    if (options.attachScreen) {
      parts.push(`=== CONTEXTO VISUAL ===\n[Uma captura em tempo real do monitor do usuário está anexada a esta solicitação.]`)
    }

    parts.push(`=== PEDIDO DO USUÁRIO ===\n${rawPrompt}`)

    const finalPrompt = parts.join('\n\n')
    const estimatedInputTokens = Math.ceil(finalPrompt.length / ContextService.CHARS_PER_TOKEN) + fixedTokens

    return {
      prompt: finalPrompt,
      includedSegmentIds: includedSegments.map((s) => s.id),
      intervalStart,
      intervalEnd,
      estimatedInputTokens,
      truncationWarnings,
      detectedQuestion: options.detectedQuestion
    }
  }

  /**
   * Helper compatível que retorna a string do prompt composto
   */
  public composePrompt(rawPrompt: string, chatHistory: ChatMessage[] = [], options: Partial<ComposeContextOptions> = {}): string {
    const result = this.composeContext(rawPrompt, { ...options, chatHistory })
    return result.prompt
  }

  public getSuggestAnswerPrompt(detectedQuestion?: string): string {
    if (detectedQuestion) {
      return (
        `A seguinte pergunta/solicitação foi identificada na conversa recente:\n` +
        `"${detectedQuestion}"\n\n` +
        `Formule uma resposta direta, assertiva e profissional para ela.\n` +
        `ESTRUTURA OBRIGATÓRIA DA RESPOSTA:\n` +
        `1. 🗣️ **Sugestão de Fala Curta**: 1 a 2 sentenças naturais e diretas prontas para eu falar oralmente de imediato com segurança.\n` +
        `2. 💡 **Aprofundamento Técnico**: 2 a 4 tópicos com detalhes conceituais, complexidade, trade-offs ou exemplos para sustentar caso peçam mais detalhes.`
      )
    }

    return (
      `Identifique a solicitação ou pergunta mais recente sustentada pela transcrição recente da conversa.\n` +
      `Se houver uma pergunta clara, responda com:\n` +
      `1. 🗣️ **Sugestão de Fala Curta**: 1 a 2 sentenças prontas para responder oralmente de imediato.\n` +
      `2. 💡 **Aprofundamento Técnico**: tópicos detalhados.\n` +
      `Se NÃO houver nenhuma solicitação ou pergunta clara na transcrição recente (apenas diálogo casual, afirmações ou contexto vago), informe isso explicitamente e peça esclarecimento ao usuário em vez de inventar uma pergunta.`
    )
  }

  public getSummarizePrompt(intervalText?: string): string {
    const scope = intervalText ? ` (${intervalText})` : ''
    return (
      `Faça um resumo conciso e estruturado do trecho recente da conversa transcrita${scope}, dividindo em:\n` +
      `1. 📌 **Principais Tópicos Discutidos** (máximo 4 tópicos essenciais)\n` +
      `2. ⚖️ **Decisões Tomadas** (o que foi definido ou acordado)\n` +
      `3. 🎯 **Próximos Passos & Itens de Ação** (quem fará o quê, se mencionado)`
    )
  }

  public getExplainScreenPrompt(): string {
    return (
      'Analise a imagem da tela capturada agora. ' +
      'Explique com clareza e precisão o que está sendo exibido (código, diagrama, interface ou problema). ' +
      'Se houver código ou erro, destaque possíveis bugs, melhorias ou a solução recomendada.'
    )
  }

  public getAnalyzeBugPrompt(): string {
    return (
      'Analise detalhadamente a imagem da tela capturada com foco exclusivo em identificar potenciais bugs, falhas de lógica, erros de sintaxe ou exceções visíveis.\n' +
      '1. **Localização**: Aponte exatamente a linha, componente ou trecho suspeito.\n' +
      '2. **Diagnóstico**: Explique a causa raiz do problema de forma direta.\n' +
      '3. **Solução**: Forneça o código corrigido e orientações práticas de correção.'
    )
  }
}
