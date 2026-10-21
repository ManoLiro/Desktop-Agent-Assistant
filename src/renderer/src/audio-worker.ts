import { createPcmWorkletBlobUrl, PCM_WORKLET_NAME } from './audio/pcmWorklet'

let currentStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let workletNode: AudioWorkletNode | null = null
let workletBlobUrl: string | null = null
let sampleBuffer: number[] = []

const TARGET_SAMPLE_RATE = 16000
const CHUNK_DURATION_SEC = 3.0 // 3 segundos de áudio por inferência
const OVERLAP_DURATION_SEC = 0.75 // 0.75 segundo de sobreposição entre blocos
const CHUNK_SIZE_SAMPLES = Math.round(TARGET_SAMPLE_RATE * CHUNK_DURATION_SEC) // 48.000 samples
const OVERLAP_SAMPLES = Math.round(TARGET_SAMPLE_RATE * OVERLAP_DURATION_SEC) // 12.000 samples

async function startLoopbackCapture(): Promise<void> {
  console.log('[AudioWorker] startLoopbackCapture chamado')
  if (currentStream) {
    console.log('[AudioWorker] Captura já ativa, ignorando start duplicado')
    return
  }

  try {
    let stream: MediaStream | null = null
    // Tentativa 1: getDisplayMedia com systemAudio: 'include'
    try {
      console.log('[AudioWorker] Tentando getDisplayMedia com systemAudio: include...')
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          systemAudio: 'include'
        } as any
      })
      console.log('[AudioWorker] getDisplayMedia com systemAudio obteve stream com sucesso!')
    } catch (err1: any) {
      console.warn('[AudioWorker] Tentativa 1 (systemAudio) falhou:', err1?.name, err1?.message)
    }

    // Tentativa 2: getDisplayMedia com audio: true padrão
    if (!stream) {
      try {
        console.log('[AudioWorker] Tentando getDisplayMedia com audio: true padrão...')
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        })
        console.log('[AudioWorker] getDisplayMedia padrão obteve stream com sucesso!')
      } catch (err2: any) {
        console.warn('[AudioWorker] Tentativa 2 (getDisplayMedia padrão) falhou:', err2?.name, err2?.message)
      }
    }

    // Tentativa 3: fallback para entrada de áudio / microfone do sistema
    if (!stream) {
      try {
        console.log('[AudioWorker] Tentando fallback para dispositivo de áudio/microfone do sistema...')
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        })
        console.log('[AudioWorker] Fallback para áudio/microfone obteve stream com sucesso!')
      } catch (err3: any) {
        console.error('[AudioWorker] Todas as tentativas de captura falharam:', err3?.name, err3?.message)
      }
    }

    if (!stream) {
      console.warn('[AudioWorker] Nenhum stream de áudio pôde ser obtido.')
      stopLoopbackCapture()
      return
    }

    currentStream = stream
    const audioTrack = stream.getAudioTracks()[0]

    if (!audioTrack) {
      console.warn('[AudioWorker] Nenhuma track de áudio encontrada no stream.')
      stopLoopbackCapture()
      return
    }

    console.log('[AudioWorker] Trilha de áudio ativa:', audioTrack.label, 'status:', audioTrack.readyState)

    // Inicializa AudioContext; o AudioWorklet cuidará do downsampling para 16kHz
    try {
      audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
      console.log('[AudioWorker] AudioContext criado a 16kHz:', audioContext.sampleRate)
    } catch (e) {
      console.warn('[AudioWorker] Falha ao criar AudioContext com 16kHz explícito, usando padrão:', e)
      audioContext = new AudioContext()
      console.log('[AudioWorker] AudioContext padrão criado:', audioContext.sampleRate)
    }

    // Carrega o módulo do AudioWorklet via Blob URL
    workletBlobUrl = createPcmWorkletBlobUrl()
    console.log('[AudioWorker] Registrando módulo AudioWorklet...')
    await audioContext.audioWorklet.addModule(workletBlobUrl)
    console.log('[AudioWorker] Módulo AudioWorklet registrado com sucesso')

    const sourceNode = audioContext.createMediaStreamSource(stream)
    workletNode = new AudioWorkletNode(audioContext, PCM_WORKLET_NAME)

    let chunkCount = 0
    // Recebe blocos Int16Array já em 16kHz Mono da thread de áudio
    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const incoming = new Int16Array(event.data)
      for (let i = 0; i < incoming.length; i++) {
        sampleBuffer.push(incoming[i])
      }

      // Quando atinge 3 segundos de áudio (48000 samples a 16kHz), envia chunk via IPC
      if (sampleBuffer.length >= CHUNK_SIZE_SAMPLES) {
        chunkCount++
        const pcm16 = new Int16Array(sampleBuffer.slice(0, CHUNK_SIZE_SAMPLES))
        console.log(`[AudioWorker] Enviando chunk de áudio #${chunkCount} (${pcm16.length} samples a 16kHz)`)

        // Envia buffer para o processo Main via IPC
        window.perssua?.sendAudioChunk(pcm16.buffer, TARGET_SAMPLE_RATE)

        // Mantém 0.75s de sobreposição (12000 samples) para o próximo bloco
        sampleBuffer = sampleBuffer.slice(CHUNK_SIZE_SAMPLES - OVERLAP_SAMPLES)
      }
    }

    sourceNode.connect(workletNode)

    // Conecta a destination mudo para manter o pipeline fluindo sem tocar nos alto-falantes
    const muteGain = audioContext.createGain()
    muteGain.gain.value = 0
    workletNode.connect(muteGain)
    muteGain.connect(audioContext.destination)
    console.log('[AudioWorker] Gravação de loopback iniciada com sucesso!')

    audioTrack.onended = () => {
      console.log('[AudioWorker] Trilha de áudio finalizada.')
      stopLoopbackCapture()
    }
  } catch (err: any) {
    console.error('[AudioWorker] Erro ao iniciar captura de loopback:', err?.name, '-', err?.message, err)
    stopLoopbackCapture()
  }
}

function stopLoopbackCapture(): void {
  console.log('[AudioWorker] Parando captura de loopback...')
  if (workletNode) {
    try {
      workletNode.port.onmessage = null
      workletNode.disconnect()
    } catch {}
    workletNode = null
  }

  if (workletBlobUrl) {
    try {
      URL.revokeObjectURL(workletBlobUrl)
    } catch {}
    workletBlobUrl = null
  }

  if (audioContext) {
    try {
      audioContext.close()
    } catch {}
    audioContext = null
  }

  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop())
    currentStream = null
  }

  sampleBuffer = []
  console.log('[AudioWorker] Captura de loopback parada com sucesso')
}

// Escuta comandos vindos do Main process
if (window.perssua) {
  window.perssua.onAudioWorkerCommand((cmd) => {
    console.log('[AudioWorker] Comando recebido do processo Main:', cmd)
    if (cmd.action === 'start') {
      startLoopbackCapture()
    } else if (cmd.action === 'stop') {
      stopLoopbackCapture()
    }
  })
}

