import { BrowserWindow, screen, session, desktopCapturer, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { appLifecycle } from '../lifecycle'
import type { SettingsService, WindowBounds } from './SettingsService'
import type { PerssuaState } from '../../preload/index.d'
import {
  applyExcludeFromCapture,
  describeAffinity,
  readProtection,
  removeExcludeFromCapture
} from './ContentProtection'

const PROTECTION_WATCHDOG_MS = 500

export class OverlayService {
  private mainWindow: BrowserWindow | null = null
  private audioWorkerWindow: BrowserWindow | null = null
  private settingsService: SettingsService
  private onStateChangeCallback?: (state: PerssuaState) => void
  private protectionWatchdog: NodeJS.Timeout | null = null

  private getPreloadPath(): string {
    const candidates = [
      path.join(__dirname, '../preload/index.js'),
      path.join(__dirname, '../preload/index.mjs'),
      path.join(__dirname, '../preload/index.cjs')
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
    return candidates[0]
  }

  private state: PerssuaState = {
    isAssistantActive: false,
    isPanelVisible: true,
    panelMode: 'edit',
    isAudioCapturing: false,
    isTranscribing: false,
    isGeneratingResponse: false,
    hasApiKey: false,
    whisperServerStatus: 'stopped',
    contentProtectionStatus: 'Proteção ativada; compatibilidade não verificada',
    activeTab: 'chat'
  }

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService
    this.state.hasApiKey = settingsService.hasApiKey()
  }

  public setStateCallback(cb: (state: PerssuaState) => void): void {
    this.onStateChangeCallback = cb
  }

  public getState(): PerssuaState {
    return {
      ...this.state,
      hasApiKey: this.settingsService.hasApiKey()
    }
  }

  public updateState(partial: Partial<PerssuaState>): void {
    this.state = {
      ...this.state,
      ...partial,
      hasApiKey: this.settingsService.hasApiKey()
    }
    this.broadcastState()
  }

  private broadcastState(): void {
    const currentState = this.getState()
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('perssua:state-changed', currentState)
    }
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(currentState)
    }
  }

  public createMainWindow(): BrowserWindow {
    const savedBounds = this.settingsService.getBounds()
    const sanitizedBounds = this.sanitizeBounds(savedBounds)

    this.mainWindow = new BrowserWindow({
      x: sanitizedBounds.x,
      y: sanitizedBounds.y,
      width: sanitizedBounds.width,
      height: sanitizedBounds.height,
      minWidth: 380,
      minHeight: 520,
      maxWidth: 900,
      maxHeight: 1400,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: '#0d1117',
      hasShadow: true,
      show: false, // Só exibe após setContentProtection
      webPreferences: {
        preload: this.getPreloadPath(),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })

    // Ativa proteção de conteúdo antes da exibição (WDA_EXCLUDEFROMCAPTURE)
    this.ensureContentProtection('create')

    // O Electron/Chromium pode resetar a afinidade em transições de janela; reaplica sempre
    const reapply = (reason: string) => (): void => {
      this.ensureContentProtection(reason)
    }
    this.mainWindow.on('show', reapply('show'))
    this.mainWindow.on('restore', reapply('restore'))
    this.mainWindow.on('focus', reapply('focus'))
    this.mainWindow.on('always-on-top-changed', reapply('always-on-top-changed'))
    this.mainWindow.webContents.on('did-finish-load', reapply('did-finish-load'))
    this.mainWindow.on('closed', () => this.stopProtectionWatchdog())
    this.startProtectionWatchdog()

    // Salvar posição ao mover/redimensionar
    const handleBoundsUpdate = (): void => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const bounds = this.mainWindow.getBounds()
        this.settingsService.saveBounds(bounds)
      }
    }
    this.mainWindow.on('moved', handleBoundsUpdate)
    this.mainWindow.on('resized', handleBoundsUpdate)

    // Fechar minimiza para a bandeja
    this.mainWindow.on('close', (event) => {
      if (!appLifecycle.isQuitting) {
        event.preventDefault()
        this.hidePanel()
      }
    })

    // Carregar UI do Vite
    if (process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    this.mainWindow.once('ready-to-show', () => {
      this.showPanel()
    })

    this.setupDisplayMediaHandler()
    this.createAudioWorkerWindow()

    return this.mainWindow
  }

  public createAudioWorkerWindow(): BrowserWindow {
    if (this.audioWorkerWindow && !this.audioWorkerWindow.isDestroyed()) {
      return this.audioWorkerWindow
    }

    this.audioWorkerWindow = new BrowserWindow({
      show: false,
      width: 300,
      height: 300,
      webPreferences: {
        preload: this.getPreloadPath(),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })

    this.audioWorkerWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[AudioWorkerWindow] [lvl ${level}] ${message} (${sourceId}:${line})`)
    })

    this.audioWorkerWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[AudioWorkerWindow] Falha ao carregar: ${errorCode} - ${errorDescription}`)
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.audioWorkerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/audio-worker.html`)
    } else {
      this.audioWorkerWindow.loadFile(path.join(__dirname, '../renderer/audio-worker.html'))
    }

    return this.audioWorkerWindow
  }

  private setupDisplayMediaHandler(): void {
    // Permite captura de tela e mídia sem exibir diálogos de permissão bloqueantes
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (permission === 'media' || permission === 'display-capture') {
        console.log(`[OverlayService] Concedendo permissão: ${permission}`)
        callback(true)
        return
      }
      callback(false)
    })

    // Intercepta getDisplayMedia para fornecer áudio loopback do sistema no Windows
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      console.log('[OverlayService] Recebeu solicitação em setDisplayMediaRequestHandler')
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 0, height: 0 }
        })
        console.log(`[OverlayService] Fontes detectadas: ${sources.length}`, sources.map((s) => s.name))
        if (sources.length > 0) {
          console.log('[OverlayService] Autorizando áudio loopback do sistema com fonte:', sources[0].name)
          callback({ video: sources[0], audio: 'loopback' })
          return
        }
      } catch (err) {
        console.error('[OverlayService] Erro ao obter fontes de tela para áudio loopback:', err)
      }
      callback({})
    })
  }

  /** Proteção habilitada nas configurações (padrão: true). */
  public isContentProtectionEnabled(): boolean {
    return this.settingsService.getSettings().screenShareProtection !== false
  }

  /** Liga/desliga a invisibilidade no compartilhamento de tela imediatamente. */
  public setContentProtectionEnabled(enabled: boolean): void {
    console.log(`[OverlayService] Proteção de captura ${enabled ? 'habilitada' : 'desabilitada'} pelo usuário.`)
    this.ensureContentProtection(enabled ? 'user-enabled' : 'user-disabled')
  }

  /**
   * Aplica o estado de proteção configurado na janela principal e atualiza o status.
   * Retorna true quando a janela está confirmadamente excluída da captura pelo SO.
   */
  public ensureContentProtection(reason: string): boolean {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false

    let status: string
    let excluded = false

    if (this.isContentProtectionEnabled()) {
      const result = applyExcludeFromCapture(this.mainWindow)
      excluded = result.excluded
      status = !result.nativeAvailable
        ? 'Proteção ativada (não verificada)'
        : result.excluded
          ? 'Invisível no compartilhamento de tela'
          : `Falha na proteção (${describeAffinity(result.affinity)})`
    } else {
      removeExcludeFromCapture(this.mainWindow)
      status = 'Visível no compartilhamento de tela'
    }

    if (status !== this.state.contentProtectionStatus) {
      console.log(`[OverlayService] Proteção de captura (${reason}): ${status}`)
      this.updateState({ contentProtectionStatus: status })
    }
    return excluded
  }

  /** Verifica periodicamente se a afinidade foi resetada e corrige imediatamente. */
  private startProtectionWatchdog(): void {
    this.stopProtectionWatchdog()
    this.protectionWatchdog = setInterval(() => {
      if (!this.mainWindow || this.mainWindow.isDestroyed() || !this.mainWindow.isVisible()) return
      if (!this.isContentProtectionEnabled()) return
      const current = readProtection(this.mainWindow)
      if (current.nativeAvailable && !current.excluded) {
        console.warn(
          `[OverlayService] Afinidade resetada para ${describeAffinity(current.affinity)}; reaplicando proteção.`
        )
        this.ensureContentProtection('watchdog')
      }
    }, PROTECTION_WATCHDOG_MS)
  }

  private stopProtectionWatchdog(): void {
    if (this.protectionWatchdog) {
      clearInterval(this.protectionWatchdog)
      this.protectionWatchdog = null
    }
  }

  /** Reexibe a janela sem roubar foco (usado após captura de tela), reaplicando a proteção. */
  public restoreWithoutFocus(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.ensureContentProtection('restore-before-show')
      this.mainWindow.showInactive()
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver')
      this.ensureContentProtection('restore-after-show')
    }
  }

  public showPanel(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.ensureContentProtection('show-before')
      this.mainWindow.show()
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver')
      this.ensureContentProtection('show-after')
      this.mainWindow.focus()
      this.updateState({ isPanelVisible: true })
    }
  }

  public hidePanel(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide()
      this.updateState({ isPanelVisible: false })
    }
  }

  public togglePanelVisibility(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      if (this.mainWindow.isVisible()) {
        this.hidePanel()
      } else {
        this.showPanel()
      }
    }
  }

  public setPanelMode(mode: 'edit' | 'query'): void {
    this.updateState({ panelMode: mode })
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // setIgnoreMouseEvents altera WS_EX_LAYERED/WS_EX_TRANSPARENT; reaplica a proteção em seguida
      if (mode === 'query') {
        this.mainWindow.setIgnoreMouseEvents(true, { forward: true })
        this.ensureContentProtection('click-through-on')
      } else {
        this.mainWindow.setIgnoreMouseEvents(false)
        this.ensureContentProtection('click-through-off')
        this.mainWindow.focus()
      }
    }
  }

  public toggleAssistantActive(): void {
    const nextState = !this.state.isAssistantActive
    this.setAssistantActive(nextState)
  }

  public setAssistantActive(active: boolean): void {
    this.updateState({ isAssistantActive: active })
    if (!active) {
      // Desativar encerra tracks, cancela solicitações e limpa filas
      this.stopAudioCaptureWorker()
      this.updateState({
        isAudioCapturing: false,
        isTranscribing: false,
        isGeneratingResponse: false
      })
    } else {
      this.startAudioCaptureWorker()
    }
  }

  public startAudioCaptureWorker(): void {
    if (this.audioWorkerWindow && !this.audioWorkerWindow.isDestroyed()) {
      if (this.audioWorkerWindow.webContents.isLoading()) {
        this.audioWorkerWindow.webContents.once('did-finish-load', () => {
          if (this.audioWorkerWindow && !this.audioWorkerWindow.isDestroyed()) {
            this.audioWorkerWindow.webContents.send('perssua:audio-worker-command', { action: 'start' })
          }
        })
      } else {
        this.audioWorkerWindow.webContents.send('perssua:audio-worker-command', { action: 'start' })
      }
    }
    this.updateState({ isAudioCapturing: true, isTranscribing: true })
  }

  public stopAudioCaptureWorker(): void {
    if (this.audioWorkerWindow && !this.audioWorkerWindow.isDestroyed()) {
      this.audioWorkerWindow.webContents.send('perssua:audio-worker-command', { action: 'stop' })
    }
    this.updateState({ isAudioCapturing: false, isTranscribing: false })
  }

  public toggleTranscription(): void {
    if (this.state.isAudioCapturing) {
      this.stopAudioCaptureWorker()
    } else {
      this.startAudioCaptureWorker()
    }
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public getAudioWorkerWindow(): BrowserWindow | null {
    return this.audioWorkerWindow
  }

  private sanitizeBounds(bounds: WindowBounds): WindowBounds {
    const displays = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()

    let chosenDisplay = primary
    if (bounds.x !== undefined && bounds.y !== undefined) {
      const match = displays.find((d) => {
        const { x, y, width, height } = d.bounds
        return (
          bounds.x! >= x &&
          bounds.x! <= x + width &&
          bounds.y! >= y &&
          bounds.y! <= y + height
        )
      })
      if (match) {
        chosenDisplay = match
      }
    }

    const { x, y, width, height } = chosenDisplay.workArea
    const w = Math.min(bounds.width || 440, width)
    const h = Math.min(bounds.height || 640, height)
    const posX = bounds.x !== undefined ? Math.max(x, Math.min(bounds.x, x + width - w)) : x + width - w - 24
    const posY = bounds.y !== undefined ? Math.max(y, Math.min(bounds.y, y + height - h)) : y + 32

    return { x: posX, y: posY, width: w, height: h }
  }
}
