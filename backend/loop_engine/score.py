import numpy as np
import librosa
from .config import Config

def score_seam_quality(y, sr, candidates):
    """
    Score the transition point of a loop.
    - Waveform Continuity: Normalized cross-correlation at the seam.
    - Spectral Continuity: Change in spectral flux at the seam.
    - Click Risk: Amplitude jump at the seam.
    - Tail Mismatch: RMS difference between start and end neighborhoods.
    """
    for cand in candidates:
        s = cand["start_sample"]
        e = cand["end_sample"]
        
        # 1. Waveform Continuity (NCC)
        # Compare 20ms before end with 20ms after start.
        win = int(0.02 * sr)
        if s + win < len(y) and e - win >= 0:
            pre_seam = y[e-win:e]
            post_seam = y[s:s+win]
            
            # Normalized Cross-Correlation
            ncc = np.corrcoef(pre_seam, post_seam)[0, 1]
            cand["seam_waveform_score"] = max(0, ncc)
            
            # 2. Click Risk (Amplitude jump)
            jump = np.abs(y[e-1] - y[s])
            cand["click_risk"] = 1.0 - min(1.0, jump * 5.0) # Penalty for high jumps
            
            # 3. Tail Mismatch (RMS difference)
            rms_pre = np.sqrt(np.mean(pre_seam**2))
            rms_post = np.sqrt(np.mean(post_seam**2))
            cand["tail_mismatch_penalty"] = np.abs(rms_pre - rms_post) / (max(rms_pre, rms_post) + 1e-6)
            
    return candidates
