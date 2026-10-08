import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GeminiProvider } from '../src/main/services/GeminiProvider'
import type { SettingsService } from '../src/main/services/SettingsService'

// Mock do SDK @google/genai
const mockInteractionsCreate = vi.fn()
const mockGenerateContentStream = vi.fn()

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      interactions: {
        create: mockInteractionsCreate
      },
      models: {
        generateContentStream: mockGenerateContentStream
      }
    }))
  }
})

describe('GeminiProvider with Gemini 3.8 Flash Interactions API', () => {
  let mockSettingsService: Partial<SettingsService>
  let provider: GeminiProvider

  beforeEach(() => {
    vi.clearAllMocks()
    mockSettingsService = {
      getApiKey: vi.fn().mockReturnValue('mock-api-key-123'),
      getSettings: vi.fn().mockReturnValue({
        geminiModel: 'models/gemini-3.8-flash',
        responseLanguage: 'pt-BR',
        transcriptionLanguage: 'pt',
        whisperBinaryPath: '',
        whisperModelPath: '',
        selectedMonitorId: '',
        autoAssistEnabled: false,
        autoAssistIntervalSeconds: 30,
        includeNotesInContext: true,
        shortcuts: {}
      } as any)
    }

    provider = new GeminiProvider(mockSettingsService as SettingsService)
  })

  it('deve chamar ai.interactions.create com modelo 3.8 flash, tools e generationConfig corretos', async () => {
    mockInteractionsCreate.mockResolvedValueOnce({
      id: 'interaction-123',
      output_text: 'Esta é a resposta do Gemini 3.8 Flash.',
      steps: [
        {
          type: 'model_output',
          content: [{ type: 'text', text: 'Esta é a resposta do Gemini 3.8 Flash.' }]
        }
      ]
    })

    const chunks: string[] = []
    const result = await provider.generateContentStream({
      prompt: 'Explique o padrão CQRS',
      onChunk: (chunk) => chunks.push(chunk)
    })

    expect(mockInteractionsCreate).toHaveBeenCalledTimes(1)
    const callArgs = mockInteractionsCreate.mock.calls[0][0]

    expect(callArgs.model).toBe('models/gemini-3.8-flash')
    expect(callArgs.input).toBe('Explique o padrão CQRS')
    expect(callArgs.tools).toEqual([
      { type: 'code_execution' },
      { type: 'google_search' },
      { type: 'url_context' }
    ])
    expect(callArgs.generation_config).toMatchObject({
      max_output_tokens: 65536,
      thinkingLevel: 'medium'
    })

    expect(result).toBe('Esta é a resposta do Gemini 3.8 Flash.')
    expect(chunks).toContain('Esta é a resposta do Gemini 3.8 Flash.')
  })

  it('deve extrair texto de interaction.steps?.at(-1) se output_text estiver vazio', async () => {
    mockInteractionsCreate.mockResolvedValueOnce({
      id: 'interaction-456',
      output_text: undefined,
      steps: [
        {
          type: 'thought',
          thought: 'Pensando na resposta...'
        },
        {
          type: 'model_output',
          content: [{ type: 'text', text: 'Resposta extraída dos steps.' }]
        }
      ]
    })

    const chunks: string[] = []
    const result = await provider.generateContentStream({
      prompt: 'Qual a complexidade do quicksort?',
      onChunk: (chunk) => chunks.push(chunk)
    })

    expect(result).toBe('Resposta extraída dos steps.')
    expect(chunks).toEqual(['Resposta extraída dos steps.'])
  })

  it('deve enviar conteúdo multimodal quando imagem de tela for anexada', async () => {
    mockInteractionsCreate.mockResolvedValueOnce({
      id: 'interaction-789',
      output_text: 'Análise da tela concluída.',
      steps: []
    })

    await provider.generateContentStream({
      prompt: 'Analise este erro na tela',
      imageBase64: 'base64imagedata==',
      mimeType: 'image/jpeg',
      onChunk: () => {}
    })

    const callArgs = mockInteractionsCreate.mock.calls[0][0]
    expect(Array.isArray(callArgs.input)).toBe(true)
    expect(callArgs.input).toEqual([
      {
        type: 'text',
        text: 'Analise este erro na tela'
      },
      {
        type: 'image',
        data: 'base64imagedata==',
        mime_type: 'image/jpeg'
      }
    ])
  })

  it('deve disparar erro claro quando API key não estiver configurada', async () => {
    mockSettingsService.getApiKey = vi.fn().mockReturnValue(null)

    await expect(
      provider.generateContentStream({
        prompt: 'Olá',
        onChunk: () => {}
      })
    ).rejects.toThrow('API Key do Gemini não configurada')
  })
})
