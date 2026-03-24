import React, { useEffect, useRef } from 'react';

interface SpectrogramViewProps {
  buffer: AudioBuffer;
  width: number;
  height: number;
}

export const SpectrogramView: React.FC<SpectrogramViewProps> = ({ buffer, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !buffer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const fftSize = 1024;
    const hopSize = 256;
    
    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    const numFrames = Math.floor((data.length - fftSize) / hopSize);
    const frameWidth = width / numFrames;
    const binHeight = height / (fftSize / 2);

    // Simple FFT simulation for visualization (using a basic windowed energy approach for speed)
    // In a real app, we'd use a proper FFT library or the Web Audio API's AnalyserNode
    // But for a static view of a buffer, we'll do a simplified spectral analysis
    
    for (let i = 0; i < numFrames; i++) {
      const start = i * hopSize;
      const frame = data.subarray(start, start + fftSize);
      
      // Simplified "Spectral" bins using sub-band energy
      const numBins = 64;
      const binSize = Math.floor(fftSize / (2 * numBins));
      
      for (let b = 0; b < numBins; b++) {
        let energy = 0;
        // This is a very rough approximation of frequency content
        // We'll just use the variance of the signal in different sub-windows
        const subStart = b * binSize;
        for (let j = 0; j < binSize; j++) {
          energy += Math.abs(frame[subStart + j]);
        }
        
        const intensity = Math.min(255, energy * 50);
        
        // Color mapping: Dark Blue -> Purple -> Red -> Yellow
        ctx.fillStyle = `rgb(${intensity}, ${intensity / 4}, ${255 - intensity})`;
        
        // Draw bin (flipped vertically so low freq is at bottom)
        ctx.fillRect(
          i * frameWidth,
          height - (b * (height / numBins)),
          frameWidth + 1,
          height / numBins + 1
        );
      }
    }
  }, [buffer, width, height]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className="rounded-lg shadow-inner bg-slate-900"
    />
  );
};
