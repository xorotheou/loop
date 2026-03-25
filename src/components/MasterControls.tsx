import React, { useState, useEffect } from 'react';
import { ProcessingOptions, Preset } from '../types';
import { audioEngine } from '../services/audioEngine';
import { presetService } from '../services/presetService';
import { Sliders, Bookmark, Save, Trash2, Activity, Wind, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export const MasterControls: React.FC = () => {
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  
  const [reverbWet, setReverbWet] = useState(0.3);
  const [reverbSize, setReverbSize] = useState(0.5);
  const [delayWet, setDelayWet] = useState(0.2);
  const [delayTime, setDelayTime] = useState(0.25);
  const [delayFeedback, setDelayFeedback] = useState(0.4);
  const [limiterThreshold, setLimiterThreshold] = useState(0);

  useEffect(() => {
    loadPresets();
    updateAudio();
  }, []);

  useEffect(() => {
    updateAudio();
  }, [reverbWet, reverbSize, delayWet, delayTime, delayFeedback, limiterThreshold]);

  const loadPresets = async () => {
    const saved = await presetService.getPresets('master');
    setPresets(saved);
  };

  const updateAudio = () => {
    const options: ProcessingOptions = {
      reverb: { wet: reverbWet, roomSize: reverbSize, dampening: 3000 },
      delay: { wet: delayWet, time: delayTime, feedback: delayFeedback },
      limiter: limiterThreshold
    };
    audioEngine.updateMasterChain(options);
  };

  const savePreset = async () => {
    if (!newPresetName) return;
    const options: ProcessingOptions = {
      reverb: { wet: reverbWet, roomSize: reverbSize, dampening: 3000 },
      delay: { wet: delayWet, time: delayTime, feedback: delayFeedback },
      limiter: limiterThreshold
    };
    await presetService.savePreset(newPresetName, options, 'master');
    setNewPresetName('');
    loadPresets();
  };

  const applyPreset = (preset: Preset) => {
    const { options } = preset;
    if (options.reverb) {
      setReverbWet(options.reverb.wet);
      setReverbSize(options.reverb.roomSize);
    }
    if (options.delay) {
      setDelayWet(options.delay.wet);
      setDelayTime(options.delay.time);
      setDelayFeedback(options.delay.feedback);
    }
    if (options.limiter !== undefined) setLimiterThreshold(options.limiter);
    setShowPresets(false);
  };

  return (
    <div className="glass-card rounded-[32px] p-6 border-slate-200 bg-white/50 space-y-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
            <Sliders size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Master Chain</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Global Effects Bus</p>
          </div>
        </div>
        <button 
          onClick={() => setShowPresets(!showPresets)}
          className={cn("p-2 rounded-lg transition-all", showPresets ? "bg-amber-600 text-white" : "text-slate-300 hover:text-amber-600 hover:bg-slate-50")}
        >
          <Bookmark size={18} />
        </button>
      </div>

      <AnimatePresence>
        {showPresets && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-4 pb-4 border-b border-slate-100"
          >
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="New Preset Name" 
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500/50"
              />
              <button 
                onClick={savePreset}
                className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-700 transition-all"
              >
                SAVE
              </button>
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
                    <div key={p.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100 group/preset">
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
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover/preset:opacity-100 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                }).filter(Boolean);
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Wind size={12} /> Reverb
            </label>
            <span className="text-[10px] font-mono text-blue-600">{(reverbWet * 100).toFixed(0)}%</span>
          </div>
          <div className="space-y-2">
            <input 
              type="range" min="0" max="1" step="0.01" value={reverbWet}
              onChange={(e) => setReverbWet(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-[8px] text-slate-300 font-bold uppercase">
              <span>Dry</span>
              <span>Wet</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Clock size={12} /> Delay
            </label>
            <span className="text-[10px] font-mono text-indigo-600">{(delayWet * 100).toFixed(0)}%</span>
          </div>
          <div className="space-y-2">
            <input 
              type="range" min="0" max="1" step="0.01" value={delayWet}
              onChange={(e) => setDelayWet(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[8px] text-slate-300 font-bold uppercase">
              <span>Dry</span>
              <span>Wet</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-emerald-600" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Limiter Threshold</span>
        </div>
        <div className="flex items-center gap-4">
          <input 
            type="range" min="-60" max="0" step="1" value={limiterThreshold}
            onChange={(e) => setLimiterThreshold(parseInt(e.target.value))}
            className="w-32 h-1 bg-slate-100 rounded-full appearance-none cursor-pointer accent-emerald-600"
          />
          <span className="text-xs font-mono font-bold text-emerald-600 w-10">{limiterThreshold}dB</span>
        </div>
      </div>
    </div>
  );
};
