import { Tray, Menu, app, nativeImage } from 'electron'
import * as path from 'path'
import { appLifecycle } from '../lifecycle'
import type { OverlayService } from './OverlayService'
import type { PerssuaState } from '../../preload/index.d'

export class TrayService {
  private tray: Tray | null = null
  private overlayService: OverlayService

  constructor(overlayService: OverlayService) {
    this.overlayService = overlayService
  }

  public init(): void {
    const iconPath = path.join(__dirname, '../../resources/icon.png')
    let icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      // Cria imagem 16x16 padrão se arquivo não estiver disponível
      icon = nativeImage.createFromBuffer(
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
      )
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('Perssua — Assistente Contextual')

    this.tray.on('click', () => {
      this.overlayService.togglePanelVisibility()
    })

    this.updateMenu(this.overlayService.getState())
  }

  public updateMenu(state: PerssuaState): void {
    if (!this.tray) return

    const assistantLabel = state.isAssistantActive ? 'Assistente: Ativo' : 'Assistente: Desativado'
    const audioLabel = state.isAudioCapturing ? 'Áudio: Capturando' : 'Áudio: Pausado'
    const visibilityLabel = state.isPanelVisible ? 'Ocultar Painel' : 'Mostrar Painel'

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Perssua MVP', enabled: false },
      { type: 'separator' },
      { label: `● ${assistantLabel}`, enabled: false },
      { label: `● ${audioLabel}`, enabled: false },
      { label: `● ${state.contentProtectionStatus}`, enabled: false },
      { type: 'separator' },
      {
        label: visibilityLabel,
        click: () => this.overlayService.togglePanelVisibility()
      },
      {
        label: state.isAssistantActive ? 'Desativar Assistente' : 'Ativar Assistente',
        click: () => this.overlayService.toggleAssistantActive()
      },
      {
        label: state.isAudioCapturing ? 'Pausar Transcrição' : 'Iniciar Transcrição',
        click: () => this.overlayService.toggleTranscription()
      },
      { type: 'separator' },
      {
        label: 'Sair do Perssua',
        click: () => {
          appLifecycle.isQuitting = true
          app.quit()
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}
