import Meyda from 'meyda';
import { audioEngine } from './audioEngine';
import { LoopCandidate } from '../types';
import { generateId } from '../lib/utils';

/**
 * MIR Logic for Loop Discovery
 */
import { loopAdjudicator } from "./loopAdjudicator";

export class LoopDiscovery {
  
  /**
   * Analyze a buffer to find the top 10 loops
   */
  async discoverLoops(buffer: AudioBuffer, timeRange?: { start: number; end: number }, blob?: Blob, aiMode: boolean = false): Promise<LoopCandidate[]> {
    if (blob) {
      try {
        const candidates = await this.discoverLoopsFromBackend(blob, buffer);
        
        if (aiMode && candidates.length > 0) {
          const fileMetadata = {
            name: 'audio_file',
            duration: buffer.duration,
            sampleRate: buffer.sampleRate
          };
          
          const adjudication = await loopAdjudicator.adjudicate(fileMetadata, candidates);
          if (adjudication) {
            return candidates.map((c, i) => {
              const assessment = adjudication.candidate_assessments.find((a: any) => a.candidate_id === c.id || a.candidate_id === `c${i}`);
              return {
                ...c,
                aiClassification: assessment?.classification || adjudication.global_classification,
                aiDecision: assessment?.accepted ? 'accept' : 'reject',
                aiReasoning: adjudication.final_reasoning,
                aiConfidence: adjudication.confidence,
                needsReview: adjudication.needs_human_review || !assessment?.accepted
              };
            });
          }
        }
        
        return candidates;
      } catch (err) {
        console.warn('Backend discovery failed, falling back to local analysis:', err);
      }
    }
    
    const sampleRate = buffer.sampleRate;
    const fullChannelData = buffer.getChannelData(0);
    
    const startOffset = timeRange ? Math.floor(timeRange.start * sampleRate) : 0;
    const endOffset = timeRange ? Math.floor(timeRange.end * sampleRate) : buffer.length;
    
    const channelData = fullChannelData.subarray(startOffset, endOffset);
    
    // Simple onset detection to find potential loop points
    const onsets = this.detectOnsets(channelData, sampleRate);
    const candidates: LoopCandidate[] = [];

    // Use Meyda for robust BPM detection
    const estimatedBpm = this.detectBpmWithMeyda(buffer);
    const beatLength = (60 / estimatedBpm) * sampleRate;

    // Generate candidates from recurrence-like patterns
    // Sample onsets more broadly across the entire range
    const maxOnsetsToSample = 150; // Increased sampling
    const onsetStep = Math.max(1, Math.floor(onsets.length / maxOnsetsToSample));
    
    for (let i = 0; i < onsets.length - 4; i += onsetStep) {
      const startOnset = onsets[i];
      if (candidates.length > 500) break; // Increased safety break
      
      // Look for loops of various lengths (beats)
      const loopLengths = [0.5, 1, 2, 4, 8, 16]; // Added shorter lengths for diversity
      for (const beats of loopLengths) {
        const targetEnd = startOnset + (beats * beatLength);
        
        // Find the nearest onset to the target end to ensure rhythmic stability
        const endOnset = this.findNearestOnset(onsets, targetEnd);
        if (!endOnset || endOnset <= startOnset) continue;

        const duration = (endOnset - startOnset) / sampleRate;
        if (duration < 0.2 || duration > 12) continue; // Wider duration range

        // Calculate Ranking Metrics
        const rhythmicDensity = this.calculateRhythmicDensity(channelData, startOnset, endOnset);
        const rqa = this.calculateRQA(channelData, startOnset, endOnset);
        const grooveConsistency = rqa.laminarity; 
        const hcdfStability = rqa.trappingTime / 100; // Normalized

        // Ranking Formula: Weighted sum of metrics
        const ebrScore = rhythmicDensity >= 0.2 && rhythmicDensity <= 0.6 ? 1.0 : 0.5;
        // Add a small random factor to encourage diversity in top results
        const diversityBonus = Math.random() * 0.1;
        const score = (ebrScore * 0.3) + (grooveConsistency * 0.3) + (hcdfStability * 0.3) + diversityBonus;

        candidates.push({
          id: generateId(),
          startTime: (startOffset + startOnset) / sampleRate,
          duration: duration,
          bpm: estimatedBpm,
          key: 'C Major', 
          rhythmicDensity,
          grooveConsistency,
          hcdfStability,
          score,
          buffer: null as any 
        });
      }
    }

    // Sort by score
    candidates.sort((a, b) => b.score - a.score);

    // To ensure variety, we'll pick the best candidates from different time segments
    const segmentCount = 8; // Increased segments
    const segmentDuration = buffer.duration / segmentCount;
    const selectedCandidates: LoopCandidate[] = [];
    const candidatesPerSegment = 2;

    for (let s = 0; s < segmentCount; s++) {
      const segmentStart = s * segmentDuration;
      const segmentEnd = (s + 1) * segmentDuration;
      
      const segmentCandidates = candidates
        .filter(c => c.startTime >= segmentStart && c.startTime < segmentEnd)
        .slice(0, candidatesPerSegment);
      
      selectedCandidates.push(...segmentCandidates);
    }

    // If we don't have enough, fill with the remaining best candidates
    if (selectedCandidates.length < 10) {
      const remaining = candidates
        .filter(c => !selectedCandidates.find(sc => sc.id === c.id))
        .slice(0, 10 - selectedCandidates.length);
      selectedCandidates.push(...remaining);
    }

    // Process and refine each top candidate
    return selectedCandidates.slice(0, 10).map(c => {
      const startSample = Math.floor(c.startTime * sampleRate);
      const endSample = Math.floor((c.startTime + c.duration) * sampleRate);
      
      // DSP Refinement Chain
      let slice = audioEngine.sliceBuffer(buffer, startSample, endSample);
      slice = audioEngine.centerWaveform(slice);
      slice = audioEngine.normalize(slice);
      slice = audioEngine.applyFades(slice);

      return { ...c, buffer: slice };
    });
  }

