import { describe, it, expect, vi } from 'vitest'
import { TranscriptionService } from '../src/main/services/TranscriptionService'

describe('TranscriptionService - VAD, WAV Encoding e Processamento de Áudio', () => {
  const mockSettingsService: any = {
    getSettings: vi.fn().mockReturnValue({
      whisperBinaryPath: '',
      whisperModelPath: '',
      transcriptionLanguage: 'pt'
    })
  }

  const mockOverlayService: any = {
    getState: vi.fn().mockReturnValue({
      isAssistantActive: true,
      isAudioCapturing: true
    }),
    updateState: vi.fn(),
    getMainWindow: vi.fn().mockReturnValue(null)
  }

  const service = new TranscriptionService(mockSettingsService, mockOverlayService)

  it('detecta silêncio digital com RMS zero ou muito baixo', () => {
    // Buffer de 16000 samples (1 segundo) todo zerado
    const silentSamples = new Int16Array(16000)
    expect(service.calculateRms(silentSamples)).toBe(0)
    expect(service.isSilent(silentSamples, 25)).toBe(true)

    // Buffer com ruído residual mínimo (amplitude < 5)
    const lowNoise = new Int16Array(16000)
    for (let i = 0; i < lowNoise.length; i++) {
      lowNoise[i] = (i % 6) - 3
    }
    expect(service.calculateRms(lowNoise)).toBeLessThan(10)
    expect(service.isSilent(lowNoise, 25)).toBe(true)
  })

  it('identifica fala ou sinal de áudio real acima do limiar RMS', () => {
    // Buffer simulando voz/onda senoidal com amplitude 2000
    const voiceSamples = new Int16Array(16000)
    for (let i = 0; i < voiceSamples.length; i++) {
      voiceSamples[i] = Math.round(Math.sin((i / 16000) * 2 * Math.PI * 440) * 2000)
    }

    const rms = service.calculateRms(voiceSamples)
    expect(rms).toBeGreaterThan(1000)
    expect(service.isSilent(voiceSamples, 25)).toBe(false)
  })

  it('filtra tags de ruído e alucinações comuns do Whisper', () => {
    expect(service.cleanWhisperOutput('[BLANK_AUDIO]')).toBe('')
    expect(service.cleanWhisperOutput(' [silêncio] ')).toBe('')
    expect(service.cleanWhisperOutput('(música) [ruído]')).toBe('')
    expect(service.cleanWhisperOutput('[BLANK_AUDIO] Olá mundo')).toBe('Olá mundo')
    expect(service.cleanWhisperOutput('Tudo bem por aqui? [silêncio]')).toBe('Tudo bem por aqui?')
    expect(service.cleanWhisperOutput('... ,,, ---')).toBe('')
  })

  it('gera cabeçalho WAV válido (RIFF/WAVE 16kHz Mono 16-bit PCM)', () => {
    const samples = new Int16Array(16000) // 1 segundo
    const wavBuffer = service.encodeWav(samples, 16000)

    // Cabeçalho RIFF tem 44 bytes + tamanho dos dados
    expect(wavBuffer.length).toBe(44 + samples.length * 2)

    // Assinaturas do cabeçalho
    expect(wavBuffer.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wavBuffer.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wavBuffer.toString('ascii', 12, 16)).toBe('fmt ')

    // Subchunk1 size (16 para PCM)
    expect(wavBuffer.readUInt32LE(16)).toBe(16)
    // AudioFormat (1 para PCM linear)
    expect(wavBuffer.readUInt16LE(20)).toBe(1)
    // NumChannels (1 para mono)
    expect(wavBuffer.readUInt16LE(22)).toBe(1)
    // SampleRate (16000)
    expect(wavBuffer.readUInt32LE(24)).toBe(16000)
    // ByteRate (16000 * 1 * 2 = 32000)
    expect(wavBuffer.readUInt32LE(28)).toBe(32000)
    // BlockAlign (2)
    expect(wavBuffer.readUInt16LE(32)).toBe(2)
    // BitsPerSample (16)
    expect(wavBuffer.readUInt16LE(34)).toBe(16)
    // Subchunk2ID ('data')
    expect(wavBuffer.toString('ascii', 36, 40)).toBe('data')
    // Subchunk2Size (16000 * 2 = 32000)
    expect(wavBuffer.readUInt32LE(40)).toBe(32000)
  })

  it('deduplica overlap com precisão usando o método nativo da classe', () => {
    const prev = 'iniciando a gravação do sistema,'
    const next = 'Gravação do sistema e validação do áudio.'
    const result = service.deduplicateOverlap(prev, next)
    expect(result).toBe('e validação do áudio.')
  })
})
