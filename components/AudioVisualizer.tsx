import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  color?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, color = '#fbbf24' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let bars: number[] = Array(30).fill(0);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Update bars based on active state
      bars = bars.map((h, i) => {
        if (isActive) {
           // Simulate organic movement
           const target = Math.random() * 40 + 10; 
           return h + (target - h) * 0.2;
        } else {
           // Return to baseline
           return h + (2 - h) * 0.1;
        }
      });

      ctx.fillStyle = color;
      
      // Draw mirrored bars from center
      const barWidth = 4;
      const gap = 4;
      const totalWidth = bars.length * (barWidth + gap);
      const startX = centerX - totalWidth / 2;

      bars.forEach((height, i) => {
        const x = startX + i * (barWidth + gap);
        // Soft rounded bars
        ctx.beginPath();
        ctx.roundRect(x, centerY - height / 2, barWidth, height, 2);
        ctx.fill();
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [isActive, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={100} 
      className="w-full max-w-[300px] h-[60px] opacity-80"
    />
  );
};

export default AudioVisualizer;