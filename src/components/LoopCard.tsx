import React, { useState, useRef, useEffect } from 'react';
import { LoopCandidate, ProcessingOptions, Preset } from '../types';
import { WaveformView } from './WaveformView';
import { Play, Pause, Square, Music, Activity, MoreHorizontal, Clock, Scissors, Wand2, Volume2, Filter, Download, Save, Hash, Sparkles, Layers, Search, Bookmark, Trash2, AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { audioEngine } from '../services/audioEngine';
import { aiService } from '../services/aiService';
import { presetService } from '../services/presetService';
import { SpectrogramView } from './SpectrogramView';
import MidiWriter from 'midi-writer-js';

interface LoopCardProps {
  loop: LoopCandidate;
  initialPitch?: number;
  initialBpm?: number;
  onSimilaritySearch?: (loop: LoopCandidate) => void;
  onAddToSequencer?: (loop: LoopCandidate) => void;
  onStore?: (loop: LoopCandidate) => void;
  onEdit?: (loop: LoopCandidate) => void;
}

export const LoopCard: React.FC<LoopCardProps> = ({ loop, initialPitch = 0, initialBpm, onSimilaritySearch, onAddToSequencer, onStore, onEdit }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [offset, setOffset] = useState(0);
  const [showTools, setShowTools] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer>(loop.buffer);
  const [isLabeling, setIsLabeling] = useState(false);
  const [loopLabel, setLoopLabel] = useState(loop.label || `Loop ${loop.id.slice(0, 4)}`);
  const [loopTags, setLoopTags] = useState<string[]>(loop.tags || []);
  
  // Processing States
  const [trim, setTrim] = useState({ start: 0, end: 100 });
  const [targetBpm, setTargetBpm] = useState(initialBpm || loop.bpm);
  const [pitchShift, setPitchShift] = useState(initialPitch);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [bitcrush, setBitcrush] = useState(16);
  const [saturation, setSaturation] = useState(0);
  const [filterFreq, setFilterFreq] = useState(20000);
  const [filterType, setFilterType] = useState<'lowpass' | 'highpass' | 'none'>('none');
  const [stereoWidth, setStereoWidth] = useState(1);
  const [eqPreset, setEqPreset] = useState<string>('none');
  const [reverse, setReverse] = useState(false);
  const [phaseInversion, setPhaseInversion] = useState(false);
  const [showAIInsights, setShowAIInsights] = useState(false);
  const [showSpectrogram, setShowSpectrogram] = useState(false);
  const [isExtractingMidi, setIsExtractingMidi] = useState(false);
  
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapMode, setSnapMode] = useState<'beat' | 'bar'>('beat');
  const [loopBars, setLoopBars] = useState<number | 'custom'>('custom');

  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');

  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    const saved = await presetService.getPresets('loop');
    setPresets(saved);
  };

  const saveCurrentAsPreset = async () => {
    if (!newPresetName) return;
    const options: ProcessingOptions = {
      pitchShift,
      tempoRatio: targetBpm / loop.bpm,
      trimStart: trim.start / 100,
      trimEnd: trim.end / 100,
      normalize: isNormalizing,
      bitcrush,
      distortion: saturation,
      filter: filterType === 'none' ? undefined : {
        type: filterType as any,
        frequency: filterFreq,
        resonance: 1,
        drive: 0
      },
      stereoWidth,
      reverse,
      phaseInversion
    };
    await presetService.savePreset(newPresetName, options, 'loop');
    setNewPresetName('');
    loadPresets();
  };

  const applyPreset = (preset: Preset) => {
    const { options } = preset;
    if (options.pitchShift !== undefined) setPitchShift(options.pitchShift);
    if (options.tempoRatio !== undefined) setTargetBpm(loop.bpm * options.tempoRatio);
    if (options.trimStart !== undefined && options.trimEnd !== undefined) {
      setTrim({ start: options.trimStart * 100, end: options.trimEnd * 100 });
    }
    if (options.normalize !== undefined) setIsNormalizing(options.normalize);
    if (options.bitcrush !== undefined) setBitcrush(options.bitcrush);
    if (options.distortion !== undefined) setSaturation(options.distortion);
    if (options.filter) {
      setFilterType(options.filter.type as any);
      setFilterFreq(options.filter.frequency);
    }
    if (options.stereoWidth !== undefined) setStereoWidth(options.stereoWidth);
    if (options.reverse !== undefined) setReverse(options.reverse);
    if (options.phaseInversion !== undefined) setPhaseInversion(options.phaseInversion);
    setShowPresets(false);
  };

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

  const handlePause = () => {
    if (!isPlaying) return;
    const ctx = audioCtxRef.current;
    if (ctx && audioSourceRef.current) {
      const elapsed = ctx.currentTime - startTimeRef.current;
      setOffset(prev => prev + elapsed);
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleStop = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setOffset(0);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) handlePause();
    else handlePlay();
  };

  const applyProcessing = async () => {
    handleStop();
    
    const options: ProcessingOptions = {
      pitchShift,
      tempoRatio: targetBpm / loop.bpm,
      trimStart: trim.start / 100,
      trimEnd: trim.end / 100,
      normalize: isNormalizing,
      bitcrush,
      distortion: saturation,
      filter: filterType === 'none' ? undefined : {
        type: filterType as any,
        frequency: filterFreq,
        resonance: 1,
        drive: 0
      },
      stereoWidth,
      reverse,
      phaseInversion
    };

    const buffer = await audioEngine.processOffline(loop.buffer, options);
    setProcessedBuffer(buffer);
  };

  const handleAILabel = async () => {
    setIsLabeling(true);
    const result = await aiService.labelLoop(loop);
    setLoopLabel(result.label);
    setLoopTags(result.tags);
    setIsLabeling(false);
  };

  const handleMidiExport = async () => {
    setIsExtractingMidi(true);
    try {
      const wavBlob = await audioEngine.bufferToWav(processedBuffer);
      const formData = new FormData();
      formData.append('file', wavBlob, 'loop.wav');

      const response = await fetch('/api/extract-midi', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error("MIDI Extraction Failed");
      const data = await response.json();

      const track = new MidiWriter.Track();
      track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 1 }));

      data.onsets.forEach((time: number, i: number) => {
        const velocity = data.velocities[i];
        const tick = Math.floor(time * 128); 
        track.addEvent(new MidiWriter.NoteEvent({
          pitch: ['C3'],
          duration: 'T16',
          startTick: tick,
          velocity: velocity
        }));
      });

      const write = new MidiWriter.Writer(track);
      const midiData = write.buildFile();
      
      const blob = new Blob([midiData], { type: 'audio/midi' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${loopLabel.replace(/\s+/g, '_')}_groove.mid`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("MIDI Export Error:", err);
    } finally {
      setIsExtractingMidi(false);
    }
  };

  const handleExport = () => {
    const blob = audioEngine.bufferToWav(processedBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Loop_${loop.id.slice(0, 8)}_${targetBpm}BPM_${loop.key}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyEqPreset = (preset: string) => {
    setEqPreset(preset);
    switch (preset) {
      case 'warmth':
        setIsCleaning(true);
        setFilterType('lowpass');
        setFilterFreq(4000);
        break;
      case 'presence':
        setIsCleaning(true);
        setFilterType('highpass');
        setFilterFreq(2000);
        break;
      case 'cut-mud':
        setIsCleaning(true);
        setFilterType('highpass');
        setFilterFreq(300);
        break;
      case 'none':
      default:
        setIsCleaning(false);
        setFilterType('none');
        setFilterFreq(20000);
        break;
    }
  };

  const handleTrimChange = (newTrim: { start: number; end: number }) => {
    if (!snapToGrid) {
      setTrim(newTrim);
      return;
    }

    const beatDuration = 60 / loop.bpm;
    const beatPct = (beatDuration / loop.buffer.duration) * 100;
    const snapUnit = snapMode === 'bar' ? beatPct * 4 : beatPct;

    // Snap start
    let start = Math.round(newTrim.start / snapUnit) * snapUnit;
    // Snap end
    let end = Math.round(newTrim.end / snapUnit) * snapUnit;

    // If loopBars is fixed, maintain length
    if (loopBars !== 'custom') {
      const lengthPct = beatPct * 4 * (loopBars as number);
      if (newTrim.start !== trim.start) {
        // Start moved
        start = Math.min(start, 100 - lengthPct);
        end = start + lengthPct;
      } else {
        // End moved (though disabled in UI, WaveformView might try)
        end = Math.max(end, lengthPct);
        start = end - lengthPct;
      }
    } else {
      // Ensure minimum length
      if (end - start < 0.1) {
        if (newTrim.start !== trim.start) start = end - 0.1;
        else end = start + 0.1;
      }
    }

    setTrim({ 
      start: Math.max(0, Math.min(start, 99.9)), 
      end: Math.max(0.1, Math.min(end, 100)) 
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card rounded-[24px] p-5 flex flex-col gap-5 hover:bg-slate-50 transition-all group relative overflow-hidden"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
            <button onClick={handlePlay} disabled={isPlaying} className={cn("w-9 h-9 rounded-lg flex items-center justify-center transition-all", isPlaying ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-slate-400 hover:bg-slate-200 hover:text-blue-600")} title="Play">
              <Play size={16} fill="currentColor" className="ml-0.5" />
            </button>
            <button onClick={handlePause} disabled={!isPlaying} className={cn("w-9 h-9 rounded-lg flex items-center justify-center transition-all", !isPlaying && offset > 0 ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20" : "text-slate-400 hover:bg-slate-200 hover:text-amber-600 disabled:opacity-20")} title="Pause">
              <Pause size={16} fill="currentColor" />
            </button>
            <button onClick={handleStop} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-red-600 transition-all" title="Stop">
              <Square size={16} fill="currentColor" />
            </button>
          </div>
          <div className="flex flex-col ml-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Loop Label</span>
              {loop.aiDecision && (
                <button 
                  onClick={() => setShowAIInsights(!showAIInsights)}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-tighter transition-all",
                    loop.aiDecision === 'accept' ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                    loop.aiDecision === 'review' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" :
                    "bg-red-500/10 text-red-600 border border-red-500/20"
                  )}
                >
                  {loop.aiDecision === 'accept' ? <CheckCircle2 size={8} /> : 
                   loop.aiDecision === 'review' ? <HelpCircle size={8} /> : 
                   <AlertCircle size={8} />}
                  AI {loop.aiDecision}
                </button>
              )}
            </div>
            <button 
              onClick={() => onEdit?.(loop)}
              className="text-sm font-bold text-slate-700 font-serif italic hover:text-blue-600 transition-colors text-left"
            >
              {loopLabel}
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleAILabel}
            disabled={isLabeling}
            className={cn("p-2.5 rounded-xl transition-all", isLabeling ? "bg-indigo-600 text-white animate-pulse" : "text-slate-400 hover:text-indigo-600 hover:bg-slate-100")}
            title="AI Labeling"
          >
            <Sparkles size={20} />
          </button>
          <button 
            onClick={() => onAddToSequencer?.(loop)}
            className="p-2.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-all"
            title="Add to Jam Mode"
          >
            <Layers size={20} />
          </button>
          <button 
            onClick={() => onStore?.(loop)}
            className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-all"
            title="Store for Drum Pad"
          >
            <Save size={20} />
          </button>
          <button 
            onClick={() => setShowPresets(!showPresets)}
            className={cn("p-2.5 rounded-xl transition-all", showPresets ? "bg-amber-600 text-white" : "text-slate-400 hover:text-amber-600 hover:bg-slate-100")}
            title="Presets"
          >
            <Bookmark size={20} />
          </button>
          <button 
            onClick={() => setShowTools(!showTools)}
            className={cn("p-2.5 rounded-xl transition-all", showTools ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100")}
          >
            <Wand2 size={20} />
          </button>
          <button 
            onClick={() => setShowSpectrogram(!showSpectrogram)}
            className={cn("p-2.5 rounded-xl transition-all", showSpectrogram ? "bg-purple-600 text-white" : "text-slate-400 hover:text-purple-600 hover:bg-slate-100")}
            title="Spectral Analysis"
          >
            <Activity size={20} />
          </button>
          <button 
            onClick={handleMidiExport}
            disabled={isExtractingMidi}
            className={cn("p-2.5 rounded-xl transition-all", isExtractingMidi ? "bg-emerald-600 text-white animate-pulse" : "text-slate-400 hover:text-emerald-600 hover:bg-slate-100")}
            title="Export MIDI Groove"
          >
            <Music size={20} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showSpectrogram && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 overflow-hidden"
          >
            <div className="bg-slate-900 rounded-xl p-2 border border-slate-800">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Spectral Density</span>
                <span className="text-[10px] text-slate-500 font-mono">20Hz - 20kHz</span>
              </div>
              <SpectrogramView buffer={processedBuffer} width={400} height={120} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-28 bg-slate-100 rounded-2xl overflow-hidden relative group/waveform border border-slate-200">
        <WaveformView 
          buffer={processedBuffer} 
          bpm={loop.bpm}
          showGrid={snapToGrid}
          trim={trim}
          onTrimChange={handleTrimChange}
          snapToGrid={snapToGrid}
          snapMode={snapMode}
          rhythmicDensity={loop.rhythmicDensity}
          grooveConsistency={loop.grooveConsistency}
          className="opacity-60 group-hover/waveform:opacity-100 transition-opacity" 
        />
        <div className="absolute inset-0 flex items-center justify-center bg-blue-600/5 pointer-events-none opacity-0 group-hover/waveform:opacity-100 transition-opacity">
          <div className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 shadow-2xl">
            {isPlaying ? <Pause size={18} className="text-white" fill="currentColor" /> : <Play size={18} className="text-white ml-0.5" fill="currentColor" />}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAIInsights && loop.aiDecision && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-3 pt-2 border-t border-slate-200"
          >
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Adjudication Report</span>
                <span className={cn(
                  "text-[9px] font-bold px-2 py-0.5 rounded-md",
                  loop.aiConfidence && loop.aiConfidence > 0.8 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                )}>
                  CONFIDENCE: {(loop.aiConfidence || 0 * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-700">{loop.aiClassification?.replace(/_/g, ' ').toUpperCase()}</span>
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                  "{loop.aiReasoning?.[0] || 'No detailed reasoning provided.'}"
                </p>
              </div>
              {loop.aiReasoning && loop.aiReasoning.length > 1 && (
                <ul className="space-y-1 pt-1 border-t border-slate-200/50">
                  {loop.aiReasoning.slice(1).map((r, i) => (
                    <li key={i} className="text-[9px] text-slate-400 flex gap-2">
                      <span className="text-blue-500">•</span> {r}
                    </li>
                  ))}
                </ul>
              )}
              {loop.needsReview && (
                <div className="flex items-center gap-2 pt-1 text-amber-600">
                  <AlertCircle size={10} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Manual Review Recommended</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {showPresets && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-4 pt-2 border-t border-slate-200"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saved Presets</span>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Preset Name" 
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-1 text-[10px] text-slate-700 outline-none focus:border-amber-500/50"
                  />
                  <button 
                    onClick={saveCurrentAsPreset}
                    className="bg-amber-600 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-amber-500 transition-all"
                  >
                    SAVE
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  const seenIds = new Set();
                  return presets.map(p => {
                    if (seenIds.has(p.id)) {
                      console.warn(`Duplicate key detected in presets: ${p.id}`);
                      return null;
                    }
                    seenIds.add(p.id);
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-slate-100 p-2 rounded-xl border border-slate-200 group/preset">
                        <button 
                          onClick={() => applyPreset(p)}
                          className="text-[10px] font-bold text-slate-500 hover:text-amber-600 transition-all truncate flex-1 text-left"
                        >
                          {p.name}
                        </button>
                        <button 
                          onClick={async () => {
                            await presetService.deletePreset(p.id);
                            loadPresets();
                          }}
                          className="text-slate-300 hover:text-red-600 opacity-0 group-hover/preset:opacity-100 transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  }).filter(Boolean);
                })()}
                {presets.length === 0 && (
                  <div className="col-span-2 text-center py-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    No presets saved yet
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {showTools ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-5 pt-2 border-t border-slate-200"
          >
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Scissors size={12} /> Trim Range
                  </label>
                  <div className="flex gap-1.5">
                    <button 
                      onClick={() => {
                        const beatDuration = 60 / loop.bpm;
                        const beatPct = (beatDuration / loop.buffer.duration) * 100;
                        const snapUnit = snapMode === 'bar' ? beatPct * 4 : beatPct;
                        setTrim({
                          start: Math.round(trim.start / snapUnit) * snapUnit,
                          end: Math.round(trim.end / snapUnit) * snapUnit
                        });
                      }}
                      className="text-[9px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 hover:text-slate-900 transition-all"
                    >
                      ALIGN
                    </button>
                    <div className="flex bg-slate-100 rounded-lg border border-slate-200 p-0.5">
                      <button 
                        onClick={() => setSnapMode('beat')}
                        className={cn("text-[9px] px-2 py-0.5 rounded-md font-bold transition-all", snapMode === 'beat' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                      >
                        BEAT
                      </button>
                      <button 
                        onClick={() => setSnapMode('bar')}
                        className={cn("text-[9px] px-2 py-0.5 rounded-md font-bold transition-all", snapMode === 'bar' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400")}
                      >
                        BAR
                      </button>
                    </div>
                    <button 
                      onClick={() => setSnapToGrid(!snapToGrid)}
                      className={cn("text-[9px] px-2 py-1 rounded-lg border font-bold transition-all", snapToGrid ? "bg-blue-600 border-blue-600 text-white" : "bg-slate-100 border-slate-200 text-slate-400")}
                    >
                      SNAP
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" min="0" max="100" step="0.1" value={trim.start} 
                    onChange={(e) => {
                      let val = parseFloat(e.target.value);
                      const beatDuration = 60 / loop.bpm;
                      const beatPct = (beatDuration / loop.buffer.duration) * 100;
                      if (snapToGrid) {
                        const snapPct = snapMode === 'bar' ? beatPct * 4 : beatPct;
                        val = Math.round(val / snapPct) * snapPct;
                      }
                      if (loopBars !== 'custom') {
                        const lengthPct = beatPct * 4 * (loopBars as number);
                        setTrim({ start: Math.min(val, 100 - lengthPct), end: Math.min(100, val + lengthPct) });
                      } else {
                        setTrim({...trim, start: Math.min(val, trim.end - 0.1)});
                      }
                    }}
                    className="w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                  <input 
                    type="range" min="0" max="100" step="0.1" value={trim.end} 
                    disabled={loopBars !== 'custom'}
                    onChange={(e) => {
                      let val = parseFloat(e.target.value);
                      if (snapToGrid) {
                        const beatPct = ((60 / loop.bpm) / loop.buffer.duration) * 100;
                        const snapPct = snapMode === 'bar' ? beatPct * 4 : beatPct;
                        val = Math.round(val / snapPct) * snapPct;
                      }
                      setTrim({...trim, end: Math.max(val, trim.start + 0.1)});
                    }}
                    className={cn("w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-500", loopBars !== 'custom' && "opacity-20 cursor-not-allowed")}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={12} /> Loop Length (Bars)
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 4, 8].map(b => (
                    <button
                      key={b}
                      onClick={() => {
                        setLoopBars(b);
                        const beatDuration = 60 / loop.bpm;
                        const beatPct = (beatDuration / loop.buffer.duration) * 100;
                        const lengthPct = beatPct * 4 * b;
                        setTrim({ start: trim.start, end: Math.min(100, trim.start + lengthPct) });
                      }}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                        loopBars === b ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-300"
                      )}
                    >
                      {b}
                    </button>
                  ))}
                  <button
                    onClick={() => setLoopBars('custom')}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      loopBars === 'custom' ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" : "bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-300"
                    )}
                  >
                    FREE
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity size={12} /> Target BPM
                </label>
                <input 
                  type="number" value={targetBpm} 
                  onChange={(e) => setTargetBpm(parseInt(e.target.value))}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-blue-500/50 outline-none transition-all"
                />
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Source: {loop.bpm} BPM</div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Layers size={12} /> Actions
                </label>
                <button 
                  onClick={() => onSimilaritySearch?.(loop)}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <Search size={12} /> FIND SIMILAR
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    Bitcrush
                  </label>
                  <input 
                    type="range" min="0" max="16" step="1" value={bitcrush}
                    onChange={(e) => setBitcrush(parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    Saturation
                  </label>
                  <input 
                    type="range" min="0" max="1" step="0.01" value={saturation}
                    onChange={(e) => setSaturation(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    EQ Preset
                  </label>
                  <select 
                    value={eqPreset}
                    onChange={(e) => applyEqPreset(e.target.value)}
                    className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-500/50 transition-all"
                  >
                    <option value="none">Custom / None</option>
                    <option value="warmth">Warmth (LPF 4k + Clean)</option>
                    <option value="presence">Presence Boost (HPF 2k + Clean)</option>
                    <option value="cut-mud">Cut Mud (HPF 300 + Clean)</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    Stereo Width
                  </label>
                  <input 
                    type="range" min="0" max="2" step="0.1" value={stereoWidth}
                    onChange={(e) => setStereoWidth(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="flex gap-3">
                  <button onClick={() => setReverse(!reverse)} className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold transition-all border", reverse ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20" : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300")}>
                    REVERSE
                  </button>
                  <button onClick={() => setPhaseInversion(!phaseInversion)} className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold transition-all border", phaseInversion ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20" : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300")}>
                    INV PHASE
                  </button>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setIsNormalizing(!isNormalizing)} className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold transition-all border", isNormalizing ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20" : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300")}>
                    <Volume2 size={14} /> NORM
                  </button>
                  <button onClick={() => setIsCleaning(!isCleaning)} className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-bold transition-all border", isCleaning ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20" : "bg-slate-100 text-slate-500 border-slate-200 hover:border-slate-300")}>
                    <Filter size={14} /> CLEAN
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={applyProcessing} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all flex items-center justify-center gap-2 border border-slate-200">
                <Save size={16} /> APPLY
              </button>
              <button onClick={handleExport} className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-xs font-bold hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-600/20">
                <Download size={16} /> EXPORT WAV
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2.5">
                <div className="bg-blue-500/10 text-blue-600 text-[10px] px-2.5 py-1 rounded-lg font-bold border border-blue-500/20">
                  {loop.bpm} BPM
                </div>
                <div className="bg-slate-100 text-slate-500 text-[10px] px-2.5 py-1 rounded-lg font-bold border border-slate-200">
                  {loop.key}
                </div>
                <div className="bg-slate-100 text-slate-500 text-[10px] px-2.5 py-1 rounded-lg font-bold border border-slate-200 flex items-center gap-1.5">
                  <Clock size={12} />
                  {processedBuffer.duration.toFixed(2)}s
                </div>
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Score: {(loop.score * 100).toFixed(0)}%</div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {loopTags.map((tag, i) => (
                <span key={`${tag}-${i}`} className="bg-slate-100 text-slate-500 text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-widest border border-slate-200">
                  {tag}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                  <span>Density</span>
                  <span className="text-slate-700">{(loop.rhythmicDensity * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: `${loop.rhythmicDensity * 100}%` }} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                  <span>Groove</span>
                  <span className="text-slate-700">{(loop.grooveConsistency * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${loop.grooveConsistency * 100}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

