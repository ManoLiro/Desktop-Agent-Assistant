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

export function registerIpcHandlers(services: AppServices): void {
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

  // Ações rápidas
  ipcMain.handle('perssua:capture-screen-and-explain', async () => {
    const prompt = contextService.getExplainScreenPrompt()
    let screenImageBase64: string | undefined
    let mimeType: string | undefined

    try {
      const capture = await screenCaptureService.captureScreen()
      screenImageBase64 = capture.base64
      mimeType = capture.mimeType
    } catch (err: any) {
      const win = overlayService.getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('perssua:chat-error', `Falha na captura de tela: ${err.message}`)
      }
      return
    }

    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: '📸 Explicar conteúdo da tela atual',
      timestamp: Date.now(),
      hasScreenContext: true
    }
    chatHistory.push(userMessage)

    overlayService.updateState({ isGeneratingResponse: true, activeTab: 'chat' })
    const win = overlayService.getMainWindow()

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
      if (win && !win.isDestroyed()) {
        win.webContents.send('perssua:chat-error', err.message)
      }
    } finally {
      overlayService.updateState({ isGeneratingResponse: false })
    }
  })

  ipcMain.handle('perssua:suggest-answer-last-question', async () => {
    const prompt = contextService.getSuggestAnswerPrompt()
    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: '💡 Sugerir resposta à última pergunta da conversa',
      timestamp: Date.now()
    }
    chatHistory.push(userMessage)

    overlayService.updateState({ isGeneratingResponse: true, activeTab: 'chat' })
    const win = overlayService.getMainWindow()

    try {
      const fullResponse = await geminiProvider.generateContentStream({
        prompt: contextService.composePrompt(prompt, chatHistory),
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
        win.webContents.send('perssua:chat-error', err.message)
      }
    } finally {
      overlayService.updateState({ isGeneratingResponse: false })
    }
  })

  ipcMain.handle('perssua:summarize-conversation', async () => {
    const prompt = contextService.getSummarizePrompt()
    const userMessage: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: '📝 Resumir conversa atual e itens de ação',
      timestamp: Date.now()
    }
    chatHistory.push(userMessage)

    overlayService.updateState({ isGeneratingResponse: true, activeTab: 'chat' })
    const win = overlayService.getMainWindow()

    try {
      const fullResponse = await geminiProvider.generateContentStream({
        prompt: contextService.composePrompt(prompt, chatHistory),
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
        win.webContents.send('perssua:chat-error', err.message)
      }
    } finally {
      overlayService.updateState({ isGeneratingResponse: false })
    }
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
      if (settings.shortcuts) {
        shortcutService.updateShortcuts(settings.shortcuts)
      }
      if (settings.autoAssistEnabled !== undefined) {
        if (settings.autoAssistEnabled) {
          autoAssistService.start()
        } else {
          autoAssistService.stop()
        }
      }
      return { success: true }
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
}
