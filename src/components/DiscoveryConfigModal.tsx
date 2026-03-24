import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, Layers, Scissors, Check, Clock, Music } from 'lucide-react';
import { WaveformView } from './WaveformView';
import { Stem } from '../types';
import { cn } from '../lib/utils';

interface DiscoveryConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeStem: Stem;
  stems: Stem[];
  onStart: (config: {
    applyToAll: boolean;
    timeRange?: { start: number; end: number };
  }) => void;
}

export const DiscoveryConfigModal: React.FC<DiscoveryConfigModalProps> = ({
  isOpen,
  onClose,
  activeStem,
  stems,
  onStart
}) => {
  const [mode, setMode] = useState<'full' | 'range'>('full');
  const [applyToAll, setApplyToAll] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 50 }); // percentages

  const handleStart = () => {
    const timeRange = mode === 'range' ? {
      start: (selection.start / 100) * activeStem.buffer.duration,
      end: (selection.end / 100) * activeStem.buffer.duration
    } : undefined;

    onStart({ applyToAll, timeRange });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-xl flex items-center justify-center p-8"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-4xl glass-card rounded-[40px] border border-slate-200 overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Zap size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-serif italic text-slate-900">Extraction Strategy</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Configure how AI discovers your loops</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X size={24} />
              </button>
            </div>

            <div className="p-10 space-y-10">
              <div className="grid grid-cols-2 gap-6">
                <button
                  onClick={() => setMode('full')}
                  className={cn(
                    "p-8 rounded-3xl border transition-all text-left space-y-4",
                    mode === 'full' 
                      ? "bg-blue-50 border-blue-200 ring-1 ring-blue-200" 
                      : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                  )}
                >
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", mode === 'full' ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}>
                    <Layers size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-slate-900">Full Stem Analysis</h4>
                    <p className="text-sm text-slate-500">Analyze the entire duration of the audio file to find the best loops.</p>
                  </div>
                </button>

                <button
                  onClick={() => setMode('range')}
                  className={cn(
                    "p-8 rounded-3xl border transition-all text-left space-y-4",
                    mode === 'range' 
                      ? "bg-blue-50 border-blue-200 ring-1 ring-blue-200" 
                      : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                  )}
                >
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", mode === 'range' ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}>
                    <Scissors size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-lg text-slate-900">Custom Range</h4>
                    <p className="text-sm text-slate-500">Focus AI discovery on a specific section of the audio.</p>
                  </div>
                </button>
              </div>

              {mode === 'range' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Discovery Zone</label>
                    <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
                      <span>START: {((selection.start / 100) * activeStem.buffer.duration).toFixed(2)}s</span>
                      <span>END: {((selection.end / 100) * activeStem.buffer.duration).toFixed(2)}s</span>
                    </div>
                  </div>
                  <div className="h-48 bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden">
                    <WaveformView 
                      buffer={activeStem.buffer} 
                      bpm={activeStem.bpm} 
                      trim={selection}
                      onTrimChange={setSelection}
                      className="opacity-60"
                    />
                  </div>
                </motion.div>
              )}

              <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                <button
                  onClick={() => setApplyToAll(!applyToAll)}
                  className="flex items-center gap-3 group"
                >
                  <div className={cn(
                    "w-6 h-6 rounded-lg border flex items-center justify-center transition-all",
                    applyToAll ? "bg-blue-600 border-blue-500" : "bg-white border-slate-200 group-hover:border-slate-300"
                  )}>
                    {applyToAll && <Check size={14} className="text-white" />}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-slate-700">Apply to all loaded stems</div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Process {stems.length} files simultaneously</div>
                  </div>
                </button>

                <button
                  onClick={handleStart}
                  className="px-10 h-16 rounded-2xl bg-blue-600 text-white font-bold flex items-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20"
                >
                  <Zap size={20} fill="white" />
                  START DISCOVERY
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
