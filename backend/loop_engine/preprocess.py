import librosa
import numpy as np
from .config import Config

def preprocess_audio(file_path):
    """
    Ingest, decode, and clean audio for analysis.
    - Resamples to 44.1kHz for consistent DSP.
    - Normalizes to Float32.
    - Removes DC offset to prevent click artifacts.
    - Trims silence to find the true start of content.
    - Performs HPSS for separate rhythmic/tonal analysis paths.
    """
    # 1. Decode & Resample
    y, sr = librosa.load(file_path, sr=Config.SAMPLE_RATE, mono=True)
    
    # 2. DC Offset Removal (Subtract mean)
    y -= np.mean(y)
    
    # 3. Normalization (Peak normalization to -0.1dB)
    peak = np.max(np.abs(y))
    if peak > 0:
        y = y / peak * 0.99
        
    # 4. Silence Trimming (Conservative 60dB threshold)
    y_trimmed, index = librosa.effects.trim(y, top_db=60)
    
    # 5. Harmonic-Percussive Source Separation
    # This allows us to analyze rhythmic transients and melodic flow separately.
    y_harmonic, y_percussive = librosa.effects.hpss(y_trimmed)
    
    return {
        "audio": y_trimmed,
        "harmonic": y_harmonic,
        "percussive": y_percussive,
        "sr": sr
    }

def classify_content(audio_data):
    """
    Estimate content type based on spectral flatness and percussive ratio.
    - Percussive: High transient energy, low spectral flatness.
    - Tonal: High harmonic energy, clear chroma peaks.
    - Ambient: High spectral flatness, low rhythmic periodicity.
    """
    y = audio_data["audio"]
    y_h = audio_data["harmonic"]
    y_p = audio_data["percussive"]
    
    # Calculate energy ratio
    p_energy = np.sum(y_p**2)
    h_energy = np.sum(y_h**2)
    ratio = p_energy / (h_energy + 1e-6)
    
    # Spectral Flatness (Ambient sounds are 'flatter' like noise)
    flatness = np.mean(librosa.feature.spectral_flatness(y=y))
    
    if ratio > 2.0:
        return "percussive"
    elif flatness > 0.1:
        return "ambient"
    else:
        return "tonal"
