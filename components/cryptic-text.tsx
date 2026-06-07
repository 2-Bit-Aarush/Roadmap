"use client";

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface CrypticTextProps {
  text: string;
  mode: 'exact' | 'anonymous' | 'cryptic';
  userRole?: string;
  className?: string;
}

const GLYPHS = {
  egyptian: ['𓂀', '𓋹', '𓇌', '𓅓', '𓏏', '𓂝', '𓎡', '𓈖', '𓏤', '𓅱', '𓃀', '𓆑', '𓂋', '𓄿', '𓍯', '𓐍'],
  runes: ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛟ', 'ᛞ'],
  italic: ['𐌇', '𐌄', '𐌋', '𐌉', '𐌏', '𐌔', 'A', 'B', 'C', 'D', 'F', 'G', 'M', 'N', 'P', 'R', 'T', 'U'],
};

export function CrypticText({ text, mode, userRole = 'member', className }: CrypticTextProps) {
  const [crypticText, setCrypticText] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  // Determine if viewer is authorized to decrypt (Mentor, Team Admin, or Website Admin)
  const isAuthorized = ['mentor', 'team_admin', 'website_admin', 'admin'].includes(userRole);

  useEffect(() => {
    if (mode !== 'cryptic') return;

    // Convert letters of text to ancient glyphs
    const glyphList = [...GLYPHS.runes, ...GLYPHS.egyptian, ...GLYPHS.italic];
    
    const cryptify = (input: string) => {
      return Array.from(input)
        .map((char) => {
          if (char === ' ') return ' '; // keep spacing
          const code = char.charCodeAt(0);
          return glyphList[code % glyphList.length];
        })
        .join('');
    };

    setCrypticText(cryptify(text));

    // Run fluid shimmer symbol swap animation interval mapping directly from original text
    const interval = setInterval(() => {
      setCrypticText(() => {
        return Array.from(text)
          .map((char) => {
            if (char === ' ') return ' ';
            if (Math.random() > 0.85) {
              return glyphList[Math.floor(Math.random() * glyphList.length)];
            }
            const code = char.charCodeAt(0);
            return glyphList[code % glyphList.length];
          })
          .join('');
      });
    }, 150);

    return () => clearInterval(interval);
  }, [text, mode]);

  if (mode === 'exact') {
    return <span className={cn('truncate overflow-hidden max-w-full inline-block align-middle', className)}>{text}</span>;
  }

  if (mode === 'anonymous') {
    return <span className={cn('text-white/40 italic truncate overflow-hidden max-w-full inline-block align-middle', className)}>Member Profile</span>;
  }

  return (
    <span
      className={cn("relative inline-block group cursor-help truncate overflow-hidden max-w-full align-middle", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span
        className={cn(
          'font-mono tracking-widest bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent animate-pulse filter drop-shadow-[0_0_8px_rgba(168,85,247,0.3)] truncate overflow-hidden max-w-full',
          className
        )}
      >
        {crypticText}
      </span>

      {/* Floating Hover Tooltip (Shown ONLY if viewer is authorized, preventing layout leaks) */}
      {isHovered && isAuthorized && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs text-white bg-black/90 border border-white/10 rounded-lg shadow-xl backdrop-blur-md z-50 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="flex items-center gap-1.5 font-sans font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            Decrypted: <strong className="text-white font-semibold">{text}</strong>
          </span>
        </span>
      )}
    </span>
  );
}
