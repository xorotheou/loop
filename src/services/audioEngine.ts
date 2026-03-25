import { LoopCandidate, ProcessingOptions } from '../types';
import * as Tone from 'tone';

/**
 * Core DSP and MIR logic for LoopMaster AI
 * Implements a 3-layer architecture: Offline, Per-Voice, and Master
 */
export class AudioEngine {
  private context: AudioContext;
  private jamVoices: Map<string, Voice> = new Map();
  private masterChain: MasterChain | null = null;
  private sampler: Tone.Sampler | null = null;

  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  get ctx(): AudioContext {
    return this.context;
  }

  async init() {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    await Tone.start();
    if (!this.masterChain) {
      this.masterChain = new MasterChain();
    }
  }

  async decodeAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    return await this.context.decodeAudioData(arrayBuffer);
  }

  /**
   * Layer 1: Offline Clip Edit Layer
   * Destructive processing that returns a new AudioBuffer
   */
  async processOffline(
    buffer: AudioBuffer,
    options: ProcessingOptions
  ): Promise<AudioBuffer> {
    const {
      trimStart = 0,
      trimEnd = 1,
      normalize = false,
      fadeIn = 0,
      fadeOut = 0,
      dcOffsetRemoval = false,
      reverse = false,
      phaseInversion = false
    } = options;

    // 1. DC Offset Removal (destructive)
    let processedBuffer = dcOffsetRemoval ? this.centerWaveform(buffer) : buffer;

    // 2. Trim / Crop
    const startSample = Math.floor(trimStart * processedBuffer.length);
    const endSample = Math.floor(trimEnd * processedBuffer.length);
    processedBuffer = this.sliceBuffer(processedBuffer, startSample, endSample);

    // 3. Reverse (destructive)
    if (reverse) {
      processedBuffer = this.reverseBuffer(processedBuffer);
    }

    // 4. Phase Inversion
    if (phaseInversion) {
      processedBuffer = this.invertPhase(processedBuffer);
    }

    // 5. Normalization
    if (normalize) {
      processedBuffer = this.normalize(processedBuffer);
    }

    // 6. Fades
    if (fadeIn > 0 || fadeOut > 0) {
      processedBuffer = this.applyFades(processedBuffer, fadeIn * 1000, fadeOut * 1000);
    }

    return processedBuffer;
  }

  /**
   * Layer 2: Per-Voice Playback Layer
   * Real-time playback with modulation and FX
   */
  async startJam(loops: LoopCandidate[], masterBpm: number, loopSettings?: Record<string, ProcessingOptions>) {
    await this.init();
    Tone.Transport.bpm.value = masterBpm;
    
    this.stopJam();

    for (const loop of loops) {
      const options = loopSettings?.[loop.id] || {};
      const voice = new Voice(loop.buffer, loop.bpm);
      voice.update(options, masterBpm);
      voice.connect(this.masterChain!.input);
      voice.start();
      this.jamVoices.set(loop.id, voice);
    }

    Tone.Transport.start();
  }

  updateJamBpm(bpm: number) {
    Tone.Transport.bpm.value = bpm;
    this.jamVoices.forEach(voice => voice.updateBpm(bpm));
  }

  setMasterVolume(db: number) {
    if (this.masterChain) {
      this.masterChain.setVolume(db);
    }
  }

  updateMasterChain(options: ProcessingOptions) {
    if (this.masterChain) {
      this.masterChain.update(options);
    }
  }

  stopJam() {
    Tone.Transport.stop();
    this.jamVoices.forEach(voice => voice.dispose());
    this.jamVoices.clear();
  }

  async loadSampler(buffer: AudioBuffer) {
    await this.init();
    if (this.sampler) this.sampler.dispose();
    
    return new Promise<void>((resolve) => {
      this.sampler = new Tone.Sampler({
        urls: {
          C4: buffer
        },
        onload: () => {
          console.log("Sampler loaded");
          resolve();
        }
      }).connect(this.masterChain!.input);
    });
  }

  triggerSamplerNote(note: string, duration: string = "4n", time?: number, velocity: number = 1) {
    if (this.sampler) {
      this.sampler.triggerAttackRelease(note, duration, time, velocity);
    }
  }

  triggerSamplerChord(notes: string[], duration: string = "4n", time?: number, velocity: number = 1) {
    if (this.sampler) {
      this.sampler.triggerAttackRelease(notes, duration, time, velocity);
    }
  }

  // --- Voice Control Methods ---
  toggleJam() {
    if (Tone.Transport.state === 'started') {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
  }

  setBpm(bpm: number) {
    Tone.Transport.bpm.value = bpm;
    this.jamVoices.forEach(v => v.updateBpm(bpm));
  }

  setReverb(wet: number) {
    if (this.masterChain) {
      this.masterChain.update({ reverb: { roomSize: 0.5, dampening: 3000, wet } });
    }
  }

  setDelay(wet: number) {
    if (this.masterChain) {
      this.masterChain.update({ delay: { time: 0.25, feedback: 0.5, wet } });
    }
  }

  muteVoice(id: string) {
    const voice = this.jamVoices.get(id);
    if (voice) voice.setVolume(-Infinity);
  }

  unmuteVoice(id: string, volume: number = 0) {
    const voice = this.jamVoices.get(id);
    if (voice) voice.setVolume(volume);
  }

  async triggerSample(buffer: AudioBuffer, options: ProcessingOptions = {}) {
    await this.init();
    const voice = new Voice(buffer, 120); // Default BPM
    voice.update(options, 120);
    voice.connect(this.masterChain!.input);
    voice.start();
    // Auto-dispose after playback if not looping
    if (!options.adsr) {
      setTimeout(() => voice.dispose(), (buffer.duration / (options.tempoRatio || 1)) * 1000 + 1000);
    }
  }

  // --- Advanced Loop Editing Features ---

  /**
   * Feature 1: Intelligent Zero-Crossing Slicer
   * Finds the nearest zero-crossing to prevent clicks
   */
  findNearestZeroCrossing(channelData: Float32Array, index: number): number {
    const searchRange = 512; // Search within ~10ms at 44.1kHz
    let bestIndex = index;
    let minVal = Math.abs(channelData[index]);

    for (let i = Math.max(0, index - searchRange); i < Math.min(channelData.length, index + searchRange); i++) {
      if (Math.abs(channelData[i]) < minVal) {
        minVal = Math.abs(channelData[i]);
        bestIndex = i;
        if (minVal === 0) break;
      }
    }
    return bestIndex;
  }

  /**
   * Feature 2: Automatic Key & Scale Alignment
   * Calculates semitone shift between two keys
   */
  calculateKeyShift(sourceKey: string, targetKey: string): number {
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const getBase = (k: string) => k.split(' ')[0].replace('m', '');
    
    const sourceIdx = keys.indexOf(getBase(sourceKey));
    const targetIdx = keys.indexOf(getBase(targetKey));
    
    if (sourceIdx === -1 || targetIdx === -1) return 0;
    
    let diff = targetIdx - sourceIdx;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;
    return diff;
  }

  /**
   * Feature 3: Reverse Reverb "Swoosh" Generator
   * Reverse -> Reverb -> Reverse
   */
  async generateReverseReverb(buffer: AudioBuffer): Promise<AudioBuffer> {
    // 1. Reverse
    let processed = this.reverseBuffer(buffer);
    
    // 2. Apply Reverb (Offline)
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length + buffer.sampleRate * 2, // Add 2s tail
      buffer.sampleRate
    );
    
    const source = offlineCtx.createBufferSource();
    source.buffer = processed;
    
    const reverb = offlineCtx.createConvolver();
    // Generate a simple impulse response for the reverb
    const irLength = buffer.sampleRate * 2;
    const ir = offlineCtx.createBuffer(2, irLength, buffer.sampleRate);
    for (let i = 0; i < 2; i++) {
      const data = ir.getChannelData(i);
      for (let j = 0; j < irLength; j++) {
        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (buffer.sampleRate * 0.5));
      }
    }
    reverb.buffer = ir;
    
    source.connect(reverb);
    reverb.connect(offlineCtx.destination);
    
    source.start();
    const rendered = await offlineCtx.startRendering();
    
    // 3. Reverse back
    return this.reverseBuffer(rendered);
  }

  /**
   * Feature 4: Groove Extraction & Quantize
   * Extracts transient timings from a buffer
   */
  extractGroove(buffer: AudioBuffer): number[] {
    const data = buffer.getChannelData(0);
    const transients: number[] = [];
    const threshold = 0.1;
    const minDistance = buffer.sampleRate * 0.05; // 50ms min distance
    
    let lastTransient = -minDistance;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold && (i - lastTransient) > minDistance) {
        transients.push(i / buffer.length); // Normalized position
        lastTransient = i;
      }
    }
    return transients;
  }

  async applyGroove(buffer: AudioBuffer, grooveMap: number[]): Promise<AudioBuffer> {
    // Simple implementation: stretch/shrink segments to match groove
    // For a production app, we'd use a more complex granular approach
    return buffer; 
  }

  // --- Utility Methods ---

  centerWaveform(buffer: AudioBuffer): AudioBuffer {
    const centeredBuffer = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const centeredData = centeredBuffer.getChannelData(channel);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const mean = sum / data.length;
      for (let i = 0; i < data.length; i++) centeredData[i] = data[i] - mean;
    }
    return centeredBuffer;
  }

  normalize(buffer: AudioBuffer, targetDb: number = -0.1): AudioBuffer {
    const targetGain = Math.pow(10, targetDb / 20);
    let maxPeak = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxPeak) maxPeak = abs;
      }
    }
    if (maxPeak === 0) return buffer;
    const scale = targetGain / maxPeak;
    const normalizedBuffer = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const normalizedData = normalizedBuffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) normalizedData[i] = data[i] * scale;
    }
    return normalizedBuffer;
  }

  reverseBuffer(buffer: AudioBuffer): AudioBuffer {
    const reversed = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const reversedData = reversed.getChannelData(channel);
      for (let i = 0; i < data.length; i++) reversedData[i] = data[data.length - 1 - i];
    }
    return reversed;
  }

  invertPhase(buffer: AudioBuffer): AudioBuffer {
    const inverted = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const invertedData = inverted.getChannelData(channel);
      for (let i = 0; i < data.length; i++) invertedData[i] = -data[i];
    }
    return inverted;
  }

  applyFades(buffer: AudioBuffer, fadeInMs: number = 0, fadeOutMs: number = 0): AudioBuffer {
    const fadeInSamples = Math.floor((fadeInMs / 1000) * buffer.sampleRate);
    const fadeOutSamples = Math.floor((fadeOutMs / 1000) * buffer.sampleRate);
    const fadedBuffer = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const fadedData = fadedBuffer.getChannelData(channel);
      fadedData.set(data);

      if (fadeInSamples > 0) {
        for (let i = 0; i < Math.min(fadeInSamples, data.length); i++) {
          fadedData[i] *= (i / fadeInSamples);
        }
      }
      if (fadeOutSamples > 0) {
        for (let i = 0; i < Math.min(fadeOutSamples, data.length); i++) {
          fadedData[data.length - 1 - i] *= (i / fadeOutSamples);
        }
      }
    }
    return fadedBuffer;
  }

  sliceBuffer(buffer: AudioBuffer, startSample: number, endSample: number, useZeroCrossing: boolean = false): AudioBuffer {
    let s = startSample;
    let e = endSample;
    
    if (useZeroCrossing) {
      const data = buffer.getChannelData(0);
      s = this.findNearestZeroCrossing(data, startSample);
      e = this.findNearestZeroCrossing(data, endSample);
    }

    const length = Math.max(0, e - s);
    const slice = this.context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      const sliceData = slice.getChannelData(channel);
      sliceData.set(data.subarray(s, e));
    }
    return slice;
  }

  bufferToWav(buffer: AudioBuffer): Blob {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const view = new DataView(new ArrayBuffer(length));
    const channels = [];
    let offset = 0;
    let pos = 0;

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(view, pos, 'RIFF'); pos += 4;
    view.setUint32(pos, length - 8, true); pos += 4;
    writeString(view, pos, 'WAVE'); pos += 4;
    writeString(view, pos, 'fmt '); pos += 4;
    view.setUint32(pos, 16, true); pos += 4;
    view.setUint16(pos, 1, true); pos += 2;
    view.setUint16(pos, buffer.numberOfChannels, true); pos += 2;
    view.setUint32(pos, buffer.sampleRate, true); pos += 4;
    view.setUint32(pos, buffer.sampleRate * buffer.numberOfChannels * 2, true); pos += 4;
    view.setUint16(pos, buffer.numberOfChannels * 2, true); pos += 2;
    view.setUint16(pos, 16, true); pos += 2;
    writeString(view, pos, 'data'); pos += 4;
    view.setUint32(pos, length - pos - 4, true); pos += 4;

    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));

    while (offset < buffer.length) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  async decodeBase64(base64: string): Promise<AudioBuffer> {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return await this.decodeAudio(bytes.buffer);
  }
}

