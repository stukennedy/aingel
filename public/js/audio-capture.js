/**
 * AudioCapture — mic capture, resample to 16kHz PCM mono, send binary over WebSocket.
 * Standalone ES module (no bundler needed).
 */
export class AudioCapture {
  constructor(ws, targetSampleRate = 16000) {
    this.ws = ws;
    this.targetSampleRate = targetSampleRate;
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.isCapturing = false;
  }

  async start() {
    if (this.isCapturing) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext();

    // Create worklet processor from inline code
    const processorCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        constructor(options) {
          super();
          this.inputSampleRate = options.processorOptions?.inputSampleRate || 48000;
          this.outputSampleRate = options.processorOptions?.outputSampleRate || 16000;
          this.resampleRatio = this.inputSampleRate / this.outputSampleRate;
          this.buffer = [];
          this.bufferSize = 2048;
        }
        process(inputs) {
          const input = inputs[0];
          if (!input || !input[0]) return true;
          const channelData = input[0];
          for (let i = 0; i < channelData.length; i++) {
            this.buffer.push(channelData[i]);
          }
          while (this.buffer.length >= this.bufferSize) {
            const chunk = this.buffer.splice(0, this.bufferSize);
            const resampled = this.resample(chunk);
            const pcm = this.float32ToPCM16(resampled);
            this.port.postMessage({ type: 'audio', buffer: pcm.buffer }, [pcm.buffer]);
          }
          return true;
        }
        resample(samples) {
          if (this.resampleRatio === 1) return samples;
          const outputLength = Math.floor(samples.length / this.resampleRatio);
          const output = new Float32Array(outputLength);
          for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * this.resampleRatio;
            const floor = Math.floor(srcIndex);
            const ceil = Math.min(floor + 1, samples.length - 1);
            const t = srcIndex - floor;
            output[i] = samples[floor] * (1 - t) + samples[ceil] * t;
          }
          return output;
        }
        float32ToPCM16(float32Array) {
          const pcm16 = new Int16Array(float32Array.length);
          for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          return pcm16;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    `;
    const blob = new Blob([processorCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    await this.audioContext.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor', {
      processorOptions: {
        inputSampleRate: this.audioContext.sampleRate,
        outputSampleRate: this.targetSampleRate,
      },
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'audio' && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(event.data.buffer);
      }
    };

    this.sourceNode.connect(this.workletNode);
    this.isCapturing = true;
    console.log(`[AudioCapture] Started at ${this.audioContext.sampleRate}Hz → ${this.targetSampleRate}Hz`);
  }

  stop() {
    if (this.workletNode) { this.workletNode.disconnect(); this.workletNode = null; }
    if (this.sourceNode) { this.sourceNode.disconnect(); this.sourceNode = null; }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    this.isCapturing = false;
    console.log('[AudioCapture] Stopped');
  }
}
