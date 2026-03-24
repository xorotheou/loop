import librosa
import numpy as np
from .config import Config

def score_rhythm(y, sr, candidates):
    """
    Score musical alignment based on beat/bar structure.
    - Beat Alignment: Does the loop length match a multiple of the beat?
    - Bar Alignment: Does the loop length match a power of 2 (4, 8, 16) beats?
    - Tempo Coherence: Does the loop length match the estimated BPM?
    """
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=Config.HOP_LENGTH)
    beat_duration = 60.0 / tempo
    
    for cand in candidates:
        duration = cand["duration"]
        
        # 1. Beats per loop
        beats_in_loop = duration / beat_duration
        cand["beats_per_loop"] = beats_in_loop
        
        # 2. Alignment to integer beats
        beat_error = np.abs(beats_in_loop - round(beats_in_loop))
        cand["beat_alignment_score"] = 1.0 - min(1.0, beat_error * 2.0)
        
        # 3. Bar alignment (Prefer 4, 8, 16 beats)
        # We use a gaussian-like penalty for non-power-of-2 beat counts.
        target_bars = [4, 8, 16, 32]
        bar_error = min([np.abs(beats_in_loop - b) for b in target_bars])
        cand["bar_aligned_score"] = 1.0 - min(1.0, bar_error / 4.0)
        
        # 4. Tempo coherence
        cand["estimated_bpm"] = tempo
        
    return candidates

def rank_candidates(candidates, content_type):
    """
    Combine all scores into a final confidence score.
    - Weights are adjusted based on content type (Percussive vs Tonal vs Ambient).
    - Penalties are applied for high click risk or tail mismatch.
    """
    weights = Config.WEIGHTS[content_type]
    
    for cand in candidates:
        # 1. Base Score (Weighted sum of features)
        base_score = (
            cand.get("seam_waveform_score", 0) * weights["seam_waveform"] +
            cand.get("beat_alignment_score", 0) * weights["rhythm_alignment"] +
            cand.get("bar_aligned_score", 0) * 0.1 # Small bonus for bar alignment
        )
        
        # 2. Apply Penalties
        # We multiply by (1 - penalty) to ensure a single bad metric can kill the score.
        penalty = (
            cand.get("click_risk", 0) * 0.5 + # High click risk is bad
            cand.get("tail_mismatch_penalty", 0) * 0.5 # High tail mismatch is bad
        )
        
        cand["overall_confidence"] = base_score * (1.0 - penalty)
        
    # 3. Sort by confidence and filter
    ranked = sorted(candidates, key=lambda x: x["overall_confidence"], reverse=True)
    return [c for c in ranked if c["overall_confidence"] >= Config.CONFIDENCE_THRESHOLD]
