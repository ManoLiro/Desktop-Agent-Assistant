import { desktopCapturer } from 'electron'
import type { OverlayService } from './OverlayService'
import type { SettingsService } from './SettingsService'

export interface ScreenCaptureResult {
  base64: string
  mimeType: string
  width: number
  height: number
}

export class ScreenCaptureService {
  private overlayService: OverlayService
  private settingsService: SettingsService

  constructor(overlayService: OverlayService, settingsService: SettingsService) {
    this.overlayService = overlayService
    this.settingsService = settingsService
  }

  public async captureScreen(): Promise<ScreenCaptureResult> {
    const mainWindow = this.overlayService.getMainWindow()
    const wasVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()

    try {
      // 1. Oculta temporariamente a janela do Perssua para não cobrir a tela na captura
      if (wasVisible) {
        mainWindow.hide()
        // Aguarda recomposição da janela no Windows (DWM)
        await new Promise((resolve) => setTimeout(resolve, 150))
      }

      // 2. Obtém fontes de tela
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
        fetchWindowIcons: false
      })

      if (!sources || sources.length === 0) {
        throw new Error('Nenhum monitor detectado para captura.')
      }

      const settings = this.settingsService.getSettings()
      let chosenSource = sources[0]

      if (settings.selectedMonitorId) {
        const found = sources.find((s) => s.id === settings.selectedMonitorId)
        if (found) {
          chosenSource = found
        }
      }

      const thumbnail = chosenSource.thumbnail
      if (!thumbnail || thumbnail.isEmpty()) {
        throw new Error('Captura de tela retornou imagem vazia.')
      }

      // 3. Converte para JPEG com compressão adequada para legibilidade de código
      const jpegBuffer = thumbnail.toJPEG(85)
      const base64 = jpegBuffer.toString('base64')
      const size = thumbnail.getSize()

      return {
        base64,
        mimeType: 'image/jpeg',
        width: size.width,
        height: size.height
      }
    } finally {
      // 4. Restaura a visibilidade da janela caso o assistente ainda deva estar visível
      if (wasVisible && mainWindow && !mainWindow.isDestroyed()) {
        const state = this.overlayService.getState()
        if (state.isPanelVisible) {
          mainWindow.show()
        }
      }
    }
  }

  public async getAvailableScreens(): Promise<Array<{ id: string; name: string }>> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 160, height: 90 }
    })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  }
}