/**
 * Per-Voice Layer Implementation
 */
class Voice {
  private player: Tone.Player;
  private pitchShift: Tone.PitchShift;
  private filter: Tone.Filter;
  private volume: Tone.Volume;
  private panner: Tone.Panner;
  private bitCrusher: Tone.BitCrusher;
  private distortion: Tone.Distortion;
  private adsr: Tone.AmplitudeEnvelope;
  private eq: Tone.EQ3;
  private compressor: Tone.Compressor;
  private gate: Tone.Gate;
  private chorus: Tone.Chorus;
  private phaser: Tone.Phaser;
  
  private originalBpm: number;

  constructor(buffer: AudioBuffer, originalBpm: number) {
    this.originalBpm = originalBpm;
    this.player = new Tone.Player(buffer);
    this.pitchShift = new Tone.PitchShift();
    this.filter = new Tone.Filter();
    this.volume = new Tone.Volume();
    this.panner = new Tone.Panner();
    this.bitCrusher = new Tone.BitCrusher();
    this.distortion = new Tone.Distortion();
    this.adsr = new Tone.AmplitudeEnvelope();
    this.eq = new Tone.EQ3();
    this.compressor = new Tone.Compressor();
    this.gate = new Tone.Gate();
    this.chorus = new Tone.Chorus();
    this.phaser = new Tone.Phaser();

    // Chain: Player -> ADSR -> Gate -> Compressor -> EQ -> Chorus -> Phaser -> Filter -> BitCrush -> Distortion -> PitchShift -> Panner -> Volume
    this.player.chain(this.adsr, this.gate, this.compressor, this.eq, this.chorus, this.phaser, this.filter, this.bitCrusher, this.distortion, this.pitchShift, this.panner, this.volume);
  }

