import { BrowserWindow, screen, session, desktopCapturer, app } from 'electron'
import * as path from 'path'
import { appLifecycle } from '../lifecycle'
import type { SettingsService, WindowBounds } from './SettingsService'
import type { PerssuaState } from '../../preload/index.d'

export class OverlayService {
  private mainWindow: BrowserWindow | null = null
  private audioWorkerWindow: BrowserWindow | null = null
  private settingsService: SettingsService
  private onStateChangeCallback?: (state: PerssuaState) => void

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
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: '#00000000',
      hasShadow: true,
      show: false, // Só exibe após setContentProtection
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })

    // Ativa proteção de conteúdo antes da exibição
    try {
      this.mainWindow.setContentProtection(true)
    } catch (err) {
      console.warn('[OverlayService] Falha ao configurar setContentProtection:', err)
      this.state.contentProtectionStatus = 'Proteção indisponível neste ambiente'
    }

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
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.audioWorkerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/audio-worker.html`)
    } else {
      this.audioWorkerWindow.loadFile(path.join(__dirname, '../renderer/audio-worker.html'))
    }

    return this.audioWorkerWindow
  }

  private setupDisplayMediaHandler(): void {
    // Intercepta getDisplayMedia para fornecer áudio loopback do sistema no Windows
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] })
        if (sources.length > 0) {
          callback({ video: sources[0], audio: 'loopback' })
          return
        }
      } catch (err) {
        console.error('[OverlayService] Erro ao obter fontes de tela para áudio loopback:', err)
      }
      callback({})
    })
  }

  public showPanel(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show()
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver')
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
      if (mode === 'query') {
        this.mainWindow.setIgnoreMouseEvents(true, { forward: true })
      } else {
        this.mainWindow.setIgnoreMouseEvents(false)
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
      this.audioWorkerWindow.webContents.send('perssua:audio-worker-command', { action: 'start' })
      this.updateState({ isAudioCapturing: true, isTranscribing: true })
    }
  }

  public stopAudioCaptureWorker(): void {
    if (this.audioWorkerWindow && !this.audioWorkerWindow.isDestroyed()) {
      this.audioWorkerWindow.webContents.send('perssua:audio-worker-command', { action: 'stop' })
      this.updateState({ isAudioCapturing: false, isTranscribing: false })
    }
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
