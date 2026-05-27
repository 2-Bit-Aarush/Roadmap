"use client";

import React from "react";
import { motion } from "framer-motion";
import { WavyBackground } from "@/components/ui/wavy-background";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { siteConfig } from "@/lib/config";

export function HeroSection() {
  return (
    <section className="relative min-h-screen w-full">
      <WavyBackground
        className="max-w-4xl mx-auto px-4 md:px-8 py-20"
        containerClassName="min-h-screen"
        colors={["#3b82f6", "#06b6d4", "#8b5cf6", "#14b8a6", "#0ea5e9"]}
        waveWidth={50}
        backgroundFill="rgba(10, 10, 15, 1)"
        blur={10}
        speed="slow"
        waveOpacity={0.5}
      >
        <div className="flex flex-col items-center justify-center text-center">
          {/* Main Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tight text-white mb-6"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {siteConfig.name}
          </motion.h1>

          {/* Personal Attribution */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="text-base md:text-lg text-white/50 font-light tracking-wide mb-12"
          >
            A small initiative by {siteConfig.creator}
          </motion.p>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
            className="text-white/60 text-base md:text-lg max-w-xl leading-relaxed mb-10"
          >
            {siteConfig.tagline}
          </motion.p>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <Button
              size="lg"
              className="group relative overflow-hidden bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 px-8 h-12 text-base font-medium backdrop-blur-sm transition-all duration-300"
            >
              <span className="relative z-10 flex items-center gap-2">
                Explore Roadmaps
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>
          </motion.div>
        </div>
      </WavyBackground>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}
