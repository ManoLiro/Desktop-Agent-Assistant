import { desktopCapturer, screen } from 'electron'
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
    const settings = this.settingsService.getSettings()

    // 1. Identifica o monitor alvo e calcula bounds
    const allDisplays = screen.getAllDisplays()
    let targetDisplay = screen.getPrimaryDisplay()

    if (settings.selectedMonitorId) {
      const found = allDisplays.find((d) => String(d.id) === settings.selectedMonitorId)
      if (found) {
        targetDisplay = found
      }
    }

    // 2. Fluxo inteligente: verifica se a janela do Perssua está visível E sobrepõe o monitor alvo
    let shouldHideAndRestore = false
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      const winBounds = mainWindow.getBounds()
      const dBounds = targetDisplay.bounds

      const overlapsTarget =
        winBounds.x < dBounds.x + dBounds.width &&
        winBounds.x + winBounds.width > dBounds.x &&
        winBounds.y < dBounds.y + dBounds.height &&
        winBounds.y + winBounds.height > dBounds.y

      if (overlapsTarget) {
        shouldHideAndRestore = true
      }
    }

    try {
      // 3. Oculta temporariamente apenas se a janela estiver no monitor alvo
      if (shouldHideAndRestore && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide()
        // Aguarda recomposição da janela pelo Desktop Window Manager (DWM) do Windows (100–150ms)
        await new Promise((resolve) => setTimeout(resolve, 150))
      }

      // 4. Resolução adequada com alta fidelidade para código e OCR
      const scale = targetDisplay.scaleFactor || 1
      const rawWidth = Math.round(targetDisplay.bounds.width * scale)
      const rawHeight = Math.round(targetDisplay.bounds.height * scale)

      const MAX_DIM = 2560
      let targetWidth = rawWidth
      let targetHeight = rawHeight

      if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
        if (targetWidth >= targetHeight) {
          targetHeight = Math.round((targetHeight * MAX_DIM) / targetWidth)
          targetWidth = MAX_DIM
        } else {
          targetWidth = Math.round((targetWidth * MAX_DIM) / targetHeight)
          targetHeight = MAX_DIM
        }
      }

      // 5. Captura fontes via desktopCapturer
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: targetWidth, height: targetHeight },
        fetchWindowIcons: false
      })

      if (!sources || sources.length === 0) {
        throw new Error('Nenhum monitor detectado para captura.')
      }

      let chosenSource = sources[0]
      if (settings.selectedMonitorId) {
        const found = sources.find(
          (s) => s.id === settings.selectedMonitorId || s.display_id === settings.selectedMonitorId
        )
        if (found) {
          chosenSource = found
        }
      } else {
        const primarySource = sources.find((s) => s.display_id === String(targetDisplay.id))
        if (primarySource) {
          chosenSource = primarySource
        }
      }

      const thumbnail = chosenSource.thumbnail
      if (!thumbnail || thumbnail.isEmpty()) {
        throw new Error('Captura de tela retornou imagem vazia.')
      }

      // 6. Converte para JPEG com compressão balanceada para nitidez de texto de código
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
      // 7. Restaura a janela no bloco finally se foi ocultada
      if (shouldHideAndRestore && mainWindow && !mainWindow.isDestroyed()) {
        const state = this.overlayService.getState()
        if (state.isPanelVisible) {
          mainWindow.show()
          mainWindow.setAlwaysOnTop(true, 'screen-saver')
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
