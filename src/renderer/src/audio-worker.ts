let currentStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let processorNode: ScriptProcessorNode | null = null
let sampleBuffer: number[] = []

const TARGET_SAMPLE_RATE = 16000
const CHUNK_SIZE_SAMPLES = TARGET_SAMPLE_RATE * 2 // 2 segundos de áudio a 16kHz

async function startLoopbackCapture(): Promise<void> {
  if (currentStream) {
    return
  }

  try {
    // Solicita captura de mídia com áudio do sistema (loopback interceptado no main process)
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: 1,
        height: 1,
        frameRate: 1
      },
      audio: true
    })

    currentStream = stream
    const audioTrack = stream.getAudioTracks()[0]

    if (!audioTrack) {
      console.warn('[AudioWorker] Nenhuma track de áudio encontrada no stream.')
      stopLoopbackCapture()
      return
    }

    // AudioContext já configurado para resampling a 16kHz pelo pipeline nativo do Chromium
    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    const sourceNode = audioContext.createMediaStreamSource(stream)

    // Buffer de 4096 samples por callback
    processorNode = audioContext.createScriptProcessor(4096, 1, 1)

    processorNode.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0)
      for (let i = 0; i < inputData.length; i++) {
        sampleBuffer.push(inputData[i])
      }

      // Quando atinge ~2 segundos de áudio (32000 samples a 16kHz), envia chunk
      if (sampleBuffer.length >= CHUNK_SIZE_SAMPLES) {
        const pcm16 = new Int16Array(sampleBuffer.length)
        for (let i = 0; i < sampleBuffer.length; i++) {
          const s = Math.max(-1, Math.min(1, sampleBuffer[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }

        // Envia buffer para o processo Main via IPC
        window.perssua.sendAudioChunk(pcm16.buffer, TARGET_SAMPLE_RATE)
        // Mantém 0.5s de sobreposição (8000 samples) para o próximo chunk
        sampleBuffer = sampleBuffer.slice(CHUNK_SIZE_SAMPLES - TARGET_SAMPLE_RATE * 0.5)
      }
    }

    sourceNode.connect(processorNode)
    // Conecta a destination mudo para manter o pipeline fluindo sem tocar nos alto-falantes
    const muteGain = audioContext.createGain()
    muteGain.gain.value = 0
    processorNode.connect(muteGain)
    muteGain.connect(audioContext.destination)

    audioTrack.onended = () => {
      stopLoopbackCapture()
    }
  } catch (err) {
    console.error('[AudioWorker] Erro ao iniciar captura de loopback:', err)
    stopLoopbackCapture()
  }
}

function stopLoopbackCapture(): void {
  if (processorNode) {
    try {
      processorNode.disconnect()
    } catch {}
    processorNode = null
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
}

// Escuta comandos vindos do Main process
if (window.perssua) {
  window.perssua.onAudioWorkerCommand((cmd) => {
    if (cmd.action === 'start') {
      startLoopbackCapture()
    } else if (cmd.action === 'stop') {
      stopLoopbackCapture()
    }
  })
}
