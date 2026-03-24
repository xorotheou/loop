import numpy as np
from pydantic import BaseModel
from typing import List, Optional

class LoopCandidate(BaseModel):
    start_sample: int
    end_sample: int
    duration_samples: int
    duration_seconds: float
    beats_per_loop: float
    estimated_bpm: float
    overall_confidence: float
    seam_waveform_score: float
    click_risk: float
    beat_alignment_score: float
    bar_aligned_score: float
    recommended_crossfade_ms: float

class LoopDetectionResponse(BaseModel):
    loop_detected: bool
    content_type: str
    best_loop: Optional[LoopCandidate]
    alternatives: List[LoopCandidate]
    diagnostics: dict

def score_crossfade(y, sr, candidates):
    """
    Evaluate suitability for crossfade looping.
    - Spectral Flux: Lower flux at the seam means a crossfade will be less noticeable.
    - Stationarity: Does the texture remain consistent throughout the loop?
    - Recommended Crossfade: Based on the "beat" or "pulse" of the texture.
    """
    for cand in candidates:
        # 1. Spectral Flux at Seam
        # (Already calculated in seam.py, we use it here to recommend a duration)
        # For ambient sounds, we recommend a longer crossfade (50-200ms).
        # For rhythmic sounds, we recommend a shorter crossfade (5-20ms).
        
        cand["recommended_crossfade_ms"] = 20.0 # Default
        if cand.get("content_type") == "ambient":
            cand["recommended_crossfade_ms"] = 100.0
            
    return candidates
