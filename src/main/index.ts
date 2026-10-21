import { app, BrowserWindow } from 'electron'
import { SettingsService } from './services/SettingsService'
import { OverlayService } from './services/OverlayService'
import { ShortcutService } from './services/ShortcutService'
import { TrayService } from './services/TrayService'
import { GeminiProvider } from './services/GeminiProvider'
import { ScreenCaptureService } from './services/ScreenCaptureService'
import { TranscriptionService } from './services/TranscriptionService'
import { ContextService } from './services/ContextService'
import { AutoAssistService } from './services/AutoAssistService'
import { GenerationCoordinator } from './services/GenerationCoordinator'
import { registerIpcHandlers, type QuickActionType } from './ipc/registerIpcHandlers'

// Garante instância única
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

// Habilita captura de tela e áudio do sistema para workers de mídia em segundo plano
app.commandLine.appendSwitch('enable-user-media-screen-capturing')
app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'Entire Screen')

import { appLifecycle } from './lifecycle'

let overlayService: OverlayService
let settingsService: SettingsService
let shortcutService: ShortcutService
let trayService: TrayService
let geminiProvider: GeminiProvider
let screenCaptureService: ScreenCaptureService
let transcriptionService: TranscriptionService
let contextService: ContextService
let autoAssistService: AutoAssistService
let generationCoordinator: GenerationCoordinator

async function initApp(): Promise<void> {
  settingsService = new SettingsService()
  overlayService = new OverlayService(settingsService)
  trayService = new TrayService(overlayService)
  geminiProvider = new GeminiProvider(settingsService)
  screenCaptureService = new ScreenCaptureService(overlayService, settingsService)
  transcriptionService = new TranscriptionService(settingsService, overlayService)
  contextService = new ContextService(settingsService, transcriptionService)
  generationCoordinator = new GenerationCoordinator()
  autoAssistService = new AutoAssistService(
    settingsService,
    overlayService,
    transcriptionService,
    contextService,
    geminiProvider,
    generationCoordinator
  )

  let executeQuickAction: (action: QuickActionType) => Promise<void> = async () => {}

  // Mapeamento dos atalhos globais
  shortcutService = new ShortcutService(settingsService, {
    onToggleAssistant: () => {
      overlayService.toggleAssistantActive()
    },
    onTogglePanel: () => {
      overlayService.togglePanelVisibility()
    },
    onFocusChat: () => {
      overlayService.showPanel()
      overlayService.setPanelMode('edit')
      overlayService.updateState({ activeTab: 'chat' })
    },
    onCaptureScreen: () => {
      executeQuickAction('capture-screen')
    },
    onSuggestAnswer: () => {
      executeQuickAction('suggest-answer')
    },
    onSummarize: () => {
      executeQuickAction('summarize')
    },
    onToggleTranscription: () => {
      overlayService.toggleTranscription()
    },
    onOpenNotes: () => {
      overlayService.showPanel()
      overlayService.setPanelMode('edit')
      overlayService.updateState({ activeTab: 'notes' })
    },
    onPanicStop: () => {
      // Interromper captura e requisições; ocultar painel
      generationCoordinator.cancelCurrent()
      geminiProvider.cancelCurrentGeneration()
      overlayService.setAssistantActive(false)
      overlayService.hidePanel()
    }
  })

  // Registra IPC
  const ipcResult = registerIpcHandlers({
    overlayService,
    settingsService,
    shortcutService,
    geminiProvider,
    screenCaptureService,
    transcriptionService,
    contextService,
    autoAssistService,
    generationCoordinator
  })
  executeQuickAction = ipcResult.executeQuickAction

  // Conecta mudanças de estado ao menu da bandeja
  overlayService.setStateCallback((state) => {
    trayService.updateMenu(state)
  })

  // Inicializa Janelas e Bandeja
  overlayService.createMainWindow()
  trayService.init()
  shortcutService.registerAll()
}

app.whenReady().then(initApp)

app.on('second-instance', () => {
  if (overlayService) {
    overlayService.showPanel()
  }
})

app.on('window-all-closed', () => {
  // Mantém app vivo na bandeja no Windows a menos que explicitamente fechado
  if (appLifecycle.isQuitting) {
    app.quit()
  }
})

app.on('before-quit', () => {
  appLifecycle.isQuitting = true
  if (shortcutService) {
    shortcutService.unregisterAll()
  }
  if (transcriptionService) {
    transcriptionService.stopWhisperServer()
  }
  if (autoAssistService) {
    autoAssistService.stop()
  }
  if (trayService) {
    trayService.destroy()
  }
})
