import { GoogleGenAI } from '@google/genai'
import type { SettingsService } from './SettingsService'

export interface GenerationOptions {
  prompt: string
  systemInstruction?: string
  imageBase64?: string
  mimeType?: string
  onChunk: (chunk: string) => void
  signal?: AbortSignal
}

export class GeminiProvider {
  private settingsService: SettingsService
  private activeAbortController: AbortController | null = null

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService
  }

  public cancelCurrentGeneration(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = null
    }
  }

  public isGenerating(): boolean {
    return this.activeAbortController !== null
  }

  public async generateContentStream(options: GenerationOptions): Promise<string> {
    const apiKey = this.settingsService.getApiKey()
    if (!apiKey) {
      throw new Error('API Key do Gemini não configurada. Configure sua chave nas configurações do Perssua.')
    }

    const settings = this.settingsService.getSettings()
    const model = settings.geminiModel || 'gemini-2.5-flash'

    this.activeAbortController = new AbortController()
    const signal = options.signal || this.activeAbortController.signal

    try {
      const ai = new GoogleGenAI({ apiKey })

      const defaultSystemInstruction =
        `Você é o Perssua, um assistente contextual para reuniões, aulas, programação e entrevistas. ` +
        `Responda de forma direta e concisa em ${settings.responseLanguage}. ` +
        `Use apenas o contexto fornecido (transcrição, notas e tela). ` +
        `Sinalize incerteza se a transcrição estiver confusa. ` +
        `Diferencie fatos mencionados de sugestões. ` +
        `Em sugestões de fala, produza primeiro uma resposta curta e natural pronta para falar.`

      const systemPrompt = options.systemInstruction || defaultSystemInstruction

      const contents: Array<any> = []

      if (options.imageBase64) {
        contents.push({
          inlineData: {
            data: options.imageBase64,
            mimeType: options.mimeType || 'image/jpeg'
          }
        })
      }

      contents.push({
        text: options.prompt
      })

      const responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.4
        }
      })

      let fullResponse = ''

      for await (const chunk of responseStream) {
        if (signal.aborted) {
          throw new Error('Geração cancelada pelo usuário.')
        }

        const text = chunk.text || ''
        if (text) {
          fullResponse += text
          options.onChunk(text)
        }
      }

      return fullResponse
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') {
        throw new Error('Geração cancelada pelo usuário.')
      }

      const msg = err?.message || String(err)
      if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
        throw new Error('API Key do Gemini inválida. Verifique sua chave nas configurações.')
      } else if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        throw new Error('Limite de requisições ou cota do Gemini excedida. Aguarde um instante.')
      } else if (msg.includes('NOT_FOUND') || msg.includes('models/')) {
        throw new Error(`Modelo "${model}" indisponível para esta chave. Escolha outro nas configurações.`)
      }

      throw new Error(`Erro na resposta do Gemini: ${msg}`)
    } finally {
      this.activeAbortController = null
    }
  }
}
