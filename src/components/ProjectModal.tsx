import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Save, FolderOpen, Trash2, X, Clock, Music, Activity, CheckCircle2 } from 'lucide-react';
import { projectService, ProjectMetadata } from '../services/projectService';
import { LoopCandidate, Stem } from '../types';
import { cn } from '../lib/utils';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  stems: Stem[];
  loops: LoopCandidate[];
  sequencerLoops: LoopCandidate[];
  storedLoops: LoopCandidate[];
  padSettings: Record<number, { pitch: number; volume: number; isLooping: boolean }>;
  globalBpm: number;
  globalPitch: number;
  masterVolume: number;
  onLoad: (data: {
    stems: Stem[];
    loops: LoopCandidate[];
    sequencerLoopIds: string[];
    storedLoopIds: string[];
    padSettings: Record<number, { pitch: number; volume: number; isLooping: boolean }>;
    globalBpm: number;
    globalPitch: number;
    masterVolume: number;
    name: string;
  }) => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  stems,
  loops,
  sequencerLoops,
  storedLoops,
  padSettings,
  globalBpm,
  globalPitch,
  masterVolume,
  onLoad
}) => {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [projectName, setProjectName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadProjectList();
    }
  }, [isOpen]);

  const loadProjectList = async () => {
    const list = await projectService.listProjects();
    setProjects(list.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const handleSave = async () => {
    if (!projectName.trim()) return;
    setIsSaving(true);
    try {
      await projectService.saveProject(
        projectName,
        stems,
        loops,
        sequencerLoops.map(l => l.id),
        storedLoops.map(l => l.id),
        padSettings,
        globalBpm,
        globalPitch,
        masterVolume
      );
      setSaveSuccess(true);
      setProjectName('');
      loadProjectList();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const data = await projectService.loadProject(id);
      onLoad(data);
      onClose();
    } catch (error) {
      console.error('Load failed:', error);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deleteConfirmId === id) {
      await projectService.deleteProject(id);
      loadProjectList();
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-xl flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-2xl glass-card rounded-[40px] border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                  <FolderOpen size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-serif italic text-slate-800">Project Library</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Save & Load your creative sessions</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                <X size={24} />
              </button>
            </div>

            <div className="p-8 space-y-8 overflow-y-auto flex-1">
              {/* Save Section */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Save Current Session</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Enter project name..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-medium text-slate-700 focus:border-blue-500/50 outline-none transition-all placeholder:text-slate-300"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!projectName.trim() || isSaving}
                    className={cn(
                      "px-8 rounded-2xl font-bold text-sm transition-all flex items-center gap-2 shadow-xl",
                      saveSuccess 
                        ? "bg-emerald-600 text-white shadow-emerald-600/20" 
                        : "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {saveSuccess ? <CheckCircle2 size={18} /> : <Save size={18} />}
                    {saveSuccess ? "SAVED" : isSaving ? "SAVING..." : "SAVE"}
                  </button>
                </div>
              </div>

              {/* List Section */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saved Projects ({projects.length})</label>
                <div className="grid grid-cols-1 gap-3">
                  {projects.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                      <p className="text-slate-300 text-sm italic">No saved projects yet. Start by saving your current session.</p>
                    </div>
                  ) : (
                    (() => {
                      const seenIds = new Set();
                      return projects.map(project => {
                        if (seenIds.has(project.id)) {
                          console.warn(`Duplicate key detected in projects: ${project.id}`);
                          return null;
                        }
                        seenIds.add(project.id);
                        return (
                          <div
                            key={project.id}
                            onClick={() => handleLoad(project.id)}
                            className="group p-5 rounded-3xl bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-slate-200 transition-all cursor-pointer flex items-center justify-between"
                          >
                            <div className="flex items-center gap-5">
                              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-colors shadow-sm">
                                <Music size={20} />
                              </div>
                              <div className="flex flex-col gap-1">
                                <span className="text-sm font-bold text-slate-700">{project.name}</span>
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                  <span className="flex items-center gap-1"><Clock size={10} /> {new Date(project.updatedAt).toLocaleDateString()}</span>
                                  <span className="flex items-center gap-1"><Activity size={10} /> {project.globalBpm} BPM</span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDelete(e, project.id)}
                              className={cn(
                                "p-3 rounded-xl transition-all opacity-0 group-hover:opacity-100 flex items-center gap-2 text-xs font-bold",
                                deleteConfirmId === project.id 
                                  ? "bg-red-500 text-white opacity-100" 
                                  : "text-slate-200 hover:text-red-500 hover:bg-red-50"
                              )}
                            >
                              {deleteConfirmId === project.id ? "CONFIRM?" : <Trash2 size={18} />}
                            </button>
                          </div>
                        );
                      }).filter(Boolean);
                    })()
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
