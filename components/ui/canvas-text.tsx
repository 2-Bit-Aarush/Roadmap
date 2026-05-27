"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface CanvasTextProps {
  text: string;
  className?: string;
  backgroundClassName?: string;
  colors?: string[];
  lineGap?: number;
  animationDuration?: number;
}

export function CanvasText({
  text,
  className,
  backgroundClassName,
  colors = [
    "var(--color-blue-500)",
    "var(--color-sky-500)",
    "var(--color-violet-500)",
    "var(--color-teal-500)",
  ],
  lineGap = 6,
  animationDuration = 10,
}: CanvasTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [lines, setLines] = useState<{ y: number; color: string; delay: number }[]>([]);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Measure text dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };
    
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [text]);

  // Generate lines
  useEffect(() => {
    if (dimensions.height === 0) return;
    
    const lineCount = Math.ceil(dimensions.height / lineGap);
    const newLines = Array.from({ length: lineCount }, (_, i) => ({
      y: i * lineGap,
      color: colors[i % colors.length],
      delay: Math.random() * 2,
    }));
    setLines(newLines);
  }, [dimensions.height, lineGap, colors]);

  // Canvas animation
  const animate = useCallback((timestamp: number) => {
    if (!canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = (timestamp - startTimeRef.current) / 1000;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    lines.forEach((line) => {
      const progress = ((elapsed + line.delay) % animationDuration) / animationDuration;
      const x = progress * (canvas.width + 100) - 50;
      
      ctx.beginPath();
      ctx.moveTo(x, line.y);
      ctx.lineTo(x + 50, line.y);
      
      const gradient = ctx.createLinearGradient(x, line.y, x + 50, line.y);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.5, line.color);
      gradient.addColorStop(1, "transparent");
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    animationRef.current = requestAnimationFrame(animate);
  }, [lines, animationDuration]);

  useEffect(() => {
    if (lines.length === 0) return;
    
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [lines, animate]);

  // Update canvas size
  useEffect(() => {
    if (!canvasRef.current) return;
    canvasRef.current.width = dimensions.width;
    canvasRef.current.height = dimensions.height;
  }, [dimensions]);

  return (
    <div className="relative inline-block">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        ref={containerRef}
        className={cn(
          "relative bg-clip-text text-transparent",
          backgroundClassName || "bg-gradient-to-r from-white via-white to-white/80",
          className
        )}
        style={{
          backgroundImage: `linear-gradient(to right, #fff, #fff)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {text}
      </motion.div>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{ width: dimensions.width, height: dimensions.height }}
      />
    </div>
  );
}