  /**
   * Call the Python DSP engine via the Express proxy
   */
  private async discoverLoopsFromBackend(blob: Blob, originalBuffer: AudioBuffer): Promise<LoopCandidate[]> {
    const formData = new FormData();
    formData.append('file', blob, 'audio_file');

    const response = await fetch('/api/analyze-loop', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Backend analysis failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.loop_detected) {
      return [];
    }

    const candidates: any[] = [data.best_loop, ...data.alternatives];
    
    return candidates.map(c => {
      const startSample = c.start_sample;
      const endSample = c.end_sample;
      
      // Slice the buffer for playback
      let slice = audioEngine.sliceBuffer(originalBuffer, startSample, endSample);
      slice = audioEngine.centerWaveform(slice);
      slice = audioEngine.normalize(slice);
      
      return {
        id: generateId(),
        startTime: c.start_sample / originalBuffer.sampleRate,
        duration: c.duration_seconds,
        bpm: c.estimated_bpm,
        key: 'C Major', // Key detection still local for now
        rhythmicDensity: 0.5, // Placeholder for legacy UI
        grooveConsistency: c.seam_waveform_score,
        hcdfStability: c.beat_alignment_score,
        score: c.overall_confidence,
        buffer: slice,
        // New Metadata
        contentType: data.content_type,
        seamWaveformScore: c.seam_waveform_score,
        clickRisk: c.click_risk,
        beatAlignmentScore: c.beat_alignment_score,
        barAlignedScore: c.bar_aligned_score,
        overallConfidence: c.overall_confidence,
        recommendedCrossfadeMs: c.recommended_crossfade_ms
      };
    });
  }

  /**
   * Detect BPM of an AudioBuffer
   */
  detectBpm(buffer: AudioBuffer): number {
    return this.detectBpmWithMeyda(buffer);
  }

