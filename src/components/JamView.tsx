import React, { useState, useEffect, useRef } from 'react';
import { LoopCandidate, ProcessingOptions } from '../types';
import { audioEngine } from '../services/audioEngine';
import { motion, AnimatePresence } from 'motion/react';
import { Music, Play, Square, Layers, Sparkles, Volume2, Zap, Sliders, Activity, RefreshCw, Trash2, Settings2 } from 'lucide-react';
import { cn } from '../lib/utils';
import * as Tone from 'tone';
import { MasterControls } from './MasterControls';

interface PadSetting {
  pitch: number;
  volume: number;
  isLooping: boolean;
}

interface JamViewProps {
  storedLoops: LoopCandidate[];
  padSettings: Record<number, PadSetting>;
  setPadSettings: React.Dispatch<React.SetStateAction<Record<number, PadSetting>>>;
  masterVolume: number;
  setMasterVolume: (val: number) => void;
  masterBpm: number;
  setMasterBpm: (val: number) => void;
}

export const JamView: React.FC<JamViewProps> = ({ 
  storedLoops, 
  padSettings, 
  setPadSettings, 
  masterVolume, 
  setMasterVolume, 
  masterBpm, 
  setMasterBpm 
}) => {
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [isTransportPlaying, setIsTransportPlaying] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<Tone.Analyser | null>(null);

  useEffect(() => {
    // Initialize analyzer
    analyzerRef.current = new Tone.Analyser("waveform", 1024);
    Tone.getDestination().connect(analyzerRef.current);

    const draw = () => {
      if (!canvasRef.current || !analyzerRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const values = analyzerRef.current.getValue() as Float32Array;
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;

      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#60a5fa"; // blue-400

      const sliceWidth = width / values.length;
      let x = 0;

      for (let i = 0; i < values.length; i++) {
        const v = values[i] * 0.5;
        const y = (v + 0.5) * height;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.stroke();
      requestAnimationFrame(draw);
    };

    const animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  const handlePadTrigger = async (index: number) => {
    const loop = storedLoops[index];
    if (!loop) return;

    const settings = padSettings[index] || { pitch: 0, volume: 0, isLooping: false };

    setActivePads(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    // Trigger logic
    await audioEngine.triggerSample(loop.buffer, settings.pitch);

    setTimeout(() => {
      setActivePads(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }, 200);
  };

  const toggleTransport = async () => {
    if (isTransportPlaying) {
      audioEngine.stopJam();
      setIsTransportPlaying(false);
    } else {
      // Map padSettings to loop IDs for the engine
      const settingsMap: Record<string, ProcessingOptions> = {};
      storedLoops.forEach((loop, i) => {
        if (padSettings[i]) {
          settingsMap[loop.id] = {
            pitchShift: padSettings[i].pitch,
            volume: padSettings[i].volume
          };
        }
      });

      // For simplicity, we jam with all stored loops that are marked as "looping"
      const loopsToJam = storedLoops.filter((_, i) => padSettings[i]?.isLooping);
      
      if (loopsToJam.length > 0) {
        await audioEngine.startJam(loopsToJam, masterBpm, settingsMap);
        setIsTransportPlaying(true);
      } else {
        // Fallback: if none marked as looping, just take the first 4
        const fallbackLoops = storedLoops.slice(0, 4);
        if (fallbackLoops.length > 0) {
          await audioEngine.startJam(fallbackLoops, masterBpm, settingsMap);
          setIsTransportPlaying(true);
        }
      }
    }
  };

  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    if (isTransportPlaying) {
      audioEngine.updateJamBpm(masterBpm);
    }
  }, [masterBpm, isTransportPlaying]);

  const updatePadSetting = (index: number, key: keyof PadSetting, value: any) => {
    setPadSettings(prev => ({
      ...prev,
      [index]: {
        ...(prev[index] || { pitch: 0, volume: 0, isLooping: false }),
        [key]: value
      }
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
      {/* Left Column: Pad Grid */}
      <div className="lg:col-span-8 space-y-10">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-4xl font-serif italic text-slate-900">Jam Station</h2>
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-blue-500/30" />
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                {storedLoops.length} / 16 PADS ASSIGNED
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="h-16 w-48 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
              <canvas ref={canvasRef} width={192} height={64} className="w-full h-full" />
            </div>
            <button 
              onClick={toggleTransport}
              disabled={storedLoops.length === 0}
              className={cn(
                "h-16 px-8 rounded-2xl font-bold text-sm transition-all flex items-center gap-3 shadow-xl",
                isTransportPlaying 
                  ? "bg-red-500 text-white animate-pulse" 
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {isTransportPlaying ? <Square size={20} fill="white" /> : <Play size={20} fill="white" />}
              {isTransportPlaying ? "STOP ENGINE" : "START ENGINE"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 16 }).map((_, i) => {
            const loop = storedLoops[i];
            const isActive = activePads.has(i);
            const isSelected = selectedPad === i;

            return (
              <div key={i} className="relative">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handlePadTrigger(i)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedPad(i);
                  }}
                  className={cn(
                    "w-full aspect-square rounded-3xl border-2 transition-all flex flex-col items-center justify-center gap-2 relative overflow-hidden group",
                    loop 
                      ? isActive 
                        ? "bg-blue-600 border-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.4)]" 
                        : isSelected
                          ? "bg-blue-50 border-blue-500/50"
                          : "bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"
                      : "bg-slate-50 border-slate-100 cursor-not-allowed"
                  )}
                >
                  {loop ? (
                    <>
                      <Music size={24} className={cn(
                        "transition-colors",
                        isActive ? "text-white" : "text-slate-300 group-hover:text-blue-500"
                      )} />
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-widest transition-colors",
                        isActive ? "text-white/80" : "text-slate-400"
                      )}>Pad {i + 1}</span>
                      
                      {isActive && (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0.5 }}
                          animate={{ scale: 1.5, opacity: 0 }}
                          className="absolute inset-0 border-4 border-white/30 rounded-3xl"
                        />
                      )}
                    </>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-200" />
                  )}
                </motion.button>
                {loop && (
                  <button 
                    onClick={() => setSelectedPad(isSelected ? null : i)}
                    className={cn(
                      "absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all z-10 shadow-lg",
                      isSelected ? "bg-blue-600 text-white" : "bg-white text-slate-400 border border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <Settings2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Controls & Settings */}
      <div className="lg:col-span-4 space-y-8">
        <MasterControls />

        <AnimatePresence mode="wait">
          {selectedPad !== null && storedLoops[selectedPad] ? (
            <motion.div
              key="pad-settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="glass-card rounded-[40px] p-8 border-blue-200 bg-blue-50/50 space-y-8 shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                    <Music size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-serif italic text-slate-900">Pad {selectedPad + 1}</h3>
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate w-32">
                      {storedLoops[selectedPad].label || "Loop Settings"}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedPad(null)} className="text-slate-300 hover:text-red-500">
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pitch Shift</span>
                    <span className="text-sm font-mono font-bold text-blue-600">
                      {padSettings[selectedPad]?.pitch > 0 ? `+${padSettings[selectedPad]?.pitch}` : padSettings[selectedPad]?.pitch || 0} st
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="-12" 
                    max="12" 
                    value={padSettings[selectedPad]?.pitch || 0} 
                    onChange={(e) => updatePadSetting(selectedPad, 'pitch', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pad Volume</span>
                    <span className="text-sm font-mono font-bold text-slate-600">
                      {padSettings[selectedPad]?.volume || 0} dB
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="-60" 
                    max="6" 
                    value={padSettings[selectedPad]?.volume || 0} 
                    onChange={(e) => updatePadSetting(selectedPad, 'volume', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <button 
                  onClick={() => updatePadSetting(selectedPad, 'isLooping', !(padSettings[selectedPad]?.isLooping))}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold text-xs tracking-widest transition-all flex items-center justify-center gap-2 border",
                    padSettings[selectedPad]?.isLooping 
                      ? "bg-emerald-50 border-emerald-200 text-emerald-600" 
                      : "bg-slate-50 border-slate-200 text-slate-400"
                  )}
                >
                  <RefreshCw size={14} className={padSettings[selectedPad]?.isLooping ? "animate-spin" : ""} />
                  {padSettings[selectedPad]?.isLooping ? "LOOPING ENABLED" : "ONE-SHOT MODE"}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="no-selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-64 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-[40px] bg-white/50"
            >
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 mb-4">
                <Zap size={24} />
              </div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                Select a pad or right-click to edit settings
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

