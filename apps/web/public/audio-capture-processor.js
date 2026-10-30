class TFTIQAudioCaptureProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (output) output.fill(0);
    if (input) {
      const samples = input.slice();
      this.port.postMessage(samples.buffer, [samples.buffer]);
    }
    return true;
  }
}

registerProcessor('tftiq-audio-capture', TFTIQAudioCaptureProcessor);
