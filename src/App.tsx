import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, Download, Zap, RefreshCw, FileAudio, Loader2, Search, Bell, User, LayoutDashboard, Activity, CheckCircle2, Info, Layers, Sliders, Scissors, Music, Clock, Play, Square, FolderOpen, Plus, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { audioEngine } from './services/audioEngine';
import { loopDiscovery } from './services/loopDiscovery';
import { LoopCandidate, ProcessingProgress, Stem } from './types';
import { LoopGrid } from './components/LoopGrid';
import { ManualSlicer } from './components/ManualSlicer';
import { ProjectModal } from './components/ProjectModal';
import { DiscoveryConfigModal } from './components/DiscoveryConfigModal';
import { LibraryView } from './components/LibraryView';
import { JamView } from './components/JamView';
import { WaveformView } from './components/WaveformView';
import { exportLoopsAsZip } from './lib/exportUtils';
import { aiService } from './services/aiService';
import { jamAiService } from './services/jamAiService';
import { chordAiService } from './services/chordAiService';
import { voiceControlService } from './services/voiceControlService';
import { cn, generateId } from './lib/utils';
import { ChordSuggestion } from './types';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LoopEditor } from './components/LoopEditor';
import { io, Socket } from 'socket.io-client';

import JSZip from 'jszip';