  /**
   * Detect Key of an AudioBuffer
   */
  detectKey(buffer: AudioBuffer): string {
    const data = buffer.getChannelData(0);
    const frameSize = 4096;
    const chromaSums = new Float32Array(12).fill(0);
    let count = 0;

    for (let i = 0; i < data.length - frameSize; i += frameSize) {
      const frame = data.subarray(i, i + frameSize);
      const chroma = Meyda.extract('chroma', frame) as number[];
      if (chroma) {
        for (let j = 0; j < 12; j++) chromaSums[j] += chroma[j];
        count++;
      }
    }

    if (count === 0) return 'C Major';

    let maxVal = -1;
    let maxIdx = 0;
    for (let i = 0; i < 12; i++) {
      if (chromaSums[i] > maxVal) {
        maxVal = chromaSums[i];
        maxIdx = i;
      }
    }

    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // Very basic heuristic: if the second strongest is 3 semitones up, it might be minor
    // But for now, let's just return the root.
    return `${keys[maxIdx]} Maj`;
  }

  private detectBpmWithMeyda(buffer: AudioBuffer): number {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    
    // 1. Parameters for analysis
    const frameSize = 2048;
    const hopSize = 512; 
    const energyEnvelope: number[] = [];

    // 2. Extract RMS envelope
    for (let i = 0; i < data.length - frameSize; i += hopSize) {
      const frame = data.subarray(i, i + frameSize);
      const rms = Meyda.extract('rms', frame) as number;
      energyEnvelope.push(rms);
    }

    if (energyEnvelope.length < 20) return 120;

    // 3. Spectral Flux (Onset Detection Function)
    // We use the positive difference of the envelope to emphasize onsets
    const flux: number[] = [0];
    for (let i = 1; i < energyEnvelope.length; i++) {
      flux.push(Math.max(0, energyEnvelope[i] - energyEnvelope[i-1]));
    }

    // 4. Autocorrelation on the Flux signal
    const minBpm = 60;
    const maxBpm = 200;
    const minLag = Math.floor((60 / maxBpm) * (sampleRate / hopSize));
    const maxLag = Math.floor((60 / minBpm) * (sampleRate / hopSize));
    
    const correlations: { lag: number, score: number }[] = [];

    for (let lag = minLag; lag <= maxLag; lag++) {
      let correlation = 0;
      let count = 0;
      for (let i = 0; i < flux.length - lag; i++) {
        correlation += flux[i] * flux[i + lag];
        count++;
      }
      
      // Weighting: slightly favor the middle range (70-160 BPM)
      const bpmAtLag = 60 / ((lag * hopSize) / sampleRate);
      const weight = 1.0 - Math.abs(bpmAtLag - 110) / 200;
      
      correlations.push({ lag, score: (correlation / count) * weight });
    }

    // 5. Find the best peak with harmonic reinforcement
    let bestLag = 0;
    let maxScore = -Infinity;

    for (let i = 1; i < correlations.length - 1; i++) {
      const c = correlations[i];
      // Peak detection
      if (c.score > correlations[i-1].score && c.score > correlations[i+1].score) {
        let harmonicScore = c.score;
        
        // Check half lag (double BPM)
        const halfLag = Math.round(c.lag / 2);
        const halfLagIdx = correlations.findIndex(cor => cor.lag === halfLag);
        if (halfLagIdx !== -1) harmonicScore += correlations[halfLagIdx].score * 0.3;
        
        // Check double lag (half BPM)
        const doubleLag = c.lag * 2;
        const doubleLagIdx = correlations.findIndex(cor => cor.lag === doubleLag);
        if (doubleLagIdx !== -1) harmonicScore += correlations[doubleLagIdx].score * 0.3;

        if (harmonicScore > maxScore) {
          maxScore = harmonicScore;
          bestLag = c.lag;
        }
      }
    }

    if (bestLag === 0) {
      // Fallback to highest score if no clear peak
      correlations.sort((a, b) => b.score - a.score);
      bestLag = correlations[0].lag;
    }

    // 6. Convert lag to BPM
    const beatDuration = (bestLag * hopSize) / sampleRate;
    let bpm = 60 / beatDuration;

    // 7. Normalize BPM to a standard range (75-150)
    // This handles double/half time issues common in autocorrelation
    while (bpm < 75) bpm *= 2;
    while (bpm > 150) bpm /= 2;

    return Math.round(bpm);
  }

