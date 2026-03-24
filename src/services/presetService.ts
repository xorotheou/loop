import { openDB, IDBPDatabase } from 'idb';
import { Preset, ProcessingOptions } from '../types';
import { generateId } from '../lib/utils';

class PresetService {
  private dbName = 'LoopMasterPresets';
  private storeName = 'presets';
  private dbPromise: Promise<IDBPDatabase>;

  constructor() {
    this.dbPromise = openDB(this.dbName, 1, {
      upgrade(db) {
        db.createObjectStore('presets', { keyPath: 'id' });
      },
    });
  }

  async savePreset(name: string, options: ProcessingOptions, category: Preset['category']): Promise<Preset> {
    const db = await this.dbPromise;
    const preset: Preset = {
      id: generateId(),
      name,
      options,
      category,
      createdAt: Date.now(),
    };
    await db.put(this.storeName, preset);
    return preset;
  }

  async getPresets(category?: Preset['category']): Promise<Preset[]> {
    const db = await this.dbPromise;
    const all = await db.getAll(this.storeName);
    if (category) {
      return all.filter(p => p.category === category);
    }
    return all;
  }

  async deletePreset(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete(this.storeName, id);
  }
}

export const presetService = new PresetService();
