"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CanvasRevealEffect } from "@/components/ui/canvas-reveal-effect";
import { Button } from "@/components/ui/button";
import {
  Globe,
  Brain,
  Shield,
  Smartphone,
  Database,
  Cloud,
  ArrowRight,
} from "lucide-react";

const roadmaps = [
  {
    id: 1,
    title: "Web Development",
    description: "Master modern web technologies from HTML to React and beyond",
    icon: Globe,
    colors: [[16, 185, 129]],
    containerClass: "bg-emerald-900/80",
  },
  {
    id: 2,
    title: "Machine Learning",
    description: "Dive deep into AI, neural networks, and data science",
    icon: Brain,
    colors: [
      [236, 72, 153],
      [232, 121, 249],
    ],
    containerClass: "bg-black",
  },
  {
    id: 3,
    title: "Cyber Security",
    description: "Learn to protect systems and secure digital infrastructure",
    icon: Shield,
    colors: [[56, 189, 248]],
    containerClass: "bg-sky-900/80",
  },
  {
    id: 4,
    title: "App Development",
    description: "Build cross-platform mobile apps with modern frameworks",
    icon: Smartphone,
    colors: [[251, 146, 60]],
    containerClass: "bg-orange-900/80",
  },
  {
    id: 5,
    title: "Data Science",
    description: "Transform raw data into actionable insights and predictions",
    icon: Database,
    colors: [[167, 139, 250]],
    containerClass: "bg-violet-900/80",
  },
  {
    id: 6,
    title: "DevOps",
    description: "Master CI/CD, containers, and cloud infrastructure",
    icon: Cloud,
    colors: [[34, 211, 238]],
    containerClass: "bg-cyan-900/80",
  },
];

export function RoadmapCards() {
  return (
    <section id="roadmaps" className="relative py-24 px-4 md:px-8">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-16 max-w-2xl mx-auto"
      >
        <h2
          className="text-3xl md:text-4xl font-bold text-white mb-4"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Choose Your{" "}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Path
          </span>
        </h2>
        <p className="text-white/50 text-base">
          Explore curated learning roadmaps designed to guide your journey.
        </p>
      </motion.div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {roadmaps.map((roadmap, index) => (
          <RoadmapCard key={roadmap.id} roadmap={roadmap} index={index} />
        ))}
      </div>
    </section>
  );
}

interface RoadmapCardProps {
  roadmap: (typeof roadmaps)[number];
  index: number;
}

function RoadmapCard({ roadmap, index }: RoadmapCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  const handleCardClick = () => {
    router.push(`/category/${encodeURIComponent(roadmap.title)}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
      className={cn(
        "group relative h-[22rem] rounded-2xl overflow-hidden cursor-pointer",
        "border border-white/[0.06] bg-black/40 backdrop-blur-sm",
        "transition-all duration-500",
        hovered && "border-white/15"
      )}
    >
      {/* Corner Decorations */}
      <Icon className="absolute h-5 w-5 -top-2.5 -left-2.5 text-white/15" />
      <Icon className="absolute h-5 w-5 -bottom-2.5 -left-2.5 text-white/15" />
      <Icon className="absolute h-5 w-5 -top-2.5 -right-2.5 text-white/15" />
      <Icon className="absolute h-5 w-5 -bottom-2.5 -right-2.5 text-white/15" />

      {/* Canvas Reveal Effect */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
          >
            <CanvasRevealEffect
              animationSpeed={4}
              containerClassName={roadmap.containerClass}
              colors={roadmap.colors}
              dotSize={2}
              showGradient={false}
            />
            <div className="absolute inset-0 bg-black/50 [mask-image:radial-gradient(400px_at_center,white,transparent)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-between p-6">
        {/* Top Section */}
        <div>
          {/* Icon */}
          <motion.div
            className={cn(
              "flex items-center justify-center w-12 h-12 rounded-xl mb-5",
              "bg-white/5 border border-white/10",
              "transition-all duration-300",
              hovered && "scale-110 border-white/20"
            )}
            animate={{ y: hovered ? -4 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <roadmap.icon className="h-6 w-6 text-white/80" />
          </motion.div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-white mb-2">
            {roadmap.title}
          </h3>

          {/* Description */}
          <p className="text-white/50 text-sm leading-relaxed">
            {roadmap.description}
          </p>
        </div>

        {/* Bottom Section */}
        <div>
          {/* Button */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: hovered ? 1 : 0, y: hovered ? 0 : 10 }}
            transition={{ duration: 0.3 }}
          >
            <Button
              className={cn(
                "w-full bg-white/10 hover:bg-white/20 text-white border-0",
                "backdrop-blur-sm transition-all duration-300"
              )}
            >
              Open Roadmap
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// Corner decoration icon
function Icon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className={className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
    </svg>
  );
}
