import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

interface WaveformViewProps {
  buffer: AudioBuffer;
  className?: string;
  bpm?: number;
  showGrid?: boolean;
  trim?: { start: number; end: number };
  onTrimChange?: (trim: { start: number; end: number }) => void;
  snapToGrid?: boolean;
  snapMode?: 'beat' | 'bar' | '16th';
  rhythmicDensity?: number;
  grooveConsistency?: number;
}

export const WaveformView: React.FC<WaveformViewProps> = ({ 
  buffer, 
  className, 
  bpm, 
  showGrid, 
  trim, 
  onTrimChange,
  snapToGrid = true,
  snapMode = '16th',
  rhythmicDensity = 0.5,
  grooveConsistency = 0.5
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);

  // Helper to get color based on density
  const getDensityColor = (density: number, alpha: number = 0.8) => {
    // 0 (Low) -> Blue
    // 0.5 (Mid) -> Purple
    // 1 (High) -> Orange/Red
    if (density < 0.5) {
      const r = Math.floor(59 + (147 - 59) * (density * 2));
      const g = Math.floor(130 + (51 - 130) * (density * 2));
      const b = Math.floor(246 + (234 - 246) * (density * 2));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else {
      const r = Math.floor(147 + (249 - 147) * ((density - 0.5) * 2));
      const g = Math.floor(51 + (115 - 51) * ((density - 0.5) * 2));
      const b = Math.floor(234 + (22 - 234) * ((density - 0.5) * 2));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!trim || !onTrimChange || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    
    const startDist = Math.abs(x - trim.start);
    const endDist = Math.abs(x - trim.end);
    
    // Improved selection logic: pick the closest handle within threshold
    const threshold = 12; // Increased threshold for better touch/click accuracy
    let handle: 'start' | 'end' | null = null;
    
    if (startDist < threshold && endDist < threshold) {
      handle = startDist < endDist ? 'start' : 'end';
    } else if (startDist < threshold) {
      handle = 'start';
    } else if (endDist < threshold) {
      handle = 'end';
    }
    
    if (!handle) return;
    setDraggingHandle(handle);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const currentX = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      
      // Add snapping logic if bpm is provided
      let finalX = currentX;
      if (bpm && snapToGrid) {
        const beatDuration = 60 / bpm;
        const totalDuration = buffer.duration;
        const beatPct = (beatDuration / totalDuration) * 100;
        
        let snapResolution = beatPct / 4; // Default 16th
        if (snapMode === 'beat') snapResolution = beatPct;
        if (snapMode === 'bar') snapResolution = beatPct * 4;
        
        finalX = Math.round(currentX / snapResolution) * snapResolution;
      }

      onTrimChange({
        start: handle === 'start' ? Math.max(0, Math.min(finalX, trim.end - 0.5)) : trim.start,
        end: handle === 'end' ? Math.min(100, Math.max(finalX, trim.start + 0.5)) : trim.end
      });
    };

    const onMouseUp = () => {
      setDraggingHandle(null);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    document.body.style.cursor = 'ew-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw Grid
    if (showGrid && bpm) {
      const beatDuration = 60 / bpm;
      const totalDuration = buffer.duration;
      const beats = Math.floor(totalDuration / beatDuration);
      
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.setLineDash([2, 4]);
      for (let i = 1; i <= beats; i++) {
        const x = (i * beatDuration / totalDuration) * width;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Waveform
    const color = getDensityColor(rhythmicDensity);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, getDensityColor(rhythmicDensity, 0.4));
    gradient.addColorStop(1, color);

    // Groove Consistency Glow
    if (grooveConsistency > 0.7) {
      ctx.shadowBlur = (grooveConsistency - 0.7) * 40;
      ctx.shadowColor = color;
    }

    ctx.beginPath();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Trim Overlays
    if (trim) {
      const startX = (trim.start / 100) * width;
      const endX = (trim.end / 100) * width;

      // Darken outside areas
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillRect(0, 0, startX, height);
      ctx.fillRect(endX, 0, width - endX, height);

      // Highlight selected area
      ctx.fillStyle = getDensityColor(rhythmicDensity, 0.1);
      ctx.fillRect(startX, 0, endX - startX, height);

      // Draw handles
      ctx.fillStyle = getDensityColor(rhythmicDensity, 1);
      
      // Start Handle
      ctx.globalAlpha = draggingHandle === 'start' ? 1 : 0.6;
      if (draggingHandle === 'start') {
        ctx.shadowBlur = 20;
        ctx.shadowColor = getDensityColor(rhythmicDensity, 1);
      }
      ctx.fillRect(startX - 3, 0, 6, height);
      ctx.beginPath();
      ctx.arc(startX, height / 2, draggingHandle === 'start' ? 12 : 6, 0, Math.PI * 2);
      ctx.fill();
      if (draggingHandle === 'start') {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // End Handle
      ctx.globalAlpha = draggingHandle === 'end' ? 1 : 0.6;
      if (draggingHandle === 'end') {
        ctx.shadowBlur = 20;
        ctx.shadowColor = getDensityColor(rhythmicDensity, 1);
      }
      ctx.fillRect(endX - 3, 0, 6, height);
      ctx.beginPath();
      ctx.arc(endX, height / 2, draggingHandle === 'end' ? 12 : 6, 0, Math.PI * 2);
      ctx.fill();
      if (draggingHandle === 'end') {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = 1;
    }
  }, [buffer, bpm, showGrid, trim, draggingHandle, rhythmicDensity, grooveConsistency]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!trim || !canvasRef.current || draggingHandle) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const threshold = 8;
    if (Math.abs(x - trim.start) < threshold || Math.abs(x - trim.end) < threshold) {
      canvasRef.current.style.cursor = 'ew-resize';
    } else {
      canvasRef.current.style.cursor = 'pointer';
    }
  };

  return (
    <canvas 
      ref={canvasRef} 
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      className={cn(className)} 
      style={{ width: '100%', height: '100%' }} 
    />
  );
};