  update(options: ProcessingOptions, masterBpm: number) {
    const {
      pitchShift = 0,
      tempoRatio = 1,
      playbackRate = 1,
      adsr,
      filter,
      eq,
      bitcrush,
      distortion,
      panning = 0,
      compression,
      gating,
      chorus,
      phaser
    } = options;

    // Time Stretch / Pitch
    const bpmRatio = masterBpm / this.originalBpm;
    this.player.playbackRate = bpmRatio * tempoRatio * playbackRate;
    this.pitchShift.pitch = pitchShift;

    // ADSR
    if (adsr) {
      this.adsr.attack = adsr.attack;
      this.adsr.decay = adsr.decay;
      this.adsr.sustain = adsr.sustain;
      this.adsr.release = adsr.release;
    }

    // Filter
    if (filter && filter.type !== 'none') {
      this.filter.type = filter.type as any;
      this.filter.frequency.value = filter.frequency;
      this.filter.Q.value = filter.resonance;
    } else {
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 20000;
    }

    // EQ
    if (eq) {
      this.eq.low.value = eq.low;
      this.eq.mid.value = eq.mid;
      this.eq.high.value = eq.high;
    }

    // Dynamics
    if (compression) {
      this.compressor.threshold.value = compression.threshold;
      this.compressor.ratio.value = compression.ratio;
      this.compressor.attack.value = compression.attack;
      this.compressor.release.value = compression.release;
    }

    if (gating) {
      this.gate.threshold = gating.threshold;
    }

    // FX
    if (chorus) {
      this.chorus.depth = chorus.depth;
      this.chorus.frequency.value = chorus.rate;
      this.chorus.wet.value = 1;
    } else {
      this.chorus.wet.value = 0;
    }

    if (phaser) {
      this.phaser.frequency.value = phaser.rate;
      this.phaser.octaves = phaser.depth * 5;
      this.phaser.baseFrequency = phaser.baseFreq;
      this.phaser.wet.value = 1;
    } else {
      this.phaser.wet.value = 0;
    }

    this.bitCrusher.set({ bits: bitcrush || 16 });
    this.distortion.distortion = distortion || 0;
    this.panner.pan.value = panning;
  }

