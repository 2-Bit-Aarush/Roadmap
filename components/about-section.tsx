"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Target, Zap, Users, Award, ArrowUpRight } from "lucide-react";

const features = [
  {
    icon: Target,
    title: "Structured Learning",
    description:
      "Follow carefully crafted paths from fundamentals to advanced concepts.",
  },
  {
    icon: Zap,
    title: "Track Progress",
    description:
      "Monitor your journey with visual progress indicators and milestones.",
  },
  {
    icon: Users,
    title: "Community Driven",
    description:
      "Learn alongside others and share knowledge with the community.",
  },
  {
    icon: Award,
    title: "Industry Relevant",
    description:
      "Roadmaps based on real-world requirements and best practices.",
  },
];

export function AboutSection() {
  return (
    <section id="about" className="relative py-24 px-4 md:px-8 overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 -left-40 w-80 h-80 bg-blue-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-40 w-80 h-80 bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2
              className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Navigate Your{" "}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Learning Journey
              </span>
            </h2>

            <p className="text-white/50 text-base leading-relaxed mb-8">
              Structured learning paths designed to guide you from where you are
              to where you want to be.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <motion.a
                href="#roadmaps"
                className={cn(
                  "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl",
                  "bg-white/10 border border-white/20 text-white font-medium",
                  "hover:bg-white/15 hover:border-white/30 transition-all duration-300"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Start Learning
                <ArrowUpRight className="h-4 w-4" />
              </motion.a>
            </div>
          </motion.div>

          {/* Right Content - Feature Cards */}
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={cn(
                  "group p-6 rounded-2xl",
                  "bg-white/[0.02] border border-white/[0.05]",
                  "hover:bg-white/[0.04] hover:border-white/[0.1]",
                  "transition-all duration-300"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl mb-4",
                    "bg-white/5 border border-white/10",
                    "group-hover:bg-white/10 transition-all duration-300"
                  )}
                >
                  <feature.icon className="h-5 w-5 text-white/70" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-white/40 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
