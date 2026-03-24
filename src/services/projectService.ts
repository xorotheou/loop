import { openDB, IDBPDatabase } from 'idb';
import { LoopCandidate, Stem } from '../types';
import { audioEngine } from './audioEngine';
import { generateId } from '../lib/utils';

export interface ProjectMetadata {
  id: string;
  name: string;
  updatedAt: number;
  globalBpm: number;
  globalPitch: number;
}

export interface ProjectData extends ProjectMetadata {
  stems: {
    id: string;
    name: string;
    bpm: number;
    key: string;
    bufferData: ArrayBuffer[]; // One for each channel
    sampleRate: number;
  }[];
  loops: {
    id: string;
    stemId: string;
    startTime: number;
    duration: number;
    bpm: number;
    key: string;
    score: number;
    rhythmicDensity: number;
    grooveConsistency: number;
    hcdfStability: number;
    label?: string;
    tags?: string[];
    bufferData: ArrayBuffer[];
    sampleRate: number;
  }[];
  sequencerLoopIds: string[];
  storedLoopIds: string[];
  padSettings: Record<number, {
    pitch: number;
    volume: number;
    isLooping: boolean;
  }>;
  masterVolume: number;
}

class ProjectService {
  private dbName = 'LoopMasterProjects';
  private storeName = 'projects';
  private dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = openDB(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
      },
    });
  }

  private async bufferToData(buffer: AudioBuffer): Promise<ArrayBuffer[]> {
    const channels: ArrayBuffer[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i).buffer.slice(0));
    }
    return channels;
  }

  private dataToBuffer(channels: ArrayBuffer[], sampleRate: number): AudioBuffer {
    const buffer = audioEngine.ctx.createBuffer(
      channels.length,
      channels[0].byteLength / 4,
      sampleRate
    );
    for (let i = 0; i < channels.length; i++) {
      buffer.getChannelData(i).set(new Float32Array(channels[i]));
    }
    return buffer;
  }

  async saveProject(
    name: string,
    stems: Stem[],
    loops: LoopCandidate[],
    sequencerLoopIds: string[],
    storedLoopIds: string[],
    padSettings: Record<number, { pitch: number; volume: number; isLooping: boolean }>,
    globalBpm: number,
    globalPitch: number,
    masterVolume: number,
    existingId?: string
  ): Promise<string> {
    const id = existingId || generateId();
    const db = await this.dbPromise;

    const stemsData = await Promise.all(stems.map(async s => ({
      id: s.id,
      name: s.name,
      bpm: s.bpm,
      key: s.key,
      bufferData: await this.bufferToData(s.buffer),
      sampleRate: s.buffer.sampleRate
    })));

    const loopsData = await Promise.all(loops.map(async l => ({
      id: l.id,
      stemId: l.stemId || '',
      startTime: l.startTime,
      duration: l.duration,
      bpm: l.bpm,
      key: l.key,
      score: l.score,
      rhythmicDensity: l.rhythmicDensity,
      grooveConsistency: l.grooveConsistency,
      hcdfStability: l.hcdfStability,
      label: l.label,
      tags: l.tags,
      bufferData: await this.bufferToData(l.buffer),
      sampleRate: l.buffer.sampleRate
    })));

    const project: ProjectData = {
      id,
      name,
      updatedAt: Date.now(),
      globalBpm,
      globalPitch,
      stems: stemsData,
      loops: loopsData,
      sequencerLoopIds,
      storedLoopIds,
      padSettings,
      masterVolume
    };

    await db.put(this.storeName, project);
    return id;
  }

  async listProjects(): Promise<ProjectMetadata[]> {
    const db = await this.dbPromise;
    const all = await db.getAll(this.storeName);
    return all.map(p => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      globalBpm: p.globalBpm,
      globalPitch: p.globalPitch
    }));
  }

  async loadProject(id: string): Promise<{
    stems: Stem[];
    loops: LoopCandidate[];
    sequencerLoopIds: string[];
    storedLoopIds: string[];
    padSettings: Record<number, { pitch: number; volume: number; isLooping: boolean }>;
    globalBpm: number;
    globalPitch: number;
    masterVolume: number;
    name: string;
  }> {
    const db = await this.dbPromise;
    const data: ProjectData = await db.get(this.storeName, id);

    if (!data) throw new Error('Project not found');

    const stems: Stem[] = data.stems.map(s => ({
      id: s.id,
      name: s.name,
      bpm: s.bpm,
      key: s.key,
      buffer: this.dataToBuffer(s.bufferData, s.sampleRate)
    }));

    const loops: LoopCandidate[] = data.loops.map(l => ({
      id: l.id,
      stemId: l.stemId,
      startTime: l.startTime,
      duration: l.duration,
      bpm: l.bpm,
      key: l.key,
      score: l.score,
      rhythmicDensity: l.rhythmicDensity,
      grooveConsistency: l.grooveConsistency,
      hcdfStability: l.hcdfStability,
      label: l.label,
      tags: l.tags,
      buffer: this.dataToBuffer(l.bufferData, l.sampleRate)
    }));

    return {
      stems,
      loops,
      sequencerLoopIds: data.sequencerLoopIds,
      storedLoopIds: data.storedLoopIds || [],
      padSettings: data.padSettings || {},
      globalBpm: data.globalBpm,
      globalPitch: data.globalPitch,
      masterVolume: data.masterVolume || 0,
      name: data.name
    };
  }

  async deleteProject(id: string) {
    const db = await this.dbPromise;
    await db.delete(this.storeName, id);
  }
}

export const projectService = new ProjectService();
