import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import type { SettingsService } from './SettingsService'
import type { OverlayService } from './OverlayService'
import type { TranscriptSegment } from '../../preload/index.d'

export class TranscriptionService {
  private settingsService: SettingsService
  private overlayService: OverlayService
  private serverProcess: ChildProcess | null = null
  private serverPort = 8089
  private isProcessing = false
  private audioQueue: Array<{ samples: Int16Array; timestamp: number }> = []
  private recentSegments: TranscriptSegment[] = []
  private lastTranscribedText = ''

  constructor(settingsService: SettingsService, overlayService: OverlayService) {
    this.settingsService = settingsService
    this.overlayService = overlayService
  }

  public getSegments(): TranscriptSegment[] {
    return [...this.recentSegments]
  }

  public clearSegments(): void {
    this.recentSegments = []
    this.lastTranscribedText = ''
    this.audioQueue = []
  }

  public async startWhisperServer(): Promise<boolean> {
    const settings = this.settingsService.getSettings()
    const binPath = settings.whisperBinaryPath
    const modelPath = settings.whisperModelPath

    if (!binPath || !fs.existsSync(binPath)) {
      console.warn('[TranscriptionService] Binário whisper-server não configurado ou inexistente:', binPath)
      this.overlayService.updateState({ whisperServerStatus: 'stopped' })
      return false
    }

    if (!modelPath || !fs.existsSync(modelPath)) {
      console.warn('[TranscriptionService] Modelo whisper não configurado ou inexistente:', modelPath)
      this.overlayService.updateState({ whisperServerStatus: 'stopped' })
      return false
    }

    if (this.serverProcess) {
      return true
    }

    this.overlayService.updateState({ whisperServerStatus: 'starting' })

    try {
      const args = [
        '-m', modelPath,
        '--port', String(this.serverPort),
        '--host', '127.0.0.1',
        '-l', settings.transcriptionLanguage || 'auto'
      ]

      this.serverProcess = spawn(binPath, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.serverProcess.stdout?.on('data', (data) => {
        const out = data.toString()
        if (out.includes('Listening') || out.includes('HTTP server listening')) {
          this.overlayService.updateState({ whisperServerStatus: 'running' })
        }
      })

      this.serverProcess.stderr?.on('data', (data) => {
        console.log(`[whisper-server stderr]: ${data.toString().trim()}`)
      })

      this.serverProcess.on('exit', (code) => {
        console.log(`[whisper-server] Processo encerrado com código ${code}`)
        this.serverProcess = null
        this.overlayService.updateState({ whisperServerStatus: 'stopped' })
      })

      this.serverProcess.on('error', (err) => {
        console.error('[TranscriptionService] Erro ao iniciar processo:', err)
        this.serverProcess = null
        this.overlayService.updateState({ whisperServerStatus: 'error' })
      })

      // Aguarda 1 segundo e checa status
      await new Promise((r) => setTimeout(r, 1000))
      if (this.serverProcess) {
        this.overlayService.updateState({ whisperServerStatus: 'running' })
        return true
      }
      return false
    } catch (err) {
      console.error('[TranscriptionService] Falha ao iniciar whisper-server:', err)
      this.overlayService.updateState({ whisperServerStatus: 'error' })
      return false
    }
  }

  public stopWhisperServer(): void {
    if (this.serverProcess) {
      try {
        this.serverProcess.kill('SIGTERM')
      } catch {}
      this.serverProcess = null
    }
    this.overlayService.updateState({ whisperServerStatus: 'stopped' })
  }

  public handleAudioChunk(samples: Int16Array, _sampleRate: number): void {
    // 1. VAD / Verificação de energia simples (evita processar silêncio)
    if (this.isSilent(samples)) {
      return
    }

    // 2. Limite da fila (backpressure para evitar acúmulo de memória)
    if (this.audioQueue.length >= 3) {
      // Remove o bloco mais antigo se houver sobrecarga
      this.audioQueue.shift()
    }

    this.audioQueue.push({ samples, timestamp: Date.now() })
    this.processQueue()
  }

  private isSilent(samples: Int16Array, threshold = 150): boolean {
    let sum = 0
    const step = 8 // Amostragem rápida
    for (let i = 0; i < samples.length; i += step) {
      sum += Math.abs(samples[i])
    }
    const avg = sum / (samples.length / step)
    return avg < threshold
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.audioQueue.length === 0) {
      return
    }

    const state = this.overlayService.getState()
    if (!state.isAssistantActive || !state.isAudioCapturing) {
      this.audioQueue = []
      return
    }

    this.isProcessing = true
    const item = this.audioQueue.shift()!

    try {
      const wavBuffer = this.encodeWav(item.samples, 16000)
      const rawText = await this.sendToWhisperServer(wavBuffer)
      const cleanText = rawText.trim()

      if (cleanText && cleanText.length > 1) {
        const deduplicated = this.deduplicateOverlap(this.lastTranscribedText, cleanText)
        if (deduplicated) {
          const segment: TranscriptSegment = {
            id: `seg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            timestamp: item.timestamp,
            source: 'Áudio do sistema',
            text: deduplicated,
            isFinal: true
          }

          this.recentSegments.push(segment)
          // Limite de retenção em memória (últimos 150 segmentos)
          if (this.recentSegments.length > 150) {
            this.recentSegments.shift()
          }

          this.lastTranscribedText = `${this.lastTranscribedText} ${deduplicated}`.slice(-300)

          const win = this.overlayService.getMainWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send('perssua:transcript-segment', segment)
          }
        }
      }
    } catch (err) {
      console.error('[TranscriptionService] Erro ao inferir áudio no whisper:', err)
    } finally {
      this.isProcessing = false
      if (this.audioQueue.length > 0) {
        setImmediate(() => this.processQueue())
      }
    }
  }

  private sendToWhisperServer(wavBuffer: Buffer): Promise<string> {
    return new Promise((resolve) => {
      const boundary = `----PerssuaBoundary${Date.now()}`
      const postDataParts: Buffer[] = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
        wavBuffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0.0\r\n--${boundary}--\r\n`)
      ]
      const postData = Buffer.concat(postDataParts)

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: this.serverPort,
          path: '/inference',
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': postData.length
          },
          timeout: 4000
        },
        (res) => {
          let body = ''
          res.on('data', (d) => (body += d))
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body)
              resolve(parsed.text || '')
            } catch {
              resolve(body)
            }
          })
        }
      )

      req.on('error', () => {
        // Silencioso se o servidor não estiver rodando
        resolve('')
      })

      req.on('timeout', () => {
        req.destroy()
        resolve('')
      })

      req.write(postData)
      req.end()
    })
  }

  public deduplicateOverlap(previousText: string, newText: string): string {
    const prevWords = previousText.trim().split(/\s+/).filter(Boolean)
    const newWords = newText.trim().split(/\s+/).filter(Boolean)

    if (prevWords.length === 0 || newWords.length === 0) {
      return newText
    }

    const maxCheck = Math.min(8, prevWords.length, newWords.length)
    for (let len = maxCheck; len >= 2; len--) {
      const prevTail = prevWords.slice(-len).join(' ').toLowerCase()
      const newHead = newWords.slice(0, len).join(' ').toLowerCase()
      if (prevTail === newHead) {
        return newWords.slice(len).join(' ')
      }
    }

    return newText
  }

  private encodeWav(samples: Int16Array, sampleRate: number): Buffer {
    const buffer = Buffer.alloc(44 + samples.length * 2)
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + samples.length * 2, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(1, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(sampleRate * 2, 28)
    buffer.writeUInt16LE(2, 32)
    buffer.writeUInt16LE(16, 34)
    buffer.write('data', 36)
    buffer.writeUInt32LE(samples.length * 2, 40)

    for (let i = 0; i < samples.length; i++) {
      buffer.writeInt16LE(samples[i], 44 + i * 2)
    }

    return buffer
  }
}
