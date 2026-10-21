import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import * as os from 'os'
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
  private nextSequenceNumber = 1

  constructor(settingsService: SettingsService, overlayService: OverlayService) {
    this.settingsService = settingsService
    this.overlayService = overlayService
  }

  public getSegments(): TranscriptSegment[] {
    return [...this.recentSegments]
  }

  public getLatestSequenceNumber(): number {
    return this.nextSequenceNumber - 1
  }

  public resetSequence(): void {
    this.nextSequenceNumber = 1
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
      const threads = Math.max(1, Math.min(8, os.cpus()?.length || 4))
      const args = [
        '-m', modelPath,
        '--port', String(this.serverPort),
        '--host', '127.0.0.1',
        '-l', settings.transcriptionLanguage || 'auto',
        '-t', String(threads),
        '--convert'
      ]

      console.log(`[TranscriptionService] Iniciando whisper-server na porta ${this.serverPort}:`, binPath, args.join(' '))

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
        const errStr = data.toString().trim()
        if (errStr) {
          console.log(`[whisper-server stderr]: ${errStr}`)
        }
      })

      this.serverProcess.on('exit', (code) => {
        console.log(`[whisper-server] Processo encerrado com código ${code}`)
        this.serverProcess = null
        this.overlayService.updateState({ whisperServerStatus: 'stopped' })
      })

      this.serverProcess.on('error', (err) => {
        console.error('[TranscriptionService] Erro no processo whisper-server:', err)
        this.serverProcess = null
        this.overlayService.updateState({ whisperServerStatus: 'error' })
      })

      // Healthcheck ativo: realiza sondagem HTTP na porta 8089 para confirmar disponibilidade
      const isReady = await this.waitForServerReady(this.serverPort, 12000)
      if (isReady && this.serverProcess) {
        console.log('[TranscriptionService] whisper-server pronto e respondendo a conexões HTTP.')
        this.overlayService.updateState({ whisperServerStatus: 'running' })
        return true
      }

      if (this.serverProcess) {
        // Se ainda estiver vivo após timeout, assume running mas avisa
        this.overlayService.updateState({ whisperServerStatus: 'running' })
        return true
      }

      this.overlayService.updateState({ whisperServerStatus: 'error' })
      return false
    } catch (err) {
      console.error('[TranscriptionService] Falha ao iniciar whisper-server:', err)
      this.overlayService.updateState({ whisperServerStatus: 'error' })
      return false
    }
  }

  private waitForServerReady(port: number, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now()
    return new Promise((resolve) => {
      const check = () => {
        if (!this.serverProcess) {
          resolve(false)
          return
        }

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/',
            method: 'GET',
            timeout: 500
          },
          () => {
            resolve(true)
          }
        )

        req.on('error', () => {
          if (Date.now() - startTime >= timeoutMs) {
            resolve(false)
          } else {
            setTimeout(check, 300)
          }
        })

        req.on('timeout', () => {
          req.destroy()
          if (Date.now() - startTime >= timeoutMs) {
            resolve(false)
          } else {
            setTimeout(check, 300)
          }
        })

        req.end()
      }

      check()
    })
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
    const rms = this.calculateRms(samples)
    const silent = this.isSilent(samples, 25)
    console.log(`[TranscriptionService] Chunk recebido: ${samples.length} samples (16kHz), RMS: ${rms.toFixed(1)}, Silencioso: ${silent}`)

    // 1. VAD / Verificação de energia RMS (evita inferir blocos de silêncio puro)
    if (silent) {
      return
    }

    // 2. Limite da fila (backpressure para evitar acúmulo de memória caso a inferência atrase)
    if (this.audioQueue.length >= 3) {
      console.warn('[TranscriptionService] Fila cheia (>=3), descartando bloco mais antigo')
      this.audioQueue.shift()
    }

    this.audioQueue.push({ samples, timestamp: Date.now() })
    this.processQueue()
  }

  public calculateRms(samples: Int16Array): number {
    if (samples.length === 0) return 0
    let sumSq = 0
    const step = 4 // Amostragem eficiente
    let count = 0
    for (let i = 0; i < samples.length; i += step) {
      const val = samples[i]
      sumSq += val * val
      count++
    }
    return Math.sqrt(sumSq / count)
  }

  public isSilent(samples: Int16Array, threshold = 25): boolean {
    const rms = this.calculateRms(samples)
    return rms < threshold
  }

  public cleanWhisperOutput(rawText: string): string {
    if (!rawText) return ''
    let text = rawText
      .replace(/\[(?:BLANK_AUDIO|silêncio|silence|música|music|ruído|aplausos|risos)\]/gi, '')
      .replace(/\((?:silêncio|silence|música|music|ruído|inaudível)\)/gi, '')
      .trim()

    // Descarta se sobrou apenas caracteres de pontuação ou espaços vazios
    if (/^[.,!?;:\-–—\s]*$/.test(text)) {
      return ''
    }
    return text
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.audioQueue.length === 0) {
      return
    }

    const state = this.overlayService.getState()
    if (!state.isAudioCapturing) {
      console.log('[TranscriptionService] isAudioCapturing é false, descartando fila pendente')
      this.audioQueue = []
      return
    }

    this.isProcessing = true
    const item = this.audioQueue.shift()!

    try {
      const wavBuffer = this.encodeWav(item.samples, 16000)
      console.log(`[TranscriptionService] Enviando WAV de ${wavBuffer.length} bytes para whisper-server...`)
      const rawText = await this.sendToWhisperServer(wavBuffer)
      console.log(`[TranscriptionService] Resposta bruta do whisper: "${rawText}"`)
      const cleaned = this.cleanWhisperOutput(rawText)
      console.log(`[TranscriptionService] Texto pós-filtro: "${cleaned}"`)

      if (cleaned && cleaned.length > 1) {
        const deduplicated = this.deduplicateOverlap(this.lastTranscribedText, cleaned)
        console.log(`[TranscriptionService] Texto deduplicado: "${deduplicated}"`)
        if (deduplicated && deduplicated.length > 0) {
          const segment: TranscriptSegment = {
            id: `seg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            sequenceNumber: this.nextSequenceNumber++,
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
            console.log(`[TranscriptionService] Disparando perssua:transcript-segment para janela: "${segment.text}"`)
            win.webContents.send('perssua:transcript-segment', segment)
          } else {
            console.warn('[TranscriptionService] Janela principal indisponível para enviar segmento!')
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
      const settings = this.settingsService.getSettings()
      const lang = settings.transcriptionLanguage || 'auto'

      const postDataParts: Buffer[] = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
        wavBuffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="temperature"\r\n\r\n0.0`),
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson`),
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${lang}\r\n--${boundary}--\r\n`)
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
          timeout: 4500
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
        // Silencioso se o servidor não estiver respondendo
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
    const prevRawWords = previousText.trim().split(/\s+/).filter(Boolean)
    const newRawWords = newText.trim().split(/\s+/).filter(Boolean)

    if (prevRawWords.length === 0 || newRawWords.length === 0) {
      return newText.trim()
    }

    const normalize = (w: string): string => w.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, '')

    const prevNorm = prevRawWords.map(normalize)
    const newNorm = newRawWords.map(normalize)

    const maxCheck = Math.min(10, prevNorm.length, newNorm.length)
    for (let len = maxCheck; len >= 2; len--) {
      const prevTail = prevNorm.slice(-len).join(' ')
      const newHead = newNorm.slice(0, len).join(' ')
      if (prevTail && newHead && prevTail === newHead) {
        return newRawWords.slice(len).join(' ')
      }
    }

    return newText.trim()
  }

  public encodeWav(samples: Int16Array, sampleRate = 16000): Buffer {
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

