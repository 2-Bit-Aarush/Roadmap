"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ArrowLeft, Compass, ArrowRight, BookOpen, Clock, BarChart } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryPageProps {
  params: Promise<{ id: string }>;
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const categoryName = decodeURIComponent(resolvedParams.id);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRoadmaps() {
      try {
        const { data, error } = await supabase
          .from("roadmaps")
          .select("*")
          .eq("category", categoryName)
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setRoadmaps(data || []);
      } catch (err) {
        console.error("Error fetching roadmaps:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchRoadmaps();
  }, [categoryName]);

  return (
    <main className="relative min-h-screen bg-background overflow-x-hidden flex flex-col justify-between">
      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background" />
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Navigation */}
        <Navbar
          onMenuClick={() => setIsSidebarOpen(true)}
          isMenuOpen={isSidebarOpen}
        />
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* Content Section */}
        <section className="max-w-6xl mx-auto w-full px-4 md:px-8 pt-32 pb-24 flex-1 flex flex-col">
          {/* Back Button */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => router.push("/#roadmaps")}
              className="text-white/60 hover:text-white hover:bg-white/5 gap-2 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Categories
            </Button>
          </div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <h1
              className="text-4xl md:text-5xl font-bold text-white mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {categoryName}
            </h1>
            <p className="text-white/50 text-base max-w-xl">
              Explore dynamic learning paths and build your skills in {categoryName}.
            </p>
          </motion.div>

          {/* Roadmap list */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="h-48 rounded-2xl bg-white/[0.02] border border-white/[0.05] animate-pulse p-6">
                  <div className="h-6 w-1/3 bg-white/10 rounded mb-4" />
                  <div className="h-4 w-2/3 bg-white/5 rounded mb-2" />
                  <div className="h-4 w-1/2 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          ) : roadmaps.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex-1 flex flex-col items-center justify-center border border-white/[0.05] bg-white/[0.01] rounded-3xl p-16 text-center max-w-2xl mx-auto w-full"
            >
              <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Compass className="h-8 w-8 text-cyan-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: "var(--font-display)" }}>
                No roadmaps added yet
              </h3>
              <p className="text-white/40 text-sm max-w-sm mb-8">
                Roadmaps for this category are currently being curated. Check back soon or request a custom path!
              </p>
              <Button
                onClick={() => router.push("/")}
                className="bg-white/10 hover:bg-white/15 text-white border border-white/20 gap-2 cursor-pointer"
              >
                Go Back Home
              </Button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {roadmaps.map((roadmap, index) => (
                <motion.div
                  key={roadmap.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  onClick={() => router.push(`/roadmap/${roadmap.id}`)}
                  className={cn(
                    "group relative p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-sm",
                    "hover:border-cyan-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold">
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>{roadmap.difficulty}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-white/40 text-xs">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{roadmap.estimated_duration}</span>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                      {roadmap.title}
                    </h3>
                    <p className="text-white/50 text-sm mb-6 line-clamp-2">
                      {roadmap.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-white/[0.05]">
                    <span className="text-xs text-white/30">Click to start learning</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 hover:text-cyan-300 p-0 hover:bg-transparent flex items-center gap-1 cursor-pointer"
                    >
                      Start Path
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Footer />
    </main>
  );
}