export default function App() {
  const [activeView, setActiveView] = useState<'discovery' | 'library' | 'jam'>('discovery');
  const [storedLoops, setStoredLoops] = useState<LoopCandidate[]>([]);
  const [padSettings, setPadSettings] = useState<Record<number, { pitch: number; volume: number; isLooping: boolean }>>({});
  const [masterVolume, setMasterVolume] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [loops, setLoops] = useState<LoopCandidate[]>([]);
  const [stems, setStems] = useState<Stem[]>([]);
  const [activeStemId, setActiveStemId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSlicer, setShowSlicer] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showDiscoveryConfig, setShowDiscoveryConfig] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [originalLoops, setOriginalLoops] = useState<LoopCandidate[]>([]);
  
  // Sequencer State
  const [sequencerLoops, setSequencerLoops] = useState<LoopCandidate[]>([]);
  const [isJamming, setIsJamming] = useState(false);
  
  // Global Processing States
  const [globalPitch, setGlobalPitch] = useState(0);
  const [globalBpm, setGlobalBpm] = useState(120);
  const [projectKey, setProjectKey] = useState('C Major');
  const [isNative, setIsNative] = useState(false);

  // WebSocket & AI Suggestion State
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [isShared, setIsShared] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isGettingSuggestion, setIsGettingSuggestion] = useState(false);
  
  // New Features State
  const [isVoiceControlActive, setIsVoiceControlActive] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [chordSuggestions, setChordSuggestions] = useState<ChordSuggestion[]>([]);
  const [isGettingChords, setIsGettingChords] = useState(false);
  const [activeSamplerLoop, setActiveSamplerLoop] = useState<LoopCandidate | null>(null);
  const [editingLoop, setEditingLoop] = useState<LoopCandidate | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('state-updated', (remoteState: any) => {
      // Sync state from other users
      if (remoteState.sequencerLoops) {
        // We'd need to reconstruct the buffers here if we were sending them,
        // but for now we'll just sync the loop IDs or metadata.
        console.log("Remote state received:", remoteState);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const joinRoom = (id: string) => {
    if (socket && id) {
      socket.emit('join-room', id);
      setRoomId(id);
      setIsShared(true);
    }
  };

  const syncState = useCallback(() => {
    if (socket && isShared && roomId) {
      socket.emit('sync-state', {
        roomId,
        state: {
          sequencerLoops: sequencerLoops.map(l => ({ id: l.id, startTime: l.startTime })),
          globalBpm,
          globalPitch
        }
      });
    }
  }, [socket, isShared, roomId, sequencerLoops, globalBpm, globalPitch]);

  const toggleVoiceControl = async () => {
    if (isVoiceControlActive) {
      voiceControlService.stop();
      setIsVoiceControlActive(false);
      setVoiceStatus(null);
    } else {
      await voiceControlService.start(setVoiceStatus);
      setIsVoiceControlActive(true);
    }
  };

  const getChordSuggestions = async () => {
    setIsGettingChords(true);
    const chords = await chordAiService.suggestChords('C Major', globalBpm);
    setChordSuggestions(chords);
    setIsGettingChords(false);
  };

  const loadToSampler = async (loop: LoopCandidate) => {
    await audioEngine.loadSampler(loop.buffer);
    setActiveSamplerLoop(loop);
  };

  const playChord = (chord: ChordSuggestion) => {
    audioEngine.triggerSamplerChord(chord.notes, chord.duration, undefined, chord.velocity);
  };

  useEffect(() => {
    syncState();
  }, [sequencerLoops, globalBpm, globalPitch, syncState]);

  const getAiSuggestion = async () => {
    setIsGettingSuggestion(true);
    const suggestion = await jamAiService.suggestLoopFill(sequencerLoops, globalBpm);
    setAiSuggestion(suggestion);
    setIsGettingSuggestion(false);
  };

  const splitStem = async (stem: Stem) => {
    setIsProcessing(true);
    setProgress({ status: 'Splitting Stems (HPSS)...', progress: 30 });
    
    try {
      // 1. Convert buffer to WAV blob
      const wavBlob = await audioEngine.bufferToWav(stem.buffer);
      const formData = new FormData();
      formData.append('file', wavBlob, 'stem.wav');

      // 2. Call backend split-stems
      const response = await fetch('/api/split-stems', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error("Stem Separation Failed");
      const data = await response.json();

      // 3. Decode base64 results back to AudioBuffers
      const hBuffer = await audioEngine.decodeBase64(data.harmonic);
      const pBuffer = await audioEngine.decodeBase64(data.percussive);

      // 4. Create new stems
      const hStem: Stem = {
        ...stem,
        id: generateId(),
        name: `${stem.name} (Harmonic)`,
        buffer: hBuffer
      };
      const pStem: Stem = {
        ...stem,
        id: generateId(),
        name: `${stem.name} (Percussive)`,
        buffer: pBuffer
      };

      setStems(prev => [...prev, hStem, pStem]);
      setActiveStemId(hStem.id);
      
      setProgress({ status: 'Stems Split Successfully!', progress: 100 });
      setTimeout(() => setProgress(null), 1000);
    } catch (err) {
      console.error("Stem Split Error:", err);
      setProgress({ status: 'Split Failed', progress: 0 });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const platform = Capacitor.getPlatform();
    setIsNative(platform !== 'web');

    if (platform !== 'web') {
      // Initialize Native UI
      StatusBar.setStyle({ style: Style.Light });
      StatusBar.setBackgroundColor({ color: '#f8fafc' });
      SplashScreen.hide();

      const backListener = CapApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack) {
          CapApp.exitApp();
        } else {
          window.history.back();
        }
      });

      return () => {
        backListener.then(l => l.remove());
      };
    }
  }, []);

  const triggerHaptic = async () => {
    if (isNative) {
      await Haptics.impact({ style: ImpactStyle.Light });
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    await audioEngine.init();
    setIsProcessing(true);
    const newStems: Stem[] = [];
    
    const allFiles: File[] = Array.from(files);
    const audioFiles: { name: string; data: ArrayBuffer }[] = [];

    for (const file of allFiles) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        setProgress({ status: `Unzipping ${file.name}...`, progress: 10 });
        try {
          const zip = await JSZip.loadAsync(file);
          const entries = Object.values(zip.files);
          for (const entry of entries) {
            if (!entry.dir && (entry.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i))) {
              const data = await entry.async('arraybuffer');
              audioFiles.push({ name: entry.name.split('/').pop() || entry.name, data });
            }
          }
        } catch (err) {
          console.error('Failed to unzip:', file.name);
        }
      } else if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) {
        const data = await file.arrayBuffer();
        audioFiles.push({ name: file.name, data });
      }
    }
    
    for (let i = 0; i < audioFiles.length; i++) {
      const { name, data } = audioFiles[i];
      setProgress({ status: `Decoding ${name}...`, progress: Math.round((i / audioFiles.length) * 100) });
      
      try {
        const buffer = await audioEngine.decodeAudio(data);
        const bpm = loopDiscovery.detectBpm(buffer);
        const key = loopDiscovery.detectKey(buffer);
        
        const stem: Stem = {
          id: generateId(),
          name,
          buffer,
          bpm,
          key,
          blob: new Blob([data])
        };
        newStems.push(stem);
      } catch (err) {
        console.error('Failed to decode:', name);
      }
    }

    setStems(prev => {
      const combined = [...prev, ...newStems];
      const seen = new Set();
      return combined.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    });
    if (newStems.length > 0 && !activeStemId) {
      setActiveStemId(newStems[0].id);
      setGlobalBpm(newStems[0].bpm);
    }
    
    setIsProcessing(false);
    setProgress(null);
  };

  const runDiscovery = async (stem: Stem, timeRange?: { start: number; end: number }, overrideAiMode?: boolean) => {
    setIsProcessing(true);
    setProgress({ status: `Analyzing ${stem.name}...`, progress: 40 });
    
    try {
      const effectiveAiMode = overrideAiMode !== undefined ? overrideAiMode : aiMode;
      const discoveredLoops = await loopDiscovery.discoverLoops(stem.buffer, timeRange, stem.blob, effectiveAiMode);
      const loopsWithStemId = discoveredLoops.map(l => ({ ...l, stemId: stem.id }));
      
      // AI Labeling for top 3 loops
      setProgress({ status: 'AI Labeling...', progress: 80 });
      const labeledLoops = await Promise.all(
        loopsWithStemId.map(async (l, i) => {
          if (i < 3) {
            const aiData = await aiService.labelLoop(l);
            return { ...l, label: aiData.label, tags: aiData.tags };
          }
          return l;
        })
      );

      const updateLoops = (prev: LoopCandidate[]) => {
        const combined = [...prev, ...labeledLoops];
        const seen = new Set();
        return combined.filter(l => {
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });
      };

      setLoops(updateLoops);
      setOriginalLoops(updateLoops);
      setProgress({ status: 'Ready', progress: 100 });
    } catch (error) {
      console.error('Discovery failed:', error);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(null), 1000);
    }
  };

  const handleDiscoveryStart = async (config: { applyToAll: boolean; timeRange?: { start: number; end: number } }) => {
    if (config.applyToAll) {
      for (const stem of stems) {
        await runDiscovery(stem, config.timeRange);
      }
    } else if (activeStem) {
      await runDiscovery(activeStem, config.timeRange);
    }
  };

  const handleSimilaritySearch = (targetLoop: LoopCandidate) => {
    const similar = originalLoops
      .filter(l => l.id !== targetLoop.id)
      .map(l => ({
        loop: l,
        similarity: loopDiscovery.calculateSimilarity(targetLoop, l)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 6)
      .map(item => item.loop);
    
    // Ensure uniqueness even in similarity results
    const uniqueSimilar = similar.filter((l, i, self) => self.findIndex(t => t.id === l.id) === i);
    setLoops(uniqueSimilar);
    setIsSearchActive(true);
  };

  const resetSearch = () => {
    // Ensure originalLoops is unique when resetting
    setLoops(prev => {
      const seen = new Set();
      return originalLoops.filter(l => {
        if (seen.has(l.id)) return false;
        seen.add(l.id);
        return true;
      });
    });
    setIsSearchActive(false);
  };

  const handleLoadProject = (data: {
    stems: Stem[];
    loops: LoopCandidate[];
    sequencerLoopIds: string[];
    storedLoopIds: string[];
    padSettings: Record<number, { pitch: number; volume: number; isLooping: boolean }>;
    globalBpm: number;
    globalPitch: number;
    masterVolume: number;
    name: string;
  }) => {
    const uniqueStems = data.stems.filter((s, i, self) => self.findIndex(t => t.id === s.id) === i);
    const uniqueLoops = data.loops.filter((l, i, self) => self.findIndex(t => t.id === l.id) === i);
    
    setStems(uniqueStems);
    setLoops(uniqueLoops);
    setOriginalLoops(uniqueLoops);
    setGlobalBpm(data.globalBpm);
    setGlobalPitch(data.globalPitch);
    setMasterVolume(data.masterVolume);
    setPadSettings(data.padSettings);
    
    // Restore sequencer and stored loops with uniqueness check
    const seqLoops = Array.from(new Set(data.sequencerLoopIds))
      .map(id => uniqueLoops.find(l => l.id === id))
      .filter((l): l is LoopCandidate => !!l);
    setSequencerLoops(seqLoops);

    // Reconstruct stored loops from IDs
    const stored = Array.from(new Set(data.storedLoopIds))
      .map(id => uniqueLoops.find(l => l.id === id))
      .filter((l): l is LoopCandidate => !!l);
    setStoredLoops(stored);
    
    if (uniqueStems.length > 0) {
      setActiveStemId(uniqueStems[0].id);
    }
  };

  const addToSequencer = (loop: LoopCandidate) => {
    setSequencerLoops(prev => {
      if (prev.length >= 4) return prev;
      if (prev.some(l => l.id === loop.id)) return prev;
      return [...prev, loop];
    });
  };

  const removeFromSequencer = (id: string) => {
    setSequencerLoops(prev => prev.filter(l => l.id !== id));
  };

  const deleteStem = (id: string) => {
    setStems(prev => prev.filter(s => s.id !== id));
    setLoops(prev => prev.filter(l => l.stemId !== id));
    if (activeStemId === id) {
      setActiveStemId(null);
    }
  };

  const storeLoop = (loop: LoopCandidate) => {
    setStoredLoops(prev => {
      if (prev.length >= 16) return prev;
      if (prev.some(l => l.id === loop.id)) return prev;
      return [...prev, loop];
    });
  };

  const toggleJam = async () => {
    await triggerHaptic();
    if (isJamming) {
      audioEngine.stopJam();
      setIsJamming(false);
    } else {
      await audioEngine.startJam(sequencerLoops, globalBpm);
      setIsJamming(true);
    }
  };

  // Smooth BPM updates
  useEffect(() => {
    if (isJamming) {
      audioEngine.updateJamBpm(globalBpm);
    }
  }, [globalBpm]);

  // Restart jam when loops change
  useEffect(() => {
    if (isJamming) {
      audioEngine.startJam(sequencerLoops, globalBpm);
    }
  }, [sequencerLoops]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = (Array.from(e.dataTransfer.files) as File[]).filter((f: File) => f.type.startsWith('audio/'));
    if (files.length > 0) {
      processFiles(files);
    }
  }, []);

  const handleExport = async () => {
    await triggerHaptic();
    const loopsToExport = activeStemId 
      ? loops.filter(l => l.stemId === activeStemId)
      : loops;
      
    if (loopsToExport.length === 0) return;
    
    setIsProcessing(true);
    setProgress({ status: 'Generating ZIP...', progress: 50 });
    
    try {
      const blob = await exportLoopsAsZip(loopsToExport);
      const fileName = `LoopMaster_AI_Export_${Date.now()}.zip`;

      if (isNative) {
        // Native Export using Filesystem and Share
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache
          });

          await Share.share({
            title: 'Export Loops',
            text: 'Here are your extracted loops from LoopMaster AI',
            url: savedFile.uri,
            dialogTitle: 'Share Loops'
          });
        };
      } else {
        // Web Export
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const activeStem = stems.find(s => s.id === activeStemId);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex overflow-hidden">
      <div className="atmosphere" />
      
      {/* Sidebar Navigation */}
      <aside className="w-20 lg:w-64 border-r border-slate-200 flex flex-col items-center lg:items-stretch py-8 px-4 gap-8 relative z-50 bg-white/40 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap size={24} fill="white" className="text-white" />
          </div>
          <h1 className="text-xl font-serif italic text-slate-800 hidden lg:block tracking-tight">LoopMaster AI</h1>
        </div>

        {/* AI Mode Toggle */}
        <div className="px-4 py-2 bg-white/60 rounded-2xl border border-slate-200/50 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${aiMode ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <Zap size={14} />
              </div>
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">AI Adjudication</span>
            </div>
            <button 
              onClick={() => setAiMode(!aiMode)}
              className={`w-10 h-5 rounded-full relative transition-colors duration-200 ${aiMode ? 'bg-blue-500' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-200 ${aiMode ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 leading-tight">
            Use Gemini to judge DSP candidates and reject false positives.
          </p>
        </div>

        <nav className="flex flex-col gap-2 flex-1 w-full">
          <NavButton 
            active={activeView === 'discovery'} 
            onClick={() => setActiveView('discovery')}
            icon={<Zap size={20} />}
            label="Discovery"
            triggerHaptic={triggerHaptic}
          />
          <NavButton 
            active={activeView === 'library'} 
            onClick={() => setActiveView('library')}
            icon={<FolderOpen size={20} />}
            label="Library"
            triggerHaptic={triggerHaptic}
          />
          <NavButton 
            active={activeView === 'jam'} 
            onClick={() => setActiveView('jam')}
            icon={<Activity size={20} />}
            label="Jam Station"
            triggerHaptic={triggerHaptic}
          />
        </nav>

        <div className="mt-auto space-y-4 w-full">
          <div className="p-4 bg-slate-100 rounded-2xl border border-slate-200 hidden lg:block">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Clock size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Session Time</span>
            </div>
            <div className="text-xl font-mono text-slate-700">02:45:12</div>
          </div>
          <div className="flex items-center gap-4 px-4">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 shrink-0">
              <img src="https://picsum.photos/seed/alex/100/100" alt="User" referrerPolicy="no-referrer" />
            </div>
            <div className="hidden lg:block truncate">
              <div className="text-xs font-bold text-slate-800">Alex Morgan</div>
              <div className="text-[9px] text-slate-400 uppercase font-bold tracking-widest">Lead Producer</div>
            </div>
          </div>
          {isNative && (
            <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Native Mode</span>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-y-auto relative z-10">
        <nav className="sticky top-0 z-50 bg-white/60 backdrop-blur-xl border-b border-slate-200 px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="text-sm font-bold text-slate-400 uppercase tracking-[0.3em]">
                {activeView.toUpperCase()}
              </div>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-4">
              <button 
                onClick={async () => {
                  await triggerHaptic();
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
              >
                <Upload size={18} />
                UPLOAD AUDIO
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => e.target.files && processFiles(e.target.files)} 
                multiple 
                accept="audio/*,.zip" 
                className="hidden" 
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            {activeView === 'jam' && (
              <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                <input 
                  type="text" 
                  placeholder="Room ID" 
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="bg-transparent text-[10px] font-mono px-2 w-24 outline-none"
                />
                <button 
                  onClick={() => joinRoom(roomId)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all",
                    isShared ? "bg-emerald-500 text-white" : "bg-white text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {isShared ? 'CONNECTED' : 'JOIN JAM'}
                </button>
              </div>
            )}
            <button 
              onClick={() => setShowProjectModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 border border-slate-200 transition-all"
            >
              <FolderOpen size={18} />
              PROJECTS
            </button>
            <button className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all">
              <Bell size={22} />
            </button>
          </div>
        </nav>

        <main className="p-8 pb-32">
          <AnimatePresence mode="wait">
            {activeView === 'discovery' && (
              <motion.div
                key="discovery"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-10"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatCard title="Stems Loaded" value={stems.length.toString()} icon={<FileAudio size={20} />} color="blue" />
                  <StatCard title="Loops Found" value={loops.length.toString()} icon={<Layers size={20} />} color="emerald" />
                  <StatCard title="Avg BPM" value={stems.length > 0 ? (stems.reduce((acc, s) => acc + s.bpm, 0) / stems.length).toFixed(0) : "0"} icon={<Activity size={20} />} color="orange" />
                  <StatCard title="Jam Slots" value={`${sequencerLoops.length}/4`} icon={<Music size={20} />} color="indigo" />
                </div>

                <div className="flex items-end justify-between">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-4xl font-serif font-light tracking-tight text-slate-800 italic">Stem Processing</h2>
                    <div className="flex items-center gap-3">
                      <div className="h-px w-8 bg-blue-500/50" />
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                        {stems.length} STEMS LOADED • {loops.length} LOOPS EXTRACTED
                      </div>
                    </div>
                  </div>

                  {stems.length > 0 && (
                    <div className="flex gap-4 bg-slate-100 p-2 rounded-2xl border border-slate-200">
                      <div className="flex flex-col px-4 border-r border-slate-200">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global Pitch</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => setGlobalPitch(p => Math.max(-12, p - 1))} className="text-slate-400 hover:text-slate-900">-</button>
                          <span className="text-sm font-mono font-bold text-blue-600 w-8 text-center">{globalPitch > 0 ? `+${globalPitch}` : globalPitch}</span>
                          <button onClick={() => setGlobalPitch(p => Math.min(12, p + 1))} className="text-slate-400 hover:text-slate-900">+</button>
                        </div>
                      </div>
                      <div className="flex flex-col px-4">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Global BPM</span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => setGlobalBpm(b => Math.max(40, b - 1))} className="text-slate-400 hover:text-slate-900">-</button>
                          <span className="text-sm font-mono font-bold text-orange-600 w-12 text-center">{globalBpm}</span>
                          <button onClick={() => setGlobalBpm(b => Math.min(240, b + 1))} className="text-slate-400 hover:text-slate-900">+</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-3 space-y-6">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Stems</h3>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => activeStem && splitStem(activeStem)}
                          disabled={!activeStem || isProcessing}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-all"
                          title="Split Harmonic/Percussive"
                        >
                          <Scissors size={14} />
                        </button>
                        <button onClick={() => setShowDiscoveryConfig(true)} className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all">
                          <Sliders size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {(() => {
                        const seenIds = new Set();
                        return stems.map(stem => {
                          if (seenIds.has(stem.id)) return null;
                          seenIds.add(stem.id);
                          return (
                            <button
                              key={stem.id}
                              onClick={() => setActiveStemId(stem.id)}
                              className={cn(
                                "w-full p-4 rounded-2xl border transition-all flex items-center justify-between group",
                                activeStemId === stem.id 
                                  ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20" 
                                  : "bg-slate-100 border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-200/50"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <FileAudio size={18} className={activeStemId === stem.id ? "text-white" : "text-slate-400 group-hover:text-blue-500"} />
                                <div className="flex flex-col items-start">
                                  <span className="text-xs font-bold truncate max-w-[120px]">{stem.name}</span>
                                  <span className="text-[9px] opacity-60 uppercase tracking-widest font-bold">{stem.bpm} BPM • {stem.key}</span>
                                </div>
                              </div>
                              {activeStemId === stem.id && <Zap size={14} fill="white" />}
                            </button>
                          );
                        }).filter(Boolean);
                      })()}
                    </div>
                  </div>

                  <div className="lg:col-span-9 space-y-8">
                    {activeStemId && stems.find(s => s.id === activeStemId) && (
                      <div className="glass-card rounded-[40px] p-10 border-slate-200 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Activity size={120} />
                        </div>
                        <div className="relative z-10 space-y-8">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/40">
                                <FileAudio size={28} className="text-white" />
                              </div>
                              <div>
                                <h3 className="text-2xl font-serif italic text-slate-800">{stems.find(s => s.id === activeStemId)?.name}</h3>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Discovery Mode</span>
                                  <div className="w-1 h-1 rounded-full bg-slate-200" />
                                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Ready to Analyze</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-3">
                              <button 
                                onClick={() => setShowSlicer(true)}
                                className="px-6 py-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-all flex items-center gap-2"
                              >
                                <Scissors size={18} />
                                MANUAL SLICE
                              </button>
                              <button 
                                onClick={() => runDiscovery(stems.find(s => s.id === activeStemId)!, undefined, false)}
                                className="px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                                title="Run DSP analysis without AI adjudication"
                              >
                                <RefreshCw size={18} className={isProcessing ? "animate-spin" : ""} />
                                DSP DETECTION
                              </button>
                              <button 
                                onClick={() => runDiscovery(stems.find(s => s.id === activeStemId)!)}
                                className="px-8 py-3 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl"
                              >
                                <Zap size={18} className={isProcessing ? "animate-spin" : ""} />
                                {aiMode ? 'AI DISCOVERY' : 'RUN DISCOVERY'}
                              </button>
                            </div>
                          </div>
                          <div className="h-40 bg-slate-100 rounded-3xl border border-slate-200 overflow-hidden">
                            <WaveformView buffer={stems.find(s => s.id === activeStemId)!.buffer} bpm={stems.find(s => s.id === activeStemId)!.bpm} showGrid />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-6">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Discovered Loops</h3>
                          <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-600 uppercase tracking-widest">
                            {loops.length} Results
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 text-slate-400">
                            <Search size={14} />
                            <input type="text" placeholder="Filter by tag..." className="bg-transparent border-none text-xs font-bold focus:ring-0 placeholder:text-slate-400" />
                          </div>
                          <button 
                            onClick={handleExport}
                            className="flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest"
                          >
                            <Download size={14} />
                            Export All
                          </button>
                        </div>
                      </div>
                      
                      <LoopGrid 
                        loops={loops} 
                        globalPitch={globalPitch} 
                        globalBpm={globalBpm}
                        onAddToSequencer={addToSequencer}
                        onStore={storeLoop}
                        onEdit={setEditingLoop}
                      />
                    </div>
                  </div>
                </div>

                {/* Jam Mode Overlay */}
                <div className="fixed bottom-10 left-[calc(50%+40px)] lg:left-[calc(50%+128px)] -translate-x-1/2 z-40">
                  <div className="glass-card rounded-full p-2 border-slate-200 flex items-center gap-2 shadow-2xl shadow-slate-200/50">
            <div className="flex -space-x-3 px-4">
              {(() => {
                const seenIds = new Set();
                return sequencerLoops.map((loop) => {
                  if (seenIds.has(loop.id)) {
                    console.warn(`Duplicate key detected in sequencerLoops: ${loop.id}`);
                    return null;
                  }
                  seenIds.add(loop.id);
                  return (
                    <div key={loop.id} className="w-10 h-10 rounded-full border-2 border-slate-50 bg-blue-600 flex items-center justify-center text-white shadow-xl">
                      <Music size={16} />
                    </div>
                  );
                }).filter(Boolean);
              })()}
              {Array.from({ length: Math.max(0, 4 - sequencerLoops.length) }).map((_, i) => (
                <div key={`placeholder-${i}`} className="w-10 h-10 rounded-full border-2 border-slate-50 bg-slate-100 flex items-center justify-center text-slate-400 border-dashed">
                  <Plus size={16} />
                </div>
              ))}
            </div>
                    <button 
                      onClick={toggleJam}
                      disabled={sequencerLoops.length === 0}
                      className={cn(
                        "h-12 px-8 rounded-full font-bold text-sm transition-all flex items-center gap-2",
                        isJamming ? "bg-red-500 text-white animate-pulse" : "bg-slate-900 text-white hover:bg-slate-800"
                      )}
                    >
                      {isJamming ? <Square size={16} fill="white" /> : <Play size={16} fill="white" />}
                      {isJamming ? "STOP JAM" : "START JAM"}
                    </button>
                    {isJamming && (
                      <div className="px-6 border-l border-slate-200 flex flex-col">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Master Tempo</span>
                        <span className="text-sm font-mono font-bold text-blue-600">{globalBpm} BPM</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeView === 'library' && (
              <motion.div
                key="library"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <LibraryView 
                  stems={stems} 
                  onDelete={deleteStem} 
                  onUpload={() => fileInputRef.current?.click()}
                  onSelectStem={(id) => {
                    setActiveStemId(id);
                    setActiveView('discovery');
                  }}
                  activeStemId={activeStemId}
                />
              </motion.div>
            )}

            {activeView === 'jam' && (
              <motion.div
                key="jam"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-10"
              >
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[32px] p-8 text-white shadow-2xl shadow-blue-600/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Sparkles size={120} />
                  </div>
                  <div className="relative z-10 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-serif italic">AI Jam Assistant</h3>
                        <p className="text-blue-100 text-xs opacity-80">Get suggestions for your current jam session</p>
                      </div>
                      <button 
                        onClick={getAiSuggestion}
                        disabled={isGettingSuggestion}
                        className={cn(
                          "px-6 py-3 rounded-2xl bg-white text-blue-600 font-bold text-xs flex items-center gap-2 hover:bg-blue-50 transition-all shadow-xl",
                          isGettingSuggestion && "animate-pulse"
                        )}
                      >
                        <Sparkles size={18} />
                        {isGettingSuggestion ? 'ANALYZING...' : 'SUGGEST LOOP FILL'}
                      </button>
                    </div>

                    {aiSuggestion && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 space-y-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {aiSuggestion.split('\n').map((line, i) => {
                            if (line.startsWith('SUGGESTION:')) return (
                              <div key={i} className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Suggestion</span>
                                <p className="text-sm font-bold">{line.replace('SUGGESTION:', '').trim()}</p>
                              </div>
                            );
                            if (line.startsWith('REASON:')) return (
                              <div key={i} className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Reasoning</span>
                                <p className="text-[11px] leading-relaxed opacity-90">{line.replace('REASON:', '').trim()}</p>
                              </div>
                            );
                            if (line.startsWith('PROMPT:')) return (
                              <div key={i} className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">AI Prompt</span>
                                <div className="bg-black/20 p-2 rounded-lg text-[10px] font-mono italic">
                                  {line.replace('PROMPT:', '').trim()}
                                </div>
                              </div>
                            );
                            return null;
                          })}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                <JamView 
                  storedLoops={storedLoops} 
                  padSettings={padSettings}
                  setPadSettings={setPadSettings}
                  masterVolume={masterVolume}
                  setMasterVolume={setMasterVolume}
                  masterBpm={globalBpm}
                  setMasterBpm={setGlobalBpm}
                  projectKey={projectKey}
                  setProjectKey={setProjectKey}
                  onEdit={setEditingLoop}
                  isVoiceControlActive={isVoiceControlActive}
                  voiceStatus={voiceStatus}
                  toggleVoiceControl={toggleVoiceControl}
                  chordSuggestions={chordSuggestions}
                  isGettingChords={isGettingChords}
                  getChordSuggestions={getChordSuggestions}
                  playChord={playChord}
                  activeSamplerLoop={activeSamplerLoop}
                  loadToSampler={loadToSampler}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

      <AnimatePresence>
        {progress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="w-full max-md p-10 glass-card rounded-[40px] border-slate-200">
              <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-serif italic text-slate-800">{progress.status}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Processing Engine v2.5</p>
                </div>
                <span className="text-2xl font-light text-blue-600">{progress.progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.progress}%` }}
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 shadow-[0_0_20px_rgba(37,99,235,0.5)]"
                />
              </div>
            </div>
          </motion.div>
        )}

        {showSlicer && activeStem && (
          <ManualSlicer 
            stem={activeStem} 
            onClose={() => setShowSlicer(false)}
            onExtract={(loop) => {
              const updateFn = (prev: LoopCandidate[]) => {
                const combined = [...prev, loop];
                const seen = new Set();
                return combined.filter(l => {
                  if (seen.has(l.id)) return false;
                  seen.add(l.id);
                  return true;
                });
              };
              setLoops(updateFn);
              setOriginalLoops(updateFn);
            }}
          />
        )}

        <ProjectModal
          isOpen={showProjectModal}
          onClose={() => setShowProjectModal(false)}
          stems={stems}
          loops={loops}
          sequencerLoops={sequencerLoops}
          storedLoops={storedLoops}
          padSettings={padSettings}
          globalBpm={globalBpm}
          globalPitch={globalPitch}
          masterVolume={masterVolume}
          onLoad={handleLoadProject}
        />

        {activeStem && (
          <DiscoveryConfigModal
            isOpen={showDiscoveryConfig}
            onClose={() => setShowDiscoveryConfig(false)}
            activeStem={activeStem}
            stems={stems}
            onStart={handleDiscoveryStart}
          />
        )}
        {/* Loop Editor Overlay */}
        <AnimatePresence>
          {editingLoop && (
            <LoopEditor 
              loop={editingLoop}
              projectKey={projectKey}
              onClose={() => setEditingLoop(null)}
              onSave={(updated) => {
                // Update loop in library/sequencer
                setEditingLoop(null);
              }}
            />
          )}
        </AnimatePresence>
      </AnimatePresence>
      </div>
    </div>
  );
}

