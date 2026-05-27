"use client";

import React, { useCallback, useMemo, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CanvasRevealEffectProps {
  animationSpeed?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
}

export const CanvasRevealEffect = ({
  animationSpeed = 4,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  dotSize = 3,
  showGradient = true,
}: CanvasRevealEffectProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const dotsRef = useRef<{
    x: number;
    y: number;
    opacity: number;
    targetOpacity: number;
    color: number[];
  }[]>([]);

  const initDots = useCallback((canvas: HTMLCanvasElement) => {
    const cols = Math.ceil(canvas.width / (dotSize * 4));
    const rows = Math.ceil(canvas.height / (dotSize * 4));
    const dots: typeof dotsRef.current = [];

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        dots.push({
          x: i * dotSize * 4 + dotSize * 2,
          y: j * dotSize * 4 + dotSize * 2,
          opacity: 0,
          targetOpacity: opacities[Math.floor(Math.random() * opacities.length)],
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }
    dotsRef.current = dots;
  }, [dotSize, opacities, colors]);

  const animate = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    dotsRef.current.forEach((dot) => {
      dot.opacity += (dot.targetOpacity - dot.opacity) * 0.02 * animationSpeed;
      
      if (Math.abs(dot.opacity - dot.targetOpacity) < 0.01) {
        dot.targetOpacity = opacities[Math.floor(Math.random() * opacities.length)];
      }

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${dot.color[0]}, ${dot.color[1]}, ${dot.color[2]}, ${dot.opacity})`;
      ctx.fill();
    });

    animationRef.current = requestAnimationFrame(() => animate(ctx, canvas));
  }, [animationSpeed, dotSize, opacities]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
        initDots(canvas);
      }
    });

    resizeObserver.observe(canvas.parentElement!);
    
    canvas.width = canvas.parentElement?.clientWidth || 0;
    canvas.height = canvas.parentElement?.clientHeight || 0;
    initDots(canvas);
    animate(ctx, canvas);

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [initDots, animate]);

  return (
    <div className={cn("relative h-full w-full", containerClassName)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
      )}
    </div>
  );
};
