/**
 * AudioWorkletProcessor para processamento de áudio em tempo real:
 * - Downmix estéreo para mono
 * - Downsampling de taxas arbitrárias (48kHz, 44.1kHz) para 16kHz
 * - Conversão de Float32 [-1.0, 1.0] para Int16 Linear PCM
 * - Envio de blocos via transferable ArrayBuffer para a thread principal do worker
 */

export const PCM_WORKLET_NAME = 'pcm-recorder-processor'

export const getPcmWorkletCode = (): string => {
  return `
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceSampleRate = sampleRate;
    this.targetSampleRate = 16000;
    this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;
    this.resamplePhase = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    const numChannels = input.length;
    const inputLength = input[0].length;

    // 1. Downmix de canais para Mono
    const mono = new Float32Array(inputLength);
    if (numChannels === 1) {
      mono.set(input[0]);
    } else {
      const ch0 = input[0];
      const ch1 = input[1];
      for (let i = 0; i < inputLength; i++) {
        mono[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    }

    // 2. Resampling para 16.000 Hz e conversão para 16-bit PCM Linear
    if (Math.abs(this.sourceSampleRate - this.targetSampleRate) < 1) {
      const pcm16 = new Int16Array(inputLength);
      for (let i = 0; i < inputLength; i++) {
        const s = Math.max(-1, Math.min(1, mono[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    } else {
      let phase = this.resamplePhase;
      const ratio = this.resampleRatio;
      const maxCount = Math.ceil((inputLength - phase) / ratio) + 2;
      const tempPcm = new Int16Array(maxCount);
      let outCount = 0;

      while (phase < inputLength) {
        const index = Math.floor(phase);
        const frac = phase - index;
        const current = mono[index];
        const next = index + 1 < inputLength ? mono[index + 1] : current;
        const sample = current + frac * (next - current);

        const s = Math.max(-1, Math.min(1, sample));
        tempPcm[outCount++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        phase += ratio;
      }

      this.resamplePhase = phase - inputLength;

      if (outCount > 0) {
        const pcm16 = tempPcm.slice(0, outCount);
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      }
    }

    return true;
  }
}

registerProcessor('${PCM_WORKLET_NAME}', PcmRecorderProcessor);
`
}

export const createPcmWorkletBlobUrl = (): string => {
  const blob = new Blob([getPcmWorkletCode()], { type: 'application/javascript' })
  return URL.createObjectURL(blob)
}
