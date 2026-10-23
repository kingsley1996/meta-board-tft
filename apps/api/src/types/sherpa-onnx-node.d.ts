declare module 'sherpa-onnx-node' {
  type Waveform = { sampleRate: number; samples: Float32Array };

  type OfflineStream = {
    acceptWaveform(waveform: Waveform): void;
  };

  type OfflineRecognizerConfig = {
    featConfig: { sampleRate: number; featureDim: number };
    modelConfig: {
      transducer: { encoder: string; decoder: string; joiner: string };
      tokens: string;
      numThreads: number;
      provider: string;
      debug: number;
    };
  };

  export class OfflineRecognizer {
    static createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>;
    createStream(): OfflineStream;
    decodeAsync(stream: OfflineStream): Promise<{ text: string }>;
  }

  const sherpaOnnx: { OfflineRecognizer: typeof OfflineRecognizer };
  export default sherpaOnnx;
}
