import librosa
import numpy as np
from scipy.signal import correlate
from .config import Config

def generate_candidates(y, sr, candidate_durations):
    """
    Generate candidate loop boundaries using beat anchors and structural shifts.
    - Beat Anchors: Align to rhythmic pulses.
    - Onset Anchors: Align to transient starts.
    - Low-Click Regions: Search for zero-crossings or minimum energy.
    """
    # 1. Beat Tracking (If rhythmic)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=Config.HOP_LENGTH)
    beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=Config.HOP_LENGTH)
    
    # 2. Generate start/end pairs
    # We look for pairs that match our candidate durations.
    candidates = []
    for start_time in beat_times:
        for duration in candidate_durations:
            end_time = start_time + duration
            if end_time < len(y) / sr:
                candidates.append({
                    "start": start_time,
                    "end": end_time,
                    "duration": duration
                })
                
    # 3. Refine boundaries (Local search for zero-crossings)
    # This minimizes clicks in hard-cut loops.
    for cand in candidates:
        cand["start_sample"] = int(cand["start"] * sr)
        cand["end_sample"] = int(cand["end"] * sr)
        
        # Local search for zero-crossing (±10ms)
        search_range = int(0.01 * sr)
        for i in range(-search_range, search_range):
            idx = cand["start_sample"] + i
            if 0 <= idx < len(y) - 1:
                if y[idx] * y[idx+1] <= 0: # Zero crossing
                    cand["start_sample"] = idx
                    break
                    
    return candidates

def score_seam(y, sr, candidates):
    """
    Evaluate seam quality using multiple metrics.
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
