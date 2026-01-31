/**
 * Audio capture module for microphone input
 * Captures audio from the microphone, resamples to 16kHz mono PCM,
 * and sends binary chunks over WebSocket to the voice agent.
 */

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private ws: WebSocket;
  private isCapturing = false;
  private targetSampleRate: number;

  // Default sample rate (Deepgram uses 16kHz, Gradium uses 24kHz)
  private static readonly DEFAULT_SAMPLE_RATE = 16000;

  constructor(ws: WebSocket, targetSampleRate?: number) {
    this.ws = ws;
    this.targetSampleRate = targetSampleRate || AudioCapture.DEFAULT_SAMPLE_RATE;
  }

  async start(deviceId?: string): Promise<void> {
    if (this.isCapturing) return;

    try {
      // Request microphone access
      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Create audio context at native sample rate (we'll resample in the worklet)
      this.audioContext = new AudioContext();

      // Register the audio worklet processor
      await this.audioContext.audioWorklet.addModule(this.createWorkletProcessorURL());

      // Create source from microphone
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create worklet node for processing
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor', {
        processorOptions: {
          inputSampleRate: this.audioContext.sampleRate,
          outputSampleRate: this.targetSampleRate,
        },
      });

      // Handle processed audio data
      this.workletNode.port.onmessage = (event: MessageEvent) => {
        if (event.data.type === 'audio' && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(event.data.buffer);
        }
      };

      // Connect the audio graph
      this.sourceNode.connect(this.workletNode);
      // Don't connect to destination - we don't want to play back the mic

      this.isCapturing = true;
      console.log(`[AudioCapture] Started capturing at ${this.audioContext.sampleRate}Hz, resampling to ${this.targetSampleRate}Hz`);
    } catch (error) {
      console.error('[AudioCapture] Failed to start:', error);
      this.stop();
      throw error;
    }
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isCapturing = false;
    console.log('[AudioCapture] Stopped');
  }

  /**
   * Creates a blob URL for the AudioWorklet processor code.
   * This approach avoids needing a separate file for the worklet.
   */
  private createWorkletProcessorURL(): string {
    const processorCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        constructor(options) {
          super();
          this.inputSampleRate = options.processorOptions?.inputSampleRate || 48000;
          this.outputSampleRate = options.processorOptions?.outputSampleRate || 16000;
          this.resampleRatio = this.inputSampleRate / this.outputSampleRate;
          this.buffer = [];
          this.bufferSize = 2048; // Process in chunks
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (!input || !input[0]) return true;

          const channelData = input[0]; // Mono - just use first channel

          // Add samples to buffer
          for (let i = 0; i < channelData.length; i++) {
            this.buffer.push(channelData[i]);
          }

          // Process when we have enough samples
          while (this.buffer.length >= this.bufferSize) {
            const chunk = this.buffer.splice(0, this.bufferSize);
            const resampled = this.resample(chunk);
            const pcm = this.float32ToPCM16(resampled);

            this.port.postMessage({
              type: 'audio',
              buffer: pcm.buffer
            }, [pcm.buffer]);
          }

          return true;
        }

        resample(samples) {
          if (this.resampleRatio === 1) return samples;

          const outputLength = Math.floor(samples.length / this.resampleRatio);
          const output = new Float32Array(outputLength);

          for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * this.resampleRatio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
            const t = srcIndex - srcIndexFloor;

            // Linear interpolation
            output[i] = samples[srcIndexFloor] * (1 - t) + samples[srcIndexCeil] * t;
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
    return URL.createObjectURL(blob);
  }
}
