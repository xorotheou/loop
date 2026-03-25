import React, { useState, useEffect, useRef } from 'react';
import { LoopCandidate, ProcessingOptions } from '../types';
import { WaveformView } from './WaveformView';
import { 
  X, Play, Pause, Square, Save, Download, Wand2, 
  Music, Clock, Activity, Scissors, Volume2, Filter,
  RotateCcw, Sparkles, Layers, Search, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { audioEngine } from '../services/audioEngine';

interface LoopEditorProps {
  loop: LoopCandidate;
  projectKey: string;
  onClose: () => void;
  onSave: (updatedLoop: LoopCandidate) => void;
}

export const LoopEditor: React.FC<LoopEditorProps> = ({ loop, projectKey, onClose, onSave }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [offset, setOffset] = useState(0);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer>(loop.buffer);
  const [isProcessing, setIsProcessing] = useState(false);

  // Processing States
  const [pitchShift, setPitchShift] = useState(0);
  const [targetBpm, setTargetBpm] = useState(loop.bpm);
  const [trim, setTrim] = useState({ start: 0, end: 100 });
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [saturation, setSaturation] = useState(0);
  const [bitcrush, setBitcrush] = useState(16);

  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const handlePlay = () => {
    if (isPlaying) return;
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = processedBuffer;
    source.loop = true;
    source.connect(ctx.destination);
    const startOffset = offset % processedBuffer.duration;
    source.start(0, startOffset);
    startTimeRef.current = ctx.currentTime;
    audioSourceRef.current = source;
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setOffset(0);
    setIsPlaying(false);
  };

  const applyProcessing = async () => {
    setIsProcessing(true);
    handleStop();
    
    const options: ProcessingOptions = {
      pitchShift,
      tempoRatio: targetBpm / loop.bpm,
      trimStart: trim.start / 100,
      trimEnd: trim.end / 100,
      normalize: isNormalizing,
      bitcrush,
      distortion: saturation,
      reverse
    };

    const buffer = await audioEngine.processOffline(loop.buffer, options);
    setProcessedBuffer(buffer);
    setIsProcessing(false);
  };

  const handleMatchKey = () => {
    if (loop.key) {
      const shift = audioEngine.calculateKeyShift(loop.key, projectKey);
      setPitchShift(shift);
    }
  };

  const handleGenSwoosh = async () => {
    setIsProcessing(true);
    const swoosh = await audioEngine.generateReverseReverb(processedBuffer);
    setProcessedBuffer(swoosh);
    setIsProcessing(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 lg:p-12"
    >
      <div className="w-full max-w-6xl bg-white rounded-[48px] shadow-2xl overflow-hidden flex flex-col h-full max-h-[90vh]">
        {/* Header */}
        <div className="px-10 py-8 border-bottom border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-600/20">
              <Wand2 size={32} />
            </div>
            <div>
              <h2 className="text-3xl font-serif italic text-slate-900">Advanced Loop Editor</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Editing:</span>
                <span className="text-sm font-bold text-slate-600">{loop.label || `Loop ${loop.id.slice(0, 8)}`}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all shadow-sm"
          >
            <X size={24} />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left: Waveform & Playback */}
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-slate-900 rounded-[40px] p-8 border border-slate-800 shadow-2xl relative overflow-hidden group">
              <div className="h-64 relative">
                <WaveformView 
                  buffer={processedBuffer}
                  bpm={targetBpm}
                  trim={trim}
                  onTrimChange={setTrim}
                  className="opacity-80 group-hover:opacity-100 transition-opacity"
                />
              </div>
              
              {/* Playback Controls */}
              <div className="flex justify-center gap-4 mt-8">
                <button 
                  onClick={handlePlay}
                  disabled={isPlaying}
                  className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-all",
                    isPlaying ? "bg-blue-600 text-white shadow-xl shadow-blue-600/30" : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  <Play size={24} fill="currentColor" className="ml-1" />
                </button>
                <button 
                  onClick={() => setIsPlaying(false)}
                  className="w-16 h-16 rounded-2xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all"
                >
                  <Pause size={24} fill="currentColor" />
                </button>
                <button 
                  onClick={handleStop}
                  className="w-16 h-16 rounded-2xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all"
                >
                  <Square size={24} fill="currentColor" />
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <Clock size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Duration</span>
                </div>
                <div className="text-2xl font-mono text-slate-700">{processedBuffer.duration.toFixed(2)}s</div>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <Activity size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Tempo</span>
                </div>
                <div className="text-2xl font-mono text-slate-700">{targetBpm} <span className="text-xs text-slate-400">BPM</span></div>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <div className="flex items-center gap-2 text-slate-400 mb-2">
                  <Music size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Key</span>
                </div>
                <div className="text-2xl font-mono text-slate-700">{loop.key || 'Unknown'}</div>
              </div>
            </div>
          </div>

          {/* Right: Editing Tools */}
          <div className="lg:col-span-5 space-y-8">
            <div className="space-y-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Processing Tools</h3>
              
              {/* Pitch & BPM */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pitch Shift ({pitchShift})</label>
                  <input 
                    type="range" min="-12" max="12" step="1" value={pitchShift}
                    onChange={(e) => setPitchShift(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target BPM</label>
                  <input 
                    type="number" value={targetBpm}
                    onChange={(e) => setTargetBpm(parseInt(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:border-blue-500/50 outline-none"
                  />
                </div>
              </div>

              {/* Effects */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Saturation</label>
                  <input 
                    type="range" min="0" max="1" step="0.01" value={saturation}
                    onChange={(e) => setSaturation(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Bitcrush</label>
                  <input 
                    type="range" min="4" max="16" step="1" value={bitcrush}
                    onChange={(e) => setBitcrush(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
              </div>

              {/* Advanced One-Clicks */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Advanced AI Tools</h3>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={handleMatchKey}
                    className="flex items-center justify-center gap-3 py-4 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
                  >
                    <Music size={16} /> MATCH PROJECT KEY
                  </button>
                  <button 
                    onClick={handleGenSwoosh}
                    disabled={isProcessing}
                    className="flex items-center justify-center gap-3 py-4 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
                  >
                    <Sparkles size={16} /> GENERATE SWOOSH
                  </button>
                  <button 
                    className="flex items-center justify-center gap-3 py-4 rounded-2xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
                  >
                    <Zap size={16} /> EXTRACT GROOVE
                  </button>
                  <button 
                    onClick={() => setReverse(!reverse)}
                    className={cn(
                      "flex items-center justify-center gap-3 py-4 rounded-2xl border text-xs font-bold transition-all shadow-sm",
                      reverse ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600"
                    )}
                  >
                    <RotateCcw size={16} /> REVERSE LOOP
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-8">
                <button 
                  onClick={applyProcessing}
                  disabled={isProcessing}
                  className="flex-1 bg-slate-900 text-white py-5 rounded-3xl text-sm font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 flex items-center justify-center gap-3"
                >
                  {isProcessing ? "PROCESSING..." : <><Activity size={18} /> APPLY CHANGES</>}
                </button>
                <button 
                  className="flex-1 bg-blue-600 text-white py-5 rounded-3xl text-sm font-bold hover:bg-blue-500 transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3"
                >
                  <Save size={18} /> SAVE TO LIBRARY
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
