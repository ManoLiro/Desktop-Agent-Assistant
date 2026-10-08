import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScreenCaptureService } from '../src/main/services/ScreenCaptureService'
import type { OverlayService } from '../src/main/services/OverlayService'
import type { SettingsService } from '../src/main/services/SettingsService'
import { desktopCapturer, screen } from 'electron'

// Mock de Electron
vi.mock('electron', () => {
  return {
    desktopCapturer: {
      getSources: vi.fn()
    },
    screen: {
      getAllDisplays: vi.fn(),
      getPrimaryDisplay: vi.fn()
    }
  }
})

describe('ScreenCaptureService - Visão Computacional Sob Demanda', () => {
  let mockOverlayService: Partial<OverlayService>
  let mockSettingsService: Partial<SettingsService>
  let mockMainWindow: any
  let service: ScreenCaptureService

  beforeEach(() => {
    vi.clearAllMocks()

    mockMainWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      isVisible: vi.fn().mockReturnValue(true),
      getBounds: vi.fn().mockReturnValue({ x: 100, y: 100, width: 450, height: 600 }),
      hide: vi.fn(),
      show: vi.fn(),
      setAlwaysOnTop: vi.fn()
    }

    mockOverlayService = {
      getMainWindow: vi.fn().mockReturnValue(mockMainWindow),
      getState: vi.fn().mockReturnValue({ isPanelVisible: true } as any)
    }

    mockSettingsService = {
      getSettings: vi.fn().mockReturnValue({
        selectedMonitorId: '',
        geminiModel: 'models/gemini-3.8-flash'
      } as any)
    }

    const mockPrimaryDisplay = {
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1
    }

    vi.mocked(screen.getPrimaryDisplay).mockReturnValue(mockPrimaryDisplay as any)
    vi.mocked(screen.getAllDisplays).mockReturnValue([mockPrimaryDisplay] as any)

    service = new ScreenCaptureService(
      mockOverlayService as OverlayService,
      mockSettingsService as SettingsService
    )
  })

  it('deve ocultar a janela se estiver sobrepondo o monitor alvo e restaurar no bloco finally', async () => {
    const mockThumbnail = {
      isEmpty: vi.fn().mockReturnValue(false),
      getSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
      toJPEG: vi.fn().mockReturnValue(Buffer.from('fake-jpeg-data'))
    }

    vi.mocked(desktopCapturer.getSources).mockResolvedValueOnce([
      {
        id: 'screen:0:0',
        name: 'Screen 1',
        display_id: '1',
        thumbnail: mockThumbnail as any
      } as any
    ])

    const result = await service.captureScreen()

    // 1. Ocultou a janela porque x:100, y:100 sobrepõe o monitor de 1920x1080
    expect(mockMainWindow.hide).toHaveBeenCalledTimes(1)
    // 2. Chamou desktopCapturer com fontes de screen
    expect(desktopCapturer.getSources).toHaveBeenCalledWith(
      expect.objectContaining({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
    )
    // 3. Restaurou a janela no bloco finally
    expect(mockMainWindow.show).toHaveBeenCalledTimes(1)
    expect(mockMainWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')

    // 4. Retornou os dados em Base64 e JPEG
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.width).toBe(1920)
    expect(result.height).toBe(1080)
    expect(result.base64).toBe(Buffer.from('fake-jpeg-data').toString('base64'))
  })

  it('não deve ocultar a janela se estiver em outro monitor sem sobrepor o monitor alvo', async () => {
    // Janela posicionada no segundo monitor (x: 2000, y: 0)
    mockMainWindow.getBounds.mockReturnValue({ x: 2000, y: 0, width: 450, height: 600 })

    const mockThumbnail = {
      isEmpty: vi.fn().mockReturnValue(false),
      getSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
      toJPEG: vi.fn().mockReturnValue(Buffer.from('fake-jpeg-data'))
    }

    vi.mocked(desktopCapturer.getSources).mockResolvedValueOnce([
      {
        id: 'screen:0:0',
        name: 'Screen 1',
        display_id: '1',
        thumbnail: mockThumbnail as any
      } as any
    ])

    await service.captureScreen()

    // Como está em outro monitor, não deve piscar nem ocultar
    expect(mockMainWindow.hide).not.toHaveBeenCalled()
    expect(mockMainWindow.show).not.toHaveBeenCalled()
  })

  it('deve restaurar a janela no finally mesmo se desktopCapturer lançar erro', async () => {
    vi.mocked(desktopCapturer.getSources).mockRejectedValueOnce(
      new Error('Erro interno do subsistema de captura do SO')
    )

    await expect(service.captureScreen()).rejects.toThrow(
      'Erro interno do subsistema de captura do SO'
    )

    // Garante que o bloco finally restaurou a janela
    expect(mockMainWindow.show).toHaveBeenCalledTimes(1)
  })
})
