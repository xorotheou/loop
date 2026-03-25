import React, { useState, useEffect, useRef } from 'react';
import { LoopCandidate, ProcessingOptions } from '../types';
import { audioEngine } from '../services/audioEngine';
import { motion, AnimatePresence } from 'motion/react';
import { Music, Play, Square, Layers, Sparkles, Volume2, Zap, Sliders, Activity, RefreshCw, Trash2, Settings2, Mic, MicOff, Piano, Download, Wand2 } from 'lucide-react';
import { cn } from '../lib/utils';
import * as Tone from 'tone';
import { MasterControls } from './MasterControls';
import { ChordSuggestion } from '../types';

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
  projectKey: string;
  setProjectKey: (val: string) => void;
  onEdit?: (loop: LoopCandidate) => void;
  isVoiceControlActive: boolean;
  voiceStatus: string | null;
  toggleVoiceControl: () => void;
  chordSuggestions: ChordSuggestion[];
  isGettingChords: boolean;
  getChordSuggestions: () => void;
  playChord: (chord: ChordSuggestion) => void;
  activeSamplerLoop: LoopCandidate | null;
  loadToSampler: (loop: LoopCandidate) => void;
}

export const JamView: React.FC<JamViewProps> = ({ 
  storedLoops, 
  padSettings, 
  setPadSettings, 
  masterVolume, 
  setMasterVolume, 
  masterBpm, 
  setMasterBpm,
  projectKey,
  setProjectKey,
  onEdit,
  isVoiceControlActive,
  voiceStatus,
  toggleVoiceControl,
  chordSuggestions,
  isGettingChords,
  getChordSuggestions,
  playChord,
  activeSamplerLoop,
  loadToSampler
}) => {
  const [activePads, setActivePads] = useState<Set<number>>(new Set());
  const [selectedPad, setSelectedPad] = useState<number | null>(null);
  const [isTransportPlaying, setIsTransportPlaying] = useState(false);
  const [grooveMap, setGrooveMap] = useState<number[] | null>(null);
  const [isProcessingEffect, setIsProcessingEffect] = useState(false);
  
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

  const handleMatchKey = (index: number) => {
    const loop = storedLoops[index];
    if (loop && loop.key) {
      const shift = audioEngine.calculateKeyShift(loop.key, projectKey);
      updatePadSetting(index, 'pitch', shift);
    }
  };

  const handleGenerateSwoosh = async (index: number) => {
    const loop = storedLoops[index];
    if (loop) {
      setIsProcessingEffect(true);
      const swooshBuffer = await audioEngine.generateReverseReverb(loop.buffer);
      // We'll just play it for now, but in a real app we'd save it
      await audioEngine.triggerSample(swooshBuffer);
      setIsProcessingEffect(false);
    }
  };

  const handleExtractGroove = (index: number) => {
    const loop = storedLoops[index];
    if (loop) {
      const groove = audioEngine.extractGroove(loop.buffer);
      setGrooveMap(groove);
    }
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
            <button 
              onClick={toggleVoiceControl}
              className={cn(
                "h-16 px-6 rounded-2xl font-bold text-sm transition-all flex items-center gap-3 shadow-xl",
                isVoiceControlActive 
                  ? "bg-purple-600 text-white animate-pulse" 
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              )}
              title="Voice Controlled Studio"
            >
              {isVoiceControlActive ? <Mic size={20} /> : <MicOff size={20} />}
              <div className="flex flex-col items-start">
                <span className="text-[10px] uppercase tracking-widest leading-none mb-1">Voice Control</span>
                <span className="text-[8px] font-mono opacity-60 leading-none">{voiceStatus || "OFFLINE"}</span>
              </div>
            </button>
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
        <div className="glass-card rounded-[40px] p-8 border-indigo-200 bg-indigo-50/30 space-y-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                <Piano size={20} />
              </div>
              <div>
                <h3 className="text-lg font-serif italic text-slate-900">Chord Suggester</h3>
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">AI Composition</p>
              </div>
            </div>
            <button 
              onClick={getChordSuggestions}
              disabled={isGettingChords}
              className={cn(
                "p-2 rounded-lg transition-all",
                isGettingChords ? "bg-indigo-600 text-white animate-spin" : "bg-white border border-slate-200 text-slate-400 hover:text-indigo-600"
              )}
            >
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(() => {
              const seenIds = new Set();
              return chordSuggestions.map(chord => {
                if (seenIds.has(chord.id)) {
                  console.warn(`Duplicate key detected in chordSuggestions: ${chord.id}`);
                  return null;
                }
                seenIds.add(chord.id);
                return (
                  <button
                    key={chord.id}
                    onClick={() => playChord(chord)}
                    className="bg-white border border-slate-200 p-4 rounded-2xl text-left hover:border-indigo-400 hover:bg-indigo-50/50 transition-all group"
                  >
                    <span className="text-xs font-bold text-slate-700 block mb-1">{chord.name}</span>
                    <div className="flex gap-1">
                      {chord.notes.slice(0, 3).map((n, i) => (
                        <span key={i} className="text-[8px] font-mono text-slate-400">{n}</span>
                      ))}
                    </div>
                  </button>
                );
              }).filter(Boolean);
            })()}
            {chordSuggestions.length === 0 && (
              <div className="col-span-2 py-8 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">No suggestions yet</p>
              </div>
            )}
          </div>
        </div>

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
                  onClick={() => onEdit?.(storedLoops[selectedPad])}
                  className="w-full py-4 rounded-2xl bg-slate-900 text-[10px] font-bold text-white hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 flex items-center justify-center gap-3 mb-4"
                >
                  <Wand2 size={16} /> OPEN IN ADVANCED EDITOR
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleMatchKey(selectedPad)}
                    className="py-3 rounded-xl bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all"
                  >
                    MATCH KEY
                  </button>
                  <button 
                    onClick={() => handleGenerateSwoosh(selectedPad)}
                    disabled={isProcessingEffect}
                    className="py-3 rounded-xl bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all"
                  >
                    {isProcessingEffect ? "GENERATING..." : "GEN SWOOSH"}
                  </button>
                  <button 
                    onClick={() => handleExtractGroove(selectedPad)}
                    className="py-3 rounded-xl bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-all"
                  >
                    EXTRACT GROOVE
                  </button>
                  <button 
                    disabled={!grooveMap}
                    className={cn(
                      "py-3 rounded-xl border text-[10px] font-bold transition-all",
                      grooveMap ? "bg-white border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600" : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                    )}
                  >
                    APPLY GROOVE
                  </button>
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

                <button 
                  onClick={() => loadToSampler(storedLoops[selectedPad])}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold text-xs tracking-widest transition-all flex items-center justify-center gap-2 border",
                    activeSamplerLoop?.id === storedLoops[selectedPad].id
                      ? "bg-blue-600 border-blue-600 text-white" 
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Download size={14} />
                  {activeSamplerLoop?.id === storedLoops[selectedPad].id ? "LOADED IN SAMPLER" : "LOAD TO SAMPLER"}
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

