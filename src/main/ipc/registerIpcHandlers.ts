import { ipcMain, clipboard, app } from 'electron'
import { appLifecycle } from '../lifecycle'
import type { OverlayService } from '../services/OverlayService'
import type { SettingsService } from '../services/SettingsService'
import type { ShortcutService } from '../services/ShortcutService'
import type { GeminiProvider } from '../services/GeminiProvider'
import type { ScreenCaptureService } from '../services/ScreenCaptureService'
import type { TranscriptionService } from '../services/TranscriptionService'
import type { ContextService } from '../services/ContextService'
import type { AutoAssistService } from '../services/AutoAssistService'
import type { ChatMessage } from '../../preload/index.d'

export type QuickActionType = 'capture-screen' | 'analyze-bug' | 'suggest-answer' | 'summarize'

export interface IpcHandlersResult {
  executeQuickAction: (action: QuickActionType) => Promise<void>
  getChatHistory: () => ChatMessage[]
}

export interface AppServices {
  overlayService: OverlayService
  settingsService: SettingsService
  shortcutService: ShortcutService
  geminiProvider: GeminiProvider
  screenCaptureService: ScreenCaptureService
  transcriptionService: TranscriptionService
  contextService: ContextService
  autoAssistService: AutoAssistService
}

export function registerIpcHandlers(services: AppServices): IpcHandlersResult {
  const {
    overlayService,
    settingsService,
    shortcutService,
    geminiProvider,
    screenCaptureService,
    transcriptionService,
    contextService,
    autoAssistService
  } = services

  let chatHistory: ChatMessage[] = []

  // Estado geral
  ipcMain.handle('perssua:get-state', () => {
    return overlayService.getState()
  })

  ipcMain.handle('perssua:set-assistant-active', (_event, active: boolean) => {
    overlayService.setAssistantActive(active)
    if (active) {
      transcriptionService.startWhisperServer()
      autoAssistService.start()
    } else {
      geminiProvider.cancelCurrentGeneration()
      autoAssistService.stop()
      transcriptionService.stopWhisperServer()
    }
  })

  ipcMain.handle('perssua:set-panel-mode', (_event, mode: 'edit' | 'query') => {
    overlayService.setPanelMode(mode)
  })

  ipcMain.handle('perssua:set-active-tab', (_event, tab: 'chat' | 'transcript' | 'notes') => {
    overlayService.updateState({ activeTab: tab })
  })

  ipcMain.handle('perssua:minimize-to-tray', () => {
    overlayService.hidePanel()
  })

  ipcMain.handle('perssua:quit-app', () => {
    appLifecycle.isQuitting = true
    geminiProvider.cancelCurrentGeneration()
    transcriptionService.stopWhisperServer()
    shortcutService.unregisterAll()
    app.quit()
  })

  ipcMain.handle('perssua:update-bounds', (_event, bounds) => {
    settingsService.saveBounds(bounds)
  })

  // Chat com IA
  ipcMain.handle('perssua:send-chat', async (_event, { prompt, attachScreen }) => {
    let screenImageBase64: string | undefined
    let mimeType: string | undefined

    if (attachScreen) {
      try {
        const capture = await screenCaptureService.captureScreen()
        screenImageBase64 = capture.base64
        mimeType = capture.mimeType
      } catch (err: any) {
        console.error('[IPC] Erro ao capturar tela para o chat:', err)
      }
    }

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      hasScreenContext: !!screenImageBase64
    }
    chatHistory.push(userMessage)

    const composedPrompt = contextService.composePrompt(prompt, chatHistory)
    const win = overlayService.getMainWindow()

    try {
      overlayService.updateState({ isGeneratingResponse: true })

      const fullResponse = await geminiProvider.generateContentStream({
        prompt: composedPrompt,
        imageBase64: screenImageBase64,
        mimeType,
        onChunk: (chunk) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('perssua:chat-chunk', chunk)
          }
        }
      })

      const assistantMessage: ChatMessage = {
        id: `ast_${Date.now()}`,
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now()
      }
      chatHistory.push(assistantMessage)

      if (win && !win.isDestroyed()) {
        win.webContents.send('perssua:chat-done', assistantMessage)
      }
    } catch (err: any) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('perssua:chat-error', err.message || 'Erro inesperado na geração.')
      }
    } finally {
      overlayService.updateState({ isGeneratingResponse: false })
    }
  })

  ipcMain.handle('perssua:cancel-chat', () => {
    geminiProvider.cancelCurrentGeneration()
    overlayService.updateState({ isGeneratingResponse: false })
  })

  ipcMain.handle('perssua:copy-clipboard', (_event, text: string) => {
    clipboard.writeText(text)
    return true
  })

  // Função centralizada para execução de Ações Rápidas (usada tanto por atalhos globais quanto pela UI)
  async function executeQuickAction(action: QuickActionType): Promise<void> {
    const win = overlayService.getMainWindow()

    if (geminiProvider.isGenerating()) {
      geminiProvider.cancelCurrentGeneration()
    }

    let prompt = ''
    let userMessageContent = ''
    let shouldCaptureScreen = false

    switch (action) {
      case 'capture-screen':
        prompt = contextService.getExplainScreenPrompt()
        userMessageContent = '📸 Explicar conteúdo da tela atual'
        shouldCaptureScreen = true
        break
      case 'analyze-bug':
        prompt = contextService.getAnalyzeBugPrompt()
        userMessageContent = '🐛 Analisar possível bug na tela'
        shouldCaptureScreen = true
        break
      case 'suggest-answer':
        prompt = contextService.getSuggestAnswerPrompt()
        userMessageContent = '💡 Sugerir resposta à última pergunta da conversa'
        shouldCaptureScreen = false
        break
      case 'summarize':
        prompt = contextService.getSummarizePrompt()
        userMessageContent = '📝 Resumir conversa atual e itens de ação'
        shouldCaptureScreen = false
        break
    }

    let screenImageBase64: string | undefined
    let mimeType: string | undefined

    if (shouldCaptureScreen) {
      try {
        const capture = await screenCaptureService.captureScreen()
        screenImageBase64 = capture.base64
        mimeType = capture.mimeType
      } catch (err: any) {
        console.error(`[QuickAction] Falha ao capturar tela: ${err.message}`)
        if (win && !win.isDestroyed()) {
          win.webContents.send('perssua:chat-error', `Falha na captura de tela: ${err.message}`)
        }
        return
      }
    }

    // Exibe o painel, restaura modo interativo de edição e seleciona aba de chat
    overlayService.showPanel()
    overlayService.setPanelMode('edit')
    overlayService.updateState({ activeTab: 'chat', isGeneratingResponse: true })

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: userMessageContent,
      timestamp: Date.now(),
      hasScreenContext: shouldCaptureScreen
    }
    chatHistory.push(userMessage)

    // Notifica UI da mensagem do usuário para que o balão apareça instantaneamente
    if (win && !win.isDestroyed()) {
      win.webContents.send('perssua:user-message', userMessage)
    }

    try {
      const fullResponse = await geminiProvider.generateContentStream({
        prompt: contextService.composePrompt(prompt, chatHistory),
        imageBase64: screenImageBase64,
        mimeType,
        onChunk: (chunk) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('perssua:chat-chunk', chunk)
          }
        }
      })

      const assistantMessage: ChatMessage = {
        id: `ast_${Date.now()}`,
        role: 'assistant',
        content: fullResponse,
        timestamp: Date.now()
      }
      chatHistory.push(assistantMessage)

      if (win && !win.isDestroyed()) {
        win.webContents.send('perssua:chat-done', assistantMessage)
      }
    } catch (err: any) {
      console.error(`[QuickAction] Erro na geração do Gemini: ${err.message}`)
      if (win && !win.isDestroyed()) {
        win.webContents.send('perssua:chat-error', err.message || 'Erro inesperado na geração.')
      }
    } finally {
      overlayService.updateState({ isGeneratingResponse: false })
    }
  }

  // Handlers IPC para Ações Rápidas acionadas pela UI
  ipcMain.handle('perssua:capture-screen-and-explain', async () => {
    await executeQuickAction('capture-screen')
  })

  ipcMain.handle('perssua:capture-screen-and-analyze-bug', async () => {
    await executeQuickAction('analyze-bug')
  })

  ipcMain.handle('perssua:suggest-answer-last-question', async () => {
    await executeQuickAction('suggest-answer')
  })

  ipcMain.handle('perssua:summarize-conversation', async () => {
    await executeQuickAction('summarize')
  })

  // Notas e configurações
  ipcMain.handle('perssua:get-notes', () => {
    return settingsService.getNotes()
  })

  ipcMain.handle('perssua:save-notes', (_event, notes: string) => {
    settingsService.saveNotes(notes)
  })

  ipcMain.handle('perssua:get-settings', () => {
    return settingsService.getSettings()
  })

  ipcMain.handle('perssua:save-settings', (_event, settings) => {
    try {
      settingsService.saveSettings(settings)
      let shortcutResult: { success: boolean; conflicts: string[] } = { success: true, conflicts: [] }
      if (settings.shortcuts) {
        shortcutResult = shortcutService.updateShortcuts(settings.shortcuts)
      }
      if (settings.autoAssistEnabled !== undefined) {
        if (settings.autoAssistEnabled) {
          autoAssistService.start()
        } else {
          autoAssistService.stop()
        }
      }
      return { success: shortcutResult.success, conflicts: shortcutResult.conflicts }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('perssua:save-api-key', (_event, key: string) => {
    const ok = settingsService.saveApiKey(key)
    overlayService.updateState({ hasApiKey: settingsService.hasApiKey() })
    return ok
  })

  ipcMain.handle('perssua:has-api-key', () => {
    return settingsService.hasApiKey()
  })

  ipcMain.handle('perssua:get-available-screens', async () => {
    return screenCaptureService.getAvailableScreens()
  })

  // Transcrição e Audio Worker
  ipcMain.handle('perssua:toggle-transcription', () => {
    overlayService.toggleTranscription()
  })

  ipcMain.handle('perssua:clear-transcript', () => {
    transcriptionService.clearSegments()
  })

  ipcMain.handle('perssua:audio-worker-chunk', (_event, { chunk, sampleRate }) => {
    const samples = new Int16Array(chunk)
    transcriptionService.handleAudioChunk(samples, sampleRate)
  })

  // Atalhos e conflitos
  ipcMain.handle('perssua:get-active-shortcuts', () => {
    return shortcutService.getActiveShortcuts()
  })

  ipcMain.handle('perssua:get-shortcut-conflicts', () => {
    return shortcutService.getConflicts()
  })

  return {
    executeQuickAction,
    getChatHistory: () => [...chatHistory]
  }
}
