import numpy as np

class Config:
    SAMPLE_RATE = 44100
    HOP_LENGTH = 512
    WIN_LENGTH = 2048
    
    # Scoring Weights by Content Type
    WEIGHTS = {
        "percussive": {
            "seam_waveform": 0.4,
            "rhythm_alignment": 0.5,
            "spectral_continuity": 0.1
        },
        "tonal": {
            "seam_waveform": 0.2,
            "rhythm_alignment": 0.3,
            "spectral_continuity": 0.5
        },
        "ambient": {
            "seam_waveform": 0.1,
            "rhythm_alignment": 0.1,
            "spectral_continuity": 0.8
        }
    }
    
    # Thresholds
    MIN_LOOP_DURATION = 0.5  # seconds
    MAX_LOOP_DURATION = 30.0 # seconds
    CONFIDENCE_THRESHOLD = 0.4
