import React from 'react';
import { Stem } from '../types';
import { Trash2, Music, Clock, Activity, Upload, FileAudio, FolderOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface LibraryViewProps {
  stems: Stem[];
  onDelete: (id: string) => void;
  onUpload: () => void;
  onSelectStem: (id: string) => void;
  activeStemId: string | null;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ stems, onDelete, onUpload, onSelectStem, activeStemId }) => {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif italic text-slate-900">Audio Library</h2>
          <p className="text-slate-500 text-sm mt-1">Manage your uploaded stems and samples</p>
        </div>
        <button 
          onClick={onUpload}
          className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 transition-all group shadow-sm"
        >
          <Upload size={18} className="group-hover:-translate-y-0.5 transition-transform" />
          <span className="font-bold text-sm">Upload Files or ZIP</span>
        </button>
      </div>

      {stems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-[40px] bg-white/50">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
            <FolderOpen size={32} className="text-slate-300" />
          </div>
          <h3 className="text-xl font-serif italic text-slate-400">Your library is empty</h3>
          <p className="text-slate-400 text-sm mt-2 max-w-xs text-center">Upload audio files or ZIP archives to start discovering loops.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(() => {
            const seenIds = new Set();
            return stems.map((stem) => {
              if (seenIds.has(stem.id)) {
                console.warn(`Duplicate key detected in LibraryView: ${stem.id}`);
                return null;
              }
              seenIds.add(stem.id);
              return (
                <motion.div
                  key={stem.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "glass-card p-6 rounded-[32px] border transition-all group relative overflow-hidden",
                    activeStemId === stem.id ? "border-blue-500/50 bg-blue-50/50" : "border-slate-200/60 hover:border-slate-300"
                  )}
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-blue-500 transition-colors">
                        <FileAudio size={24} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{stem.name}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Stem</span>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(stem.id);
                      }}
                      className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <Clock size={12} />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Tempo</span>
                      </div>
                      <div className="text-lg font-mono text-slate-700">{stem.bpm} <span className="text-[10px] text-slate-400">BPM</span></div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 text-slate-400 mb-1">
                        <Music size={12} />
                        <span className="text-[9px] font-bold uppercase tracking-widest">Key</span>
                      </div>
                      <div className="text-lg font-mono text-slate-700">{stem.key}</div>
                    </div>
                  </div>

                  <button 
                    onClick={() => onSelectStem(stem.id)}
                    className={cn(
                      "w-full py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                      activeStemId === stem.id 
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                    )}
                  >
                    <Activity size={16} />
                    {activeStemId === stem.id ? "ACTIVE STEM" : "SELECT FOR DISCOVERY"}
                  </button>
                </motion.div>
              );
            }).filter(Boolean);
          })()}
        </div>
      )}
    </div>
  );
};