  private detectOnsets(data: Float32Array, sampleRate: number): number[] {
    const onsets: number[] = [];
    const windowSize = 1024;
    const hopSize = 512;
    let prevEnergy = 0;

    for (let i = 0; i < data.length - windowSize; i += hopSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += data[i + j] * data[i + j];
      }
      
      if (energy > prevEnergy * 1.5 && energy > 0.01) {
        onsets.push(i);
      }
      prevEnergy = energy;
    }
    return onsets;
  }

  private findNearestOnset(onsets: number[], target: number): number | null {
    let best = null;
    let minDiff = Infinity;
    for (const o of onsets) {
      const diff = Math.abs(o - target);
      if (diff < minDiff) {
        minDiff = diff;
        best = o;
      }
    }
    return best;
  }

  private calculateRhythmicDensity(data: Float32Array, start: number, end: number): number {
    // Empty Beat Rate (EBR) simulation
    let activeSamples = 0;
    const threshold = 0.05;
    for (let i = start; i < end; i++) {
      if (Math.abs(data[i]) > threshold) activeSamples++;
    }
    return activeSamples / (end - start);
  }

  /**
   * Recurrence Quantification Analysis (RQA)
   * Simplified for performance using energy envelope
   */
  private calculateRQA(data: Float32Array, start: number, end: number) {
    const segment = data.subarray(start, end);
    const step = 256;
    const envelope: number[] = [];
    for (let i = 0; i < segment.length; i += step) {
      let sum = 0;
      for (let j = 0; j < step && i + j < segment.length; j++) {
        sum += segment[i + j] * segment[i + j];
      }
      envelope.push(Math.sqrt(sum / step));
    }

    const threshold = 0.1;
    const N = envelope.length;
    let recurrencePoints = 0;
    const verticalLines: number[] = [];

    for (let i = 0; i < N; i++) {
      let currentLineLength = 0;
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dist = Math.abs(envelope[i] - envelope[j]);
        if (dist < threshold) {
          recurrencePoints++;
          currentLineLength++;
        } else {
          if (currentLineLength >= 2) verticalLines.push(currentLineLength);
          currentLineLength = 0;
        }
      }
      if (currentLineLength >= 2) verticalLines.push(currentLineLength);
    }

    const laminarity = verticalLines.length > 0 ? 
      verticalLines.reduce((a, b) => a + b, 0) / (recurrencePoints || 1) : 0;
    const trappingTime = verticalLines.length > 0 ? 
      verticalLines.reduce((a, b) => a + b, 0) / verticalLines.length : 0;

    return { laminarity, trappingTime };
  }

  /**
   * Calculate similarity between two loops based on rhythmic density and RQA
   */
  calculateSimilarity(a: LoopCandidate, b: LoopCandidate): number {
    const rdDiff = Math.abs(a.rhythmicDensity - b.rhythmicDensity);
    const gcDiff = Math.abs(a.grooveConsistency - b.grooveConsistency);
    const hcdfDiff = Math.abs(a.hcdfStability - b.hcdfStability);
    
    // Weighted similarity score (1.0 is identical)
    const diff = (rdDiff * 0.4) + (gcDiff * 0.3) + (hcdfDiff * 0.3);
    return Math.max(0, 1 - diff);
  }
}

export const loopDiscovery = new LoopDiscovery();
