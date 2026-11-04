import { app, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
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
      try {
        if (fs.existsSync(this.keyFilePath)) {
          fs.unlinkSync(this.keyFilePath)
        }
        this.cachedApiKey = null
        return true
      } catch (err) {
        console.error('[SettingsService] Erro ao remover API key:', err)
        return false
      }
    }

    try {
      if (!safeStorage.isEncryptionAvailable()) return false

      this.writeEncryptedApiKey(trimmed)
      this.cachedApiKey = trimmed
      return true
    } catch (err) {
      console.error('[SettingsService] Erro ao salvar chave com criptografia segura:', err)
      return false
    }
  }

  private writeEncryptedApiKey(key: string): void {
    const encrypted = safeStorage.encryptString(key)
    const tempPath = `${this.keyFilePath}.${randomUUID()}.tmp`
    try {
      fs.writeFileSync(tempPath, encrypted, { flag: 'wx', mode: 0o600 })
      fs.renameSync(tempPath, this.keyFilePath)
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      } catch {}
    }
  }

  private readApiKeyFromDisk(): string | null {
    try {
      if (!fs.existsSync(this.keyFilePath) || !safeStorage.isEncryptionAvailable()) return null

      const buffer = fs.readFileSync(this.keyFilePath)
      try {
        return safeStorage.decryptString(buffer)
      } catch {
        // Migrate keys written in Base64 by older versions only after validating the format.
        const encoded = buffer.toString('utf-8')
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
          return null
        }
        const decoded = Buffer.from(encoded, 'base64')
        const legacyKey = decoded.toString('utf-8')
        if (decoded.toString('base64') !== encoded || !/^[\x21-\x7e]+$/.test(legacyKey)) {
          return null
        }
        this.writeEncryptedApiKey(legacyKey)
        return legacyKey
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
