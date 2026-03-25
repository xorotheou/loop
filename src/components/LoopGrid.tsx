import React from 'react';
import { LoopCandidate } from '../types';
import { LoopCard } from './LoopCard';

interface LoopGridProps {
  loops: LoopCandidate[];
  globalPitch?: number;
  globalBpm?: number;
  onSimilaritySearch?: (loop: LoopCandidate) => void;
  onAddToSequencer?: (loop: LoopCandidate) => void;
  onStore?: (loop: LoopCandidate) => void;
  onEdit?: (loop: LoopCandidate) => void;
}

export const LoopGrid: React.FC<LoopGridProps> = ({ loops, globalPitch = 0, globalBpm = 120, onSimilaritySearch, onAddToSequencer, onStore, onEdit }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {(() => {
        const seenIds = new Set();
        return loops.map((loop) => {
          if (seenIds.has(loop.id)) {
            console.warn(`Duplicate key detected in LoopGrid: ${loop.id}`);
            return null;
          }
          seenIds.add(loop.id);
          return (
            <LoopCard 
              key={loop.id} 
              loop={loop} 
              initialPitch={globalPitch}
              initialBpm={globalBpm}
              onSimilaritySearch={onSimilaritySearch}
              onAddToSequencer={onAddToSequencer}
              onStore={onStore}
              onEdit={onEdit}
            />
          );
        }).filter(Boolean);
      })()}
    </div>
  );
};
