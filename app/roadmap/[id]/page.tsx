"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CheckCircle,
  Circle,
  ExternalLink,
  BookOpen,
  Clock,
  Sparkles,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RoadmapPageProps {
  params: Promise<{ id: string }>;
}

export default function RoadmapPage({ params }: RoadmapPageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const roadmapId = resolvedParams.id;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [roadmap, setRoadmap] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [activeNode, setActiveNode] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initPage() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push("/login");
          return;
        }
        setUser(session.user);

        // Fetch roadmap
        const { data: roadmapData, error: roadmapError } = await supabase
          .from("roadmaps")
          .select("*")
          .eq("id", roadmapId)
          .single();

        if (roadmapError) throw roadmapError;
        setRoadmap(roadmapData);

        // Add to recently viewed
        await supabase.from("recently_viewed").upsert(
          {
            user_id: session.user.id,
            roadmap_id: roadmapId,
            viewed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,roadmap_id" }
        );

        // Check bookmark
        const { data: bookmarkData } = await supabase
          .from("bookmarks")
          .select("id")
          .eq("user_id", session.user.id)
          .eq("roadmap_id", roadmapId)
          .maybeSingle();

        setIsBookmarked(!!bookmarkData);

        // Fetch sections
        const { data: sectionData, error: sectionError } = await supabase
          .from("roadmap_sections")
          .select("*")
          .eq("roadmap_id", roadmapId)
          .order("order_index", { ascending: true });

        if (sectionError) throw sectionError;
        setSections(sectionData || []);

        if (sectionData && sectionData.length > 0) {
          // Fetch nodes
          const sectionIds = sectionData.map((s) => s.id);
          const { data: nodeData, error: nodeError } = await supabase
            .from("roadmap_nodes")
            .select("*")
            .in("section_id", sectionIds)
            .order("order_index", { ascending: true });

          if (nodeError) throw nodeError;
          setNodes(nodeData || []);

          if (nodeData && nodeData.length > 0) {
            // Fetch progress
            const nodeIds = nodeData.map((n) => n.id);
            const { data: progressData } = await supabase
              .from("progress_tracking")
              .select("node_id")
              .eq("user_id", session.user.id)
              .eq("completed", true)
              .in("node_id", nodeIds);

            setCompletedNodes(progressData?.map((p) => p.node_id) || []);
          }
        }
      } catch (err: any) {
        console.error("Error loading roadmap data:", err);
        toast.error("Failed to load roadmap data.");
      } finally {
        setLoading(false);
      }
    }

    initPage();
  }, [roadmapId, router]);

  const toggleBookmark = async () => {
    if (!user) return;
    try {
      if (isBookmarked) {
        await supabase
          .from("bookmarks")
          .delete()
          .eq("user_id", user.id)
          .eq("roadmap_id", roadmapId);
        setIsBookmarked(false);
        toast.success("Roadmap removed from bookmarks");
      } else {
        await supabase.from("bookmarks").insert({
          user_id: user.id,
          roadmap_id: roadmapId,
        });
        setIsBookmarked(true);
        toast.success("Roadmap bookmarked successfully");
      }
    } catch (err) {
      toast.error("Failed to update bookmark status");
    }
  };

  const toggleNodeProgress = async (nodeId: string, currentStatus: boolean) => {
    if (!user) return;
    try {
      if (currentStatus) {
        // Mark incomplete
        await supabase
          .from("progress_tracking")
          .delete()
          .eq("user_id", user.id)
          .eq("node_id", nodeId);

        setCompletedNodes(prev => prev.filter(id => id !== nodeId));
        toast.success("Topic marked as incomplete");
      } else {
        // Mark complete
        await supabase.from("progress_tracking").upsert(
          {
            user_id: user.id,
            node_id: nodeId,
            completed: true,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,node_id" }
        );

        setCompletedNodes(prev => [...prev, nodeId]);
        toast.success("Topic marked as completed!");
      }
    } catch (err) {
      toast.error("Failed to update progress");
    }
  };

  // Percent calculation
  const totalNodes = nodes.length;
  const completedCount = completedNodes.length;
  const progressPercent = totalNodes > 0 ? Math.round((completedCount / totalNodes) * 100) : 0;

  return (
    <main className="relative min-h-screen bg-background overflow-x-hidden flex flex-col justify-between">
      <Toaster position="top-center" theme="dark" />

      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-background to-background" />
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Navigation */}
        <Navbar
          onMenuClick={() => setIsSidebarOpen(true)}
          isMenuOpen={isSidebarOpen}
        />
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* Content Area */}
        <section className="max-w-4xl mx-auto w-full px-4 md:px-8 pt-32 pb-24 flex-1 flex flex-col">
          {/* Back Button */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={() => {
                if (roadmap?.category) {
                  router.push(`/category/${encodeURIComponent(roadmap.category)}`);
                } else {
                  router.push("/#roadmaps");
                }
              }}
              className="text-white/60 hover:text-white hover:bg-white/5 gap-2 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </div>

          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-8 w-1/2 bg-white/10 rounded" />
              <div className="h-4 w-3/4 bg-white/5 rounded" />
              <div className="h-24 bg-white/[0.02] border border-white/[0.05] rounded-2xl" />
            </div>
          ) : !roadmap ? (
            <div className="text-center py-20">
              <p className="text-white/50">Roadmap not found or has been unpublished.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Header Title / Meta info */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold">
                      {roadmap.category}
                    </span>
                    <span className="flex items-center gap-1 text-white/40 text-xs">
                      <BookOpen className="h-3.5 w-3.5" />
                      {roadmap.difficulty}
                    </span>
                    <span className="flex items-center gap-1 text-white/40 text-xs">
                      <Clock className="h-3.5 w-3.5" />
                      {roadmap.estimated_duration}
                    </span>
                  </div>
                  <h1
                    className="text-3xl md:text-5xl font-bold text-white mb-3 leading-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {roadmap.title}
                  </h1>
                  <p className="text-white/50 text-base max-w-2xl">
                    {roadmap.description}
                  </p>
                </div>

                <div className="shrink-0 flex items-center">
                  <Button
                    variant="outline"
                    onClick={toggleBookmark}
                    className="border-white/10 hover:bg-white/5 text-white/80 hover:text-white gap-2 h-11 px-4 cursor-pointer"
                  >
                    {isBookmarked ? (
                      <>
                        <BookmarkCheck className="h-5 w-5 text-cyan-400 fill-cyan-400/20" />
                        <span>Bookmarked</span>
                      </>
                    ) : (
                      <>
                        <Bookmark className="h-5 w-5" />
                        <span>Bookmark</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Progress Summary Box */}
              <div className="p-6 rounded-2xl border border-white/[0.08] bg-black/60 backdrop-blur-xl mb-12 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-cyan-400" />
                    <span className="text-sm font-semibold text-white">Your Progress</span>
                  </div>
                  <span className="text-sm font-bold text-cyan-400">
                    {progressPercent}% ({completedCount}/{totalNodes} Completed)
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2 bg-white/10" />
              </div>

              {/* Learning Sections Flow */}
              {sections.length === 0 ? (
                <div className="border border-dashed border-white/10 rounded-2xl p-12 text-center text-white/40 text-sm">
                  This roadmap does not have any sections yet.
                </div>
              ) : (
                <div className="space-y-12">
                  {sections.map((section, sIndex) => {
                    const sectionNodes = nodes.filter((n) => n.section_id === section.id);

                    return (
                      <div key={section.id} className="relative">
                        {/* Section Node connector line */}
                        {sIndex < sections.length - 1 && (
                          <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                        )}

                        <div className="flex gap-4">
                          {/* Number badge */}
                          <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold shrink-0 z-10">
                            {sIndex + 1}
                          </div>

                          <div className="flex-1">
                            <div className="mb-6 pt-2">
                              <h2 className="text-xl font-bold text-white mb-1" style={{ fontFamily: "var(--font-display)" }}>
                                {section.title}
                              </h2>
                              {section.description && (
                                <p className="text-white/40 text-sm">{section.description}</p>
                              )}
                            </div>

                            {/* Section topics list */}
                            {sectionNodes.length === 0 ? (
                              <p className="text-white/30 text-xs italic">No topics inside this section yet.</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {sectionNodes.map((node) => {
                                  const isDone = completedNodes.includes(node.id);

                                  return (
                                    <motion.div
                                      key={node.id}
                                      whileHover={{ scale: 1.01 }}
                                      onClick={() => setActiveNode(node)}
                                      className={cn(
                                        "p-4 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all duration-300",
                                        isDone
                                          ? "bg-cyan-950/20 border-cyan-500/30 text-cyan-200"
                                          : "bg-white/[0.02] border-white/[0.06] text-white/80 hover:border-white/15"
                                      )}
                                    >
                                      <div className="flex items-center gap-3 overflow-hidden">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleNodeProgress(node.id, isDone);
                                          }}
                                          className="text-white/40 hover:text-white transition-colors cursor-pointer"
                                        >
                                          {isDone ? (
                                            <CheckCircle className="h-5 w-5 text-cyan-400 fill-cyan-400/10" />
                                          ) : (
                                            <Circle className="h-5 w-5" />
                                          )}
                                        </button>
                                        <span className="font-medium text-sm truncate">{node.title}</span>
                                      </div>
                                      <ChevronRight className="h-4 w-4 opacity-40 shrink-0" />
                                    </motion.div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <Footer />

      {/* Node Details Sheet/Modal */}
      <Dialog open={activeNode !== null} onOpenChange={() => setActiveNode(null)}>
        {activeNode && (
          <DialogContent className="bg-black/95 border border-white/10 text-white backdrop-blur-2xl max-w-lg shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
            <DialogHeader>
              <div className="flex items-center justify-between pr-6 mb-2">
                <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-semibold uppercase tracking-wider">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Topic Detail</span>
                </div>
              </div>
              <DialogTitle className="text-xl font-bold text-white mb-2 leading-tight">
                {activeNode.title}
              </DialogTitle>
              <DialogDescription className="text-white/60 text-sm leading-relaxed whitespace-pre-line pt-2">
                {activeNode.description || "No description provided for this topic node."}
              </DialogDescription>
            </DialogHeader>

            {/* Resources list */}
            {activeNode.resources && activeNode.resources.length > 0 && (
              <div className="my-6">
                <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">
                  Learning Resources
                </h4>
                <div className="space-y-2">
                  {activeNode.resources.map((res: any, idx: number) => (
                    <a
                      key={idx}
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 text-white/80 hover:text-white transition-all text-sm"
                    >
                      <span className="font-medium truncate mr-2">{res.title}</span>
                      <ExternalLink className="h-4 w-4 text-cyan-400 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter className="border-t border-white/10 pt-4 flex flex-row items-center justify-between gap-4 mt-6">
              <div className="flex items-center gap-3">
                <Switch
                  checked={completedNodes.includes(activeNode.id)}
                  onCheckedChange={() => toggleNodeProgress(activeNode.id, completedNodes.includes(activeNode.id))}
                  id="completion-toggle"
                  className="data-[state=checked]:bg-cyan-500 cursor-pointer"
                />
                <label htmlFor="completion-toggle" className="text-sm font-semibold text-white/80 cursor-pointer">
                  Mark as Completed
                </label>
              </div>

              <Button
                variant="outline"
                onClick={() => setActiveNode(null)}
                className="border-white/10 hover:bg-white/5 text-white/80 hover:text-white cursor-pointer"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
