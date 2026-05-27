"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { HeroSection } from "@/components/hero-section";
import { RoadmapCards } from "@/components/roadmap-cards";
import { AboutSection } from "@/components/about-section";
import { Footer } from "@/components/footer";

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <main className="relative min-h-screen bg-background overflow-x-hidden">
      {/* Fixed background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px]" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-violet-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Navigation */}
      <Navbar
        onMenuClick={() => setIsSidebarOpen(true)}
        isMenuOpen={isSidebarOpen}
      />

      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="relative z-0">
        {/* Hero Section */}
        <HeroSection />

        {/* Roadmap Cards Section */}
        <RoadmapCards />

        {/* About Section */}
        <AboutSection />

        {/* Footer */}
        <Footer />
      </div>
    </main>
  );
}
