import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app, safeStorage } from 'electron'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SettingsService } from '../src/main/services/SettingsService'

vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn(),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

describe('SettingsService API key storage', () => {
  let directory: string
  let keyPath: string

  beforeEach(() => {
    vi.resetAllMocks()
    directory = mkdtempSync(join(tmpdir(), 'perssua-settings-test-'))
    keyPath = join(directory, 'perssua-key.enc')
    vi.mocked(app.getPath).mockReturnValue(directory)
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
  })

  afterEach(() => {
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file))
    rmdirSync(directory)
  })

  it('saves the encrypted bytes and reloads the key using safeStorage', () => {
    const encrypted = Buffer.from([0, 1, 2, 3])
    vi.mocked(safeStorage.encryptString).mockReturnValue(encrypted)
    vi.mocked(safeStorage.decryptString).mockReturnValue('fake-api-key')

    const service = new SettingsService()
    expect(service.saveApiKey(' fake-api-key ')).toBe(true)
    expect(safeStorage.encryptString).toHaveBeenCalledWith('fake-api-key')
    expect(readFileSync(keyPath)).toEqual(encrypted)
    expect(new SettingsService().getApiKey()).toBe('fake-api-key')
  })

  it('does not save a key when system encryption is unavailable', () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
    const service = new SettingsService()

    expect(service.saveApiKey('fake-api-key')).toBe(false)
    expect(service.hasApiKey()).toBe(false)
    expect(existsSync(keyPath)).toBe(false)
    expect(safeStorage.encryptString).not.toHaveBeenCalled()
  })

  it('keeps the existing key when a replacement cannot be encrypted', () => {
    const encrypted = Buffer.from([0, 1, 2, 3])
    vi.mocked(safeStorage.encryptString).mockReturnValue(encrypted)
    const service = new SettingsService()
    expect(service.saveApiKey('original-fake-key')).toBe(true)
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

    expect(service.saveApiKey('replacement-fake-key')).toBe(false)
    expect(service.getApiKey()).toBe('original-fake-key')
    expect(readFileSync(keyPath)).toEqual(encrypted)
  })

  it('migrates a legacy Base64 key to encrypted storage', () => {
    const encrypted = Buffer.from([0, 1, 2, 3])
    writeFileSync(keyPath, Buffer.from('legacy-fake-key').toString('base64'))
    vi.mocked(safeStorage.decryptString).mockImplementation(() => { throw new Error('not encrypted') })
    vi.mocked(safeStorage.encryptString).mockReturnValue(encrypted)

    const service = new SettingsService()
    expect(service.getApiKey()).toBe('legacy-fake-key')
    expect(safeStorage.encryptString).toHaveBeenCalledWith('legacy-fake-key')
    expect(readFileSync(keyPath)).toEqual(encrypted)
  })

  it('preserves a legacy file until encryption becomes available', () => {
    const legacy = Buffer.from('legacy-fake-key').toString('base64')
    writeFileSync(keyPath, legacy)
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)

    expect(new SettingsService().getApiKey()).toBeNull()
    expect(readFileSync(keyPath, 'utf-8')).toBe(legacy)
  })

  it('does not treat corrupt data as a legacy key', () => {
    const corrupt = Buffer.from([1, 2, 3]).toString('base64')
    writeFileSync(keyPath, corrupt)
    vi.mocked(safeStorage.decryptString).mockImplementation(() => { throw new Error('invalid data') })

    expect(new SettingsService().getApiKey()).toBeNull()
    expect(safeStorage.encryptString).not.toHaveBeenCalled()
    expect(readFileSync(keyPath, 'utf-8')).toBe(corrupt)
  })

  it('removes the saved key when cleared', () => {
    vi.mocked(safeStorage.encryptString).mockReturnValue(Buffer.from([0, 1, 2, 3]))
    const service = new SettingsService()
    expect(service.saveApiKey('fake-api-key')).toBe(true)

    expect(service.saveApiKey('')).toBe(true)
    expect(service.hasApiKey()).toBe(false)
    expect(existsSync(keyPath)).toBe(false)
  })
})