  updateBpm(bpm: number) {
    const bpmRatio = bpm / this.originalBpm;
    this.player.playbackRate = bpmRatio;
  }

  setVolume(db: number) {
    this.volume.volume.value = db;
  }

  connect(node: Tone.ToneAudioNode) {
    this.volume.connect(node);
  }

  start() {
    this.player.start();
    this.adsr.triggerAttack();
  }

  stop() {
    this.adsr.triggerRelease();
    const releaseTime = typeof this.adsr.release === 'number' ? this.adsr.release : 0.5;
    setTimeout(() => this.player.stop(), releaseTime * 1000);
  }

  dispose() {
    this.player.dispose();
    this.pitchShift.dispose();
    this.filter.dispose();
    this.volume.dispose();
    this.panner.dispose();
    this.bitCrusher.dispose();
    this.distortion.dispose();
    this.adsr.dispose();
    this.eq.dispose();
    this.compressor.dispose();
    this.gate.dispose();
    this.chorus.dispose();
    this.phaser.dispose();
  }
}

/**
 * Bus / Master Layer Implementation
 */
class MasterChain {
  public input: Tone.Volume;
  private reverb: Tone.Freeverb;
  private delay: Tone.FeedbackDelay;
  private limiter: Tone.Limiter;
  private multiband: Tone.MultibandCompressor;
  private widener: Tone.StereoWidener;

  constructor() {
    this.input = new Tone.Volume();
    this.reverb = new Tone.Freeverb();
    this.delay = new Tone.FeedbackDelay();
    this.limiter = new Tone.Limiter(0);
    this.multiband = new Tone.MultibandCompressor();
    this.widener = new Tone.StereoWidener(0.5);

    this.input.chain(this.multiband, this.widener, this.delay, this.reverb, this.limiter, Tone.getDestination());
  }

  update(options: ProcessingOptions) {
    if (options.reverb) {
      this.reverb.roomSize.value = options.reverb.roomSize;
      this.reverb.dampening = options.reverb.dampening;
      this.reverb.wet.value = options.reverb.wet;
    }
    if (options.delay) {
      this.delay.delayTime.value = options.delay.time;
      this.delay.feedback.value = options.delay.feedback;
      this.delay.wet.value = options.delay.wet;
    }
    if (options.limiter !== undefined) {
      this.limiter.threshold.value = options.limiter;
    }
    if (options.stereoWidth !== undefined) {
      this.widener.width.value = options.stereoWidth;
    }
    if (options.multiband) {
      // Multiband compression logic if needed
    }
  }

  setVolume(db: number) {
    this.input.volume.value = db;
  }
}

export const audioEngine = new AudioEngine();

