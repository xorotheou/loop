import numpy as np
import librosa
from .config import Config

def score_crossfade_suitability(y, sr, candidates):
    """
    Evaluate how well a loop can be smoothed with a crossfade.
    - Spectral Flux: Lower change at the seam means a smoother crossfade.
    - Stationarity: Consistent texture throughout the loop.
    - Recommended Duration: Based on the "pulse" of the texture.
    """
    for cand in candidates:
        s = cand["start_sample"]
        e = cand["end_sample"]
        
        # 1. Spectral Flux at Seam
        # We look at the spectral difference between the start and end neighborhoods.
        win = int(0.05 * sr)
        if s + win < len(y) and e - win >= 0:
            spec_start = np.abs(librosa.stft(y[s:s+win], n_fft=Config.WIN_LENGTH))
            spec_end = np.abs(librosa.stft(y[e-win:e], n_fft=Config.WIN_LENGTH))
            
            # Spectral distance (Euclidean)
            dist = np.linalg.norm(spec_start - spec_end)
            cand["crossfade_suitability"] = 1.0 - min(1.0, dist / 100.0)
            
            # 2. Recommended Crossfade (ms)
            # For ambient sounds, we recommend a longer crossfade (50-200ms).
            # For rhythmic sounds, we recommend a shorter crossfade (5-20ms).
            if cand.get("content_type") == "ambient":
                cand["recommended_crossfade_ms"] = 100.0
            else:
                cand["recommended_crossfade_ms"] = 20.0
                
    return candidates
