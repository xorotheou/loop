import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Scissors, Play, Square, Check, Music, Clock } from 'lucide-react';
import { WaveformView } from './WaveformView';
import { Stem, LoopCandidate } from '../types';
import { audioEngine } from '../services/audioEngine';
import { cn, generateId } from '../lib/utils';

interface ManualSlicerProps {
  stem: Stem;
  onClose: () => void;
  onExtract: (loop: LoopCandidate) => void;
}

export const ManualSlicer: React.FC<ManualSlicerProps> = ({ stem, onClose, onExtract }) => {
  const [selection, setSelection] = useState({ start: 0, end: 25 }); // percentages
  const [isPlaying, setIsPlaying] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapMode, setSnapMode] = useState<'beat' | 'bar'>('beat');
  const audioRef = useRef<AudioBufferSourceNode | null>(null);

  const togglePlay = async () => {
    await audioEngine.init();
    if (isPlaying) {
      audioRef.current?.stop();
      setIsPlaying(false);
    } else {
      const start = (selection.start / 100) * stem.buffer.duration;
      const duration = ((selection.end - selection.start) / 100) * stem.buffer.duration;
      
      const source = audioEngine.ctx.createBufferSource();
      source.buffer = stem.buffer;
      source.connect(audioEngine.ctx.destination);
      source.loop = true;
      source.loopStart = start;
      source.loopEnd = start + duration;
      source.start(0, start);
      audioRef.current = source;
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => audioRef.current?.stop();
  }, []);

  const handleExtract = async () => {
    const start = (selection.start / 100) * stem.buffer.duration;
    const duration = ((selection.end - selection.start) / 100) * stem.buffer.duration;
    
    const slice = audioEngine.sliceBuffer(stem.buffer, start, start + duration);
    
    const loop: LoopCandidate = {
      id: generateId(),
      startTime: start,
      duration: duration,
      bpm: stem.bpm,
      key: stem.key,
      rhythmicDensity: 0.5,
      grooveConsistency: 0.8,
      hcdfStability: 0.7,
      score: 1.0,
      buffer: slice,
      stemId: stem.id
    };

    onExtract(loop);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-xl flex items-center justify-center p-8"
    >
      <div className="w-full max-w-6xl glass-card rounded-[40px] border-slate-200 overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-2xl font-serif italic text-slate-900">Manual Slice: {stem.name}</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Drag on the waveform to select a loop region</p>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-100 rounded-full hover:bg-slate-200 transition-all text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 p-10 space-y-10 overflow-y-auto">
          <div 
            className="relative h-64 bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden"
          >
            <WaveformView 
              buffer={stem.buffer} 
              bpm={stem.bpm} 
              showGrid 
              trim={selection}
              onTrimChange={setSelection}
              snapToGrid={snapToGrid}
              snapMode={snapMode}
              className="opacity-60" 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card p-6 rounded-3xl border-slate-100 bg-white/50 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <Scissors size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Snap Controls</span>
                </div>
                <button 
                  onClick={() => setSnapToGrid(!snapToGrid)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-[10px] font-bold border transition-all",
                    snapToGrid ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-100 border-slate-200 text-slate-400"
                  )}
                >
                  {snapToGrid ? "SNAP ON" : "SNAP OFF"}
                </button>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setSnapMode('beat')}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all",
                    snapMode === 'beat' ? "bg-slate-200 border-slate-300 text-slate-900" : "bg-slate-50 border-slate-100 text-slate-400"
                  )}
                >
                  BEAT
                </button>
                <button 
                  onClick={() => setSnapMode('bar')}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all",
                    snapMode === 'bar' ? "bg-slate-200 border-slate-300 text-slate-900" : "bg-slate-50 border-slate-100 text-slate-400"
                  )}
                >
                  BAR
                </button>
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl border-slate-100 bg-white/50 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Music size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Timing Info</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[9px] text-slate-400 uppercase font-bold mb-1">Start</div>
                  <div className="text-xl font-mono text-slate-700">{((selection.start / 100) * stem.buffer.duration).toFixed(3)}s</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase font-bold mb-1">Duration</div>
                  <div className="text-xl font-mono text-slate-700">{(((selection.end - selection.start) / 100) * stem.buffer.duration).toFixed(3)}s</div>
                </div>
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl border-slate-100 bg-white/50 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Loop Length</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-serif italic text-blue-600">
                  {Math.round((((selection.end - selection.start) / 100) * stem.buffer.duration) / (60 / stem.bpm) * 4) / 4} <span className="text-sm font-sans font-bold uppercase tracking-widest text-slate-300">Beats</span>
                </div>
                <div className="text-right">
                  <div className="text-[9px] text-slate-400 uppercase font-bold">Stem BPM</div>
                  <div className="text-sm font-mono text-slate-500">{stem.bpm}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4">
              <button 
                onClick={togglePlay}
                className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl",
                  isPlaying ? "bg-blue-600 text-white scale-110" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {isPlaying ? <Square size={24} fill="white" /> : <Play size={24} fill="currentColor" className="ml-1" />}
              </button>
              <button 
                onClick={handleExtract}
                className="flex-1 h-16 rounded-[24px] bg-blue-600 text-white font-bold flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20"
              >
                <Check size={20} />
                EXTRACT SELECTION
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
