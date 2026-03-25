from fastapi import FastAPI, UploadFile, File, HTTPException
import shutil
import os
import tempfile
from .preprocess import preprocess_audio, classify_content
from .periodicity import extract_features, detect_candidate_periods
from .seam import generate_candidates, score_seam
from .rank import score_rhythm, rank_candidates
from .models import LoopDetectionResponse, LoopCandidate
from .config import Config
import librosa
import numpy as np

app = FastAPI(title="Loop Detection DSP Engine")

@app.post("/extract-midi")
async def extract_midi(file: UploadFile = File(...)):
    """
    Extract rhythmic 'hits' from an audio file and return MIDI-like data.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
        
    try:
        y, sr = librosa.load(tmp_path, sr=Config.SAMPLE_RATE)
        
        # 1. Onset Detection
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, units='time')
        
        # 2. Velocity Estimation (based on RMS energy at onset)
        # We'll take a small window around each onset
        velocities = []
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        
        for onset_time in onsets:
            frame = int(onset_time * sr / hop_length)
            if frame < len(rms):
                v = float(rms[frame])
                velocities.append(min(127, int(v * 255))) # Scale to MIDI 0-127
            else:
                velocities.append(64)
                
        # 3. Return MIDI-ready data
        return {
            "onsets": onsets.tolist(),
            "velocities": velocities,
            "duration": float(librosa.get_duration(y=y, sr=sr))
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/split-stems")
async def split_stems(file: UploadFile = File(...)):
    """
    Split an audio file into Harmonic (Melodic/Bass) and Percussive (Drums) components.
    This uses HPSS as a lightweight alternative to full deep-learning stem separation.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
        
    try:
        y, sr = librosa.load(tmp_path, sr=Config.SAMPLE_RATE)
        
        # Perform HPSS
        y_harmonic, y_percussive = librosa.effects.hpss(y)
        
        # Save to temporary files
        h_path = tmp_path + "_harmonic.wav"
        p_path = tmp_path + "_percussive.wav"
        
        import soundfile as sf
        sf.write(h_path, y_harmonic, sr)
        sf.write(p_path, y_percussive, sr)
        
        # In a real production app, we'd upload these to a bucket and return URLs.
        # Here, we'll return the base64 data for simplicity in this environment.
        import base64
        
        with open(h_path, "rb") as f:
            h_base64 = base64.b64encode(f.read()).decode('utf-8')
        with open(p_path, "rb") as f:
            p_base64 = base64.b64encode(f.read()).decode('utf-8')
            
        # Cleanup
        os.remove(h_path)
        os.remove(p_path)
        
        return {
            "harmonic": h_base64,
            "percussive": p_base64,
            "sr": sr
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/analyze", response_model=LoopDetectionResponse)
async def analyze_loop(file: UploadFile = File(...)):
    """
    The main entry point for the loop detection engine.
    - Ingests and decodes the audio file.
    - Preprocesses and classifies the content.
    - Extracts multi-resolution features.
    - Detects candidate periods and boundaries.
    - Scores and ranks candidates.
    - Returns a structured JSON response.
    """
    # 1. Save uploaded file to a temporary location
    with tempfile.NamedTemporaryFile(delete=False, suffix=file.filename) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name
        
    try:
        # 2. Preprocess (Ingest, Decode, HPSS)
        audio_data = preprocess_audio(tmp_path)
        y = audio_data["audio"]
        sr = audio_data["sr"]
        
        # 3. Classify Content Type
        content_type = classify_content(audio_data)
        
        # 4. Feature Extraction
        features = extract_features(y, sr)
        
        # 5. Periodicity Detection
        periods = detect_candidate_periods(features, sr)
        
        # 6. Boundary Generation
        candidates = generate_candidates(y, sr, periods)
        
        # 7. Seam Scoring
        candidates = score_seam(y, sr, candidates)
        
        # 8. Musical Alignment Scoring
        candidates = score_rhythm(y, sr, candidates)
        
        # 9. Final Ranking
        ranked = rank_candidates(candidates, content_type)
        
        # 10. Package Results
        if not ranked:
            return LoopDetectionResponse(
                loop_detected=False,
                content_type=content_type,
                best_loop=None,
                alternatives=[],
                diagnostics={"reason": "No high-confidence loops found."}
            )
            
        best = ranked[0]
        alternatives = ranked[1:4] # Top 3 alternatives
        
        return LoopDetectionResponse(
            loop_detected=True,
            content_type=content_type,
            best_loop=best,
            alternatives=alternatives,
            diagnostics={
                "estimated_bpm": best.estimated_bpm,
                "confidence": best.overall_confidence,
                "period_count": len(periods)
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
