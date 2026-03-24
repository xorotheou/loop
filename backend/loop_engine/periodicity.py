import librosa
import numpy as np
from scipy.signal import correlate
from .config import Config

def extract_features(y, sr):
    """
    Extract multi-resolution features for loop detection.
    - Onset Strength: Rhythmic transients.
    - RMS: Energy envelope.
    - MFCCs: Timbral texture.
    - Chroma: Harmonic content.
    - Spectral Flux: Change in spectral content.
    """
    # 1. Rhythmic Envelope (Onset strength)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=Config.HOP_LENGTH)
    
    # 2. Energy Envelope (RMS)
    rms = librosa.feature.rms(y=y, hop_length=Config.HOP_LENGTH)[0]
    
    # 3. Timbral Features (MFCCs for texture matching)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=Config.HOP_LENGTH)
    
    # 4. Harmonic Features (Chroma for melodic matching)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=Config.HOP_LENGTH)
    
    # 5. Spectral Flux (Change detection)
    spec_flux = np.diff(librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=Config.HOP_LENGTH)[0])
    
    return {
        "onset_env": onset_env,
        "rms": rms,
        "mfcc": mfcc,
        "chroma": chroma,
        "spec_flux": spec_flux
    }

def detect_candidate_periods(features, sr):
    """
    Find plausible loop lengths using multiple autocorrelation methods.
    - Onset Autocorrelation: Finds rhythmic pulses.
    - Energy Autocorrelation: Finds repeating dynamic patterns.
    - Self-Similarity: Finds structural repetitions.
    """
    onset_env = features["onset_env"]
    
    # 1. Autocorrelation of onset envelope
    # This is highly effective for rhythmic loops.
    ac = librosa.autocorrelate(onset_env, max_size=int(Config.MAX_LOOP_DURATION * sr / Config.HOP_LENGTH))
    
    # 2. Find peaks in autocorrelation
    # These peaks represent candidate loop durations (in frames).
    peaks = librosa.util.peak_pick(ac, pre_max=10, post_max=10, pre_avg=10, post_avg=10, delta=0.1, wait=10)
    
    # 3. Convert frames to seconds
    candidate_durations = peaks * Config.HOP_LENGTH / sr
    
    # 4. Filter by duration constraints
    candidate_durations = [d for d in candidate_durations if Config.MIN_LOOP_DURATION <= d <= Config.MAX_LOOP_DURATION]
    
    return sorted(candidate_durations, key=lambda d: ac[int(d * sr / Config.HOP_LENGTH)], reverse=True)