function NavButton({ active, onClick, icon, label, triggerHaptic }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, triggerHaptic: () => Promise<void> }) {
  return (
    <button
      onClick={async () => {
        await triggerHaptic();
        onClick();
      }}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group",
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <div className={cn(
        "transition-transform group-hover:scale-110",
        active ? "text-white" : "text-slate-400 group-hover:text-blue-500"
      )}>
        {icon}
      </div>
      <span className="text-xs font-bold tracking-wide hidden lg:block">{label}</span>
    </button>
  );
}

function StatCard({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: string }) {
  const colorMap: any = {
    blue: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
    emerald: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
    orange: 'text-orange-600 bg-orange-500/10 border-orange-500/20',
    indigo: 'text-indigo-600 bg-indigo-500/10 border-indigo-500/20',
  };
  
  return (
    <div className="glass-card p-8 rounded-[32px] flex flex-col gap-4 group hover:bg-slate-50 transition-all duration-500">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{title}</span>
        <div className={cn("p-2.5 rounded-xl border transition-all duration-500 group-hover:scale-110", colorMap[color])}>
          {icon}
        </div>
      </div>
      <div className="text-4xl font-serif italic font-light text-slate-800">{value}</div>
      <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-2">
        <div className={cn("h-full transition-all duration-1000", 
          color === 'blue' ? 'bg-blue-500' : 
          color === 'emerald' ? 'bg-emerald-500' : 
          color === 'orange' ? 'bg-orange-500' : 
          'bg-indigo-500')} 
          style={{ width: '65%' }} 
        />
      </div>
    </div>
  );
}

function ActionItem({ icon, title }: { icon: React.ReactNode, title: string }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-100 transition-all cursor-pointer group border border-transparent hover:border-slate-200">
      <div className="shrink-0 transition-transform group-hover:scale-110">{icon}</div>
      <div className="text-sm font-medium text-slate-500 group-hover:text-slate-800 transition-colors">{title}</div>
    </div>
  );
}
