import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AppSettings } from '../../preload/index.d'

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  toggleAssistant: 'CommandOrControl+Alt+Space',
  togglePanel: 'CommandOrControl+Alt+O',
  focusChat: 'CommandOrControl+Alt+Return',
  captureScreen: 'CommandOrControl+Alt+S',
  suggestAnswer: 'CommandOrControl+Alt+R',
  summarize: 'CommandOrControl+Alt+M',
  toggleTranscription: 'CommandOrControl+Alt+T',
  openNotes: 'CommandOrControl+Alt+N',
  panicStop: 'CommandOrControl+Alt+Backspace'
}

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
}

export class SettingsService {
  private settingsFilePath: string
  private notesFilePath: string
  private keyFilePath: string
  private settings: AppSettings
  private windowBounds: WindowBounds
  private cachedApiKey: string | null = null

  constructor() {
    const userData = app.getPath('userData')
    this.settingsFilePath = path.join(userData, 'perssua-settings.json')
    this.notesFilePath = path.join(userData, 'perssua-notes.json')
    this.keyFilePath = path.join(userData, 'perssua-key.enc')

    this.settings = this.loadSettings()
    this.windowBounds = this.loadBounds()
    this.cachedApiKey = this.readApiKeyFromDisk()
  }

  private loadSettings(): AppSettings {
    const defaultSettings: AppSettings = {
      geminiModel: 'models/gemini-3.8-flash',
      responseLanguage: 'pt-BR',
      transcriptionLanguage: 'pt',
      whisperBinaryPath: '',
      whisperModelPath: '',
      selectedMonitorId: '',
      autoAssistEnabled: false,
      autoAssistIntervalSeconds: 30,
      includeNotesInContext: true,
      screenShareProtection: true,
      shortcuts: { ...DEFAULT_SHORTCUTS }
    }

    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const raw = fs.readFileSync(this.settingsFilePath, 'utf-8')
        const parsed = JSON.parse(raw)
        return {
          ...defaultSettings,
          ...parsed,
          shortcuts: {
            ...defaultSettings.shortcuts,
            ...(parsed.shortcuts || {})
          }
        }
      }
    } catch (err) {
      console.error('[SettingsService] Erro ao ler configurações, usando padrão:', err)
    }

    return defaultSettings
  }

  public getSettings(): AppSettings {
    return { ...this.settings }
  }

  public saveSettings(newSettings: Partial<AppSettings>): void {
    this.settings = {
      ...this.settings,
      ...newSettings,
      shortcuts: {
        ...this.settings.shortcuts,
        ...(newSettings.shortcuts || {})
      }
    }

    try {
      fs.writeFileSync(this.settingsFilePath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      console.error('[SettingsService] Falha ao salvar configurações:', err)
      throw err
    }
  }

  public getNotes(): string {
    try {
      if (fs.existsSync(this.notesFilePath)) {
        return fs.readFileSync(this.notesFilePath, 'utf-8')
      }
    } catch (err) {
      console.error('[SettingsService] Erro ao ler notas:', err)
    }
    return '# Roteiro / Anotações do Perssua\n\n- Adicione pontos-chave da sua reunião ou entrevista aqui.\n'
  }

  public saveNotes(notes: string): void {
    try {
      fs.writeFileSync(this.notesFilePath, notes, 'utf-8')
    } catch (err) {
      console.error('[SettingsService] Falha ao salvar notas:', err)
    }
  }

  public hasApiKey(): boolean {
    return !!(this.cachedApiKey && this.cachedApiKey.trim().length > 0)
  }

  public getApiKey(): string | null {
    return this.cachedApiKey
  }

  public saveApiKey(key: string): boolean {
    const trimmed = key.trim()
    if (!trimmed) {
      this.cachedApiKey = null
      if (fs.existsSync(this.keyFilePath)) {
        try {
          fs.unlinkSync(this.keyFilePath)
        } catch {}
      }
      return true
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(trimmed)
        fs.writeFileSync(this.keyFilePath, encrypted)
      } else {
        // Fallback se safeStorage não estiver disponível no ambiente
        const encoded = Buffer.from(trimmed).toString('base64')
        fs.writeFileSync(this.keyFilePath, Buffer.from(encoded, 'utf-8'))
      }
      this.cachedApiKey = trimmed
      return true
    } catch (err) {
      console.error('[SettingsService] Erro ao salvar chave com criptografia segura:', err)
      return false
    }
  }

  private readApiKeyFromDisk(): string | null {
    try {
      if (fs.existsSync(this.keyFilePath)) {
        const buffer = fs.readFileSync(this.keyFilePath)
        if (safeStorage.isEncryptionAvailable()) {
          try {
            return safeStorage.decryptString(buffer)
          } catch {
            // Em caso de chave pré-criptografada em base64 simples fallback
            return Buffer.from(buffer.toString('utf-8'), 'base64').toString('utf-8')
          }
        } else {
          return Buffer.from(buffer.toString('utf-8'), 'base64').toString('utf-8')
        }
      }
    } catch (err) {
      console.error('[SettingsService] Erro ao descriptografar API key:', err)
    }
    return null
  }

  public getBounds(): WindowBounds {
    return this.windowBounds
  }

  public saveBounds(bounds: WindowBounds): void {
    this.windowBounds = bounds
    const boundsFile = path.join(app.getPath('userData'), 'perssua-bounds.json')
    try {
      fs.writeFileSync(boundsFile, JSON.stringify(bounds, null, 2), 'utf-8')
    } catch (err) {
      console.error('[SettingsService] Erro ao salvar bounds:', err)
    }
  }

  private loadBounds(): WindowBounds {
    const defaultBounds: WindowBounds = { width: 440, height: 640 }
    const boundsFile = path.join(app.getPath('userData'), 'perssua-bounds.json')
    try {
      if (fs.existsSync(boundsFile)) {
        return JSON.parse(fs.readFileSync(boundsFile, 'utf-8'))
      }
    } catch {}
    return defaultBounds
  }
}
