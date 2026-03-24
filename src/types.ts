export interface LoopCandidate {
  id: string;
  startTime: number; // in seconds
  duration: number; // in seconds
  bpm: number;
  key: string;
  rhythmicDensity: number;
  grooveConsistency: number;
  hcdfStability: number;
  score: number;
  buffer: AudioBuffer;
  stemId?: string;
  label?: string;
  tags?: string[];
  // New DSP Metadata
  contentType?: string;
  seamWaveformScore?: number;
  clickRisk?: number;
  beatAlignmentScore?: number;
  barAlignedScore?: number;
  overallConfidence?: number;
  recommendedCrossfadeMs?: number;
  // AI Adjudication
  aiClassification?: string;
  aiDecision?: "accept" | "reject" | "review";
  aiReasoning?: string[];
  aiConfidence?: number;
  needsReview?: boolean;
}

export interface ProcessingOptions {
  // Offline Layer
  trimStart?: number; // 0-1
  trimEnd?: number; // 0-1
  normalize?: boolean;
  fadeIn?: number; // seconds
  fadeOut?: number; // seconds
  dcOffsetRemoval?: boolean;
  reverse?: boolean;
  
  // Pitch / Time Engine
  pitchShift?: number; // semitones
  transpose?: number; // semitones
  cents?: number; // cents
  tempoRatio?: number; // time stretch
  playbackRate?: number; // simple resampling
  formantShift?: number;

  // Modulation Engine
  adsr?: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  lfoPitch?: { freq: number; depth: number };
  lfoAmp?: { freq: number; depth: number };
  lfoFilter?: { freq: number; depth: number };

  // Voice Dynamics / Filter / FX
  compression?: { threshold: number; ratio: number; attack: number; release: number };
  limiting?: { threshold: number; release: number };
  limiter?: number; // simple threshold for master
  gating?: { threshold: number; release: number };
  filter?: {
    type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'comb' | 'none';
    frequency: number;
    resonance: number;
    drive: number;
  };
  eq?: {
    low: number;
    mid: number;
    high: number;
  };
  chorus?: { depth: number; rate: number; delay: number };
  flanger?: { depth: number; rate: number; feedback: number };
  phaser?: { depth: number; rate: number; baseFreq: number };
  distortion?: number; // 0-1
  bitcrush?: number; // 1-16
  sampleRateReduction?: number; // 0-1
  panning?: number; // -1 to 1
  phaseInversion?: boolean;
  volume?: number; // dB
  loop?: boolean;

  // Bus / Master Processing (Shared)
  reverb?: { roomSize: number; dampening: number; wet: number };
  delay?: { time: number; feedback: number; wet: number };
  stereoWidth?: number; // 0-2
  transientShaping?: { attack: number; sustain: number };
  multiband?: { low: number; mid: number; high: number };
}

export interface Preset {
  id: string;
  name: string;
  options: ProcessingOptions;
  category: 'stem' | 'loop' | 'master';
  createdAt: number;
}

export interface Stem {
  id: string;
  name: string;
  buffer: AudioBuffer;
  bpm: number;
  key: string;
  blob?: Blob;
}

export interface ProcessingProgress {
  status: string;
  progress: number;
}
