import type { SettingsService } from './SettingsService'
import type { TranscriptionService } from './TranscriptionService'
import type { ChatMessage } from '../../preload/index.d'

export interface PromptContext {
  prompt: string
  notes?: string
  transcription?: string
  chatHistory?: ChatMessage[]
}

export class ContextService {
  private settingsService: SettingsService
  private transcriptionService: TranscriptionService

  constructor(settingsService: SettingsService, transcriptionService: TranscriptionService) {
    this.settingsService = settingsService
    this.transcriptionService = transcriptionService
  }

  public composePrompt(rawPrompt: string, chatHistory: ChatMessage[] = []): string {
    const settings = this.settingsService.getSettings()
    const parts: string[] = []

    // 1. Notas incluídas
    if (settings.includeNotesInContext) {
      const notes = this.settingsService.getNotes().trim()
      if (notes) {
        parts.push(`=== NOTAS E ROTEIRO DO USUÁRIO ===\n${notes}`)
      }
    }

    // 2. Transcrição recente (orçamento limitado: últimos ~30 segmentos ou 4.000 caracteres)
    const segments = this.transcriptionService.getSegments()
    if (segments.length > 0) {
      const recentSegments = segments.slice(-25)
      const transcriptText = recentSegments
        .map((s) => `[${new Date(s.timestamp).toLocaleTimeString()}] ${s.source}: ${s.text}`)
        .join('\n')
      parts.push(`=== TRANSCRIÇÃO RECENTE DA REUNIÃO/AULA ===\n${transcriptText}`)
    }

    // 3. Histórico do Chat recente (últimas 4 mensagens para manter orçamento)
    if (chatHistory.length > 0) {
      const recentChat = chatHistory.slice(-4)
      const chatText = recentChat
        .map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
        .join('\n')
      parts.push(`=== HISTÓRICO RECENTE DO CHAT ===\n${chatText}`)
    }

    // 4. Pergunta ou instrução do usuário
    parts.push(`=== PEDIDO DO USUÁRIO ===\n${rawPrompt}`)

    return parts.join('\n\n')
  }

  public getSuggestAnswerPrompt(): string {
    return (
      'Com base na transcrição recente da conversa, identifique a última pergunta que foi feita a mim ' +
      'ou ao grupo e formule uma resposta direta, assertiva e profissional. ' +
      'Forneça PRIMEIRO uma sugestão de fala curta e natural pronta para eu responder oralmente, ' +
      'e se necessário, adicione pontos técnicos adicionais logo abaixo.'
    )
  }

  public getSummarizePrompt(): string {
    return (
      'Faça um resumo conciso e estruturado da conversa transcrita até agora, dividindo em:\n' +
      '1. Principais tópicos discutidos\n' +
      '2. Decisões tomadas\n' +
      '3. Próximos passos / Ações acordadas'
    )
  }

  public getExplainScreenPrompt(): string {
    return (
      'Analise a imagem da tela capturada agora. ' +
      'Explique com clareza e precisão o que está sendo exibido (código, diagrama, interface ou problema). ' +
      'Se houver código ou erro, destaque possíveis bugs, melhorias ou a solução recomendada.'
    )
  }
}
