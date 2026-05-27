"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import * as XLSX from "xlsx";
import {
  Bookmark,
  Clock,
  TrendingUp,
  User,
  Printer,
  FileSpreadsheet,
  ArrowRight,
  BookOpen,
  CheckCircle,
  Calendar,
  Settings,
  Mail,
  ShieldAlert,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "progress";

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // States for dashboard stats
  const [bookmarkedRoadmaps, setBookmarkedRoadmaps] = useState<any[]>([]);
  const [recentRoadmaps, setRecentRoadmaps] = useState<any[]>([]);
  const [progressDetails, setProgressDetails] = useState<any[]>([]);
  const [overallStats, setOverallStats] = useState({
    totalCompleted: 0,
    startedRoadmaps: 0,
  });

  // Handle URL tab sync
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadUserData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push("/login");
          return;
        }
        setUser(session.user);
        const userId = session.user.id;

        // 1. Fetch bookmarks
        const { data: bookmarks } = await supabase
          .from("bookmarks")
          .select("roadmap_id, roadmaps(*)")
          .eq("user_id", userId);

        const bookmarked = bookmarks?.map((b) => b.roadmaps).filter(Boolean) || [];
        setBookmarkedRoadmaps(bookmarked);

        // 2. Fetch recently viewed
        const { data: recents } = await supabase
          .from("recently_viewed")
          .select("roadmap_id, viewed_at, roadmaps(*)")
          .eq("user_id", userId)
          .order("viewed_at", { ascending: false })
          .limit(6);

        const recentList = recents
          ?.map((r) => ({
            ...r.roadmaps,
            viewedAt: r.viewed_at,
          }))
          .filter((r) => r.id) || [];
        setRecentRoadmaps(recentList);

        // 3. Fetch progress details (all roadmaps, sections, nodes)
        // To build a progress dashboard, we need all roadmaps the user has progress on.
        const { data: rawProgress } = await supabase
          .from("progress_tracking")
          .select(`
            completed,
            completed_at,
            node:roadmap_nodes (
              id,
              title,
              section:roadmap_sections (
                id,
                title,
                roadmap:roadmaps (
                  id,
                  title,
                  category,
                  difficulty,
                  estimated_duration
                )
              )
            )
          `)
          .eq("user_id", userId);

        const progressRecords = rawProgress || [];
        
        // Group progress by roadmap
        const roadmapMap: Record<string, {
          id: string;
          title: string;
          category: string;
          difficulty: string;
          duration: string;
          totalNodes: number;
          completedNodes: number;
          nodes: any[];
        }> = {};

        // Fetch all nodes for roads user has started to calculate correct percentage
        const roadmapIds = Array.from(new Set(
          progressRecords
            .map((p: any) => p.node?.section?.roadmap?.id)
            .filter(Boolean)
        ));

        let allNodesList: any[] = [];
        if (roadmapIds.length > 0) {
          // Fetch all nodes and sections of these roadmaps
          const { data: sectionsData } = await supabase
            .from("roadmap_sections")
            .select("id, title, roadmap_id")
            .in("roadmap_id", roadmapIds);

          const sectionIds = sectionsData?.map(s => s.id) || [];
          
          if (sectionIds.length > 0) {
            const { data: nodesData } = await supabase
              .from("roadmap_nodes")
              .select("id, title, section_id, roadmap_sections(roadmap_id, title)")
              .in("section_id", sectionIds);
            
            allNodesList = nodesData || [];
          }
        }

        // Initialize maps
        roadmapIds.forEach((rId) => {
          const rNodeSample = progressRecords.find((p: any) => p.node?.section?.roadmap?.id === rId)?.node?.section?.roadmap;
          if (rNodeSample) {
            roadmapMap[rId] = {
              id: rId,
              title: rNodeSample.title,
              category: rNodeSample.category,
              difficulty: rNodeSample.difficulty,
              duration: rNodeSample.estimated_duration,
              totalNodes: allNodesList.filter(n => n.roadmap_sections?.roadmap_id === rId).length,
              completedNodes: progressRecords.filter((p: any) => p.node?.section?.roadmap?.id === rId && p.completed).length,
              nodes: [],
            };
          }
        });

        // Add node details to grouped data
        progressRecords.forEach((item: any) => {
          const rId = item.node?.section?.roadmap?.id;
          if (rId && roadmapMap[rId]) {
            roadmapMap[rId].nodes.push({
              nodeId: item.node.id,
              nodeTitle: item.node.title,
              sectionTitle: item.node.section?.title,
              completed: item.completed,
              completedAt: item.completed_at,
            });
          }
        });

        const progressArray = Object.values(roadmapMap);
        setProgressDetails(progressArray);

        // Calculate total stats
        setOverallStats({
          totalCompleted: progressRecords.filter((p: any) => p.completed).length,
          startedRoadmaps: progressArray.length,
        });

      } catch (err) {
        console.error("Error loading dashboard data:", err);
        toast.error("Error loading profile data");
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, [router]);

  const handleExportExcel = () => {
    if (progressDetails.length === 0) {
      toast.info("No progress data available to export.");
      return;
    }

    const exportRows: any[] = [];
    progressDetails.forEach((roadmap) => {
      roadmap.nodes.forEach((n) => {
        exportRows.push({
          "Roadmap Title": roadmap.title,
          "Category": roadmap.category,
          "Difficulty": roadmap.difficulty,
          "Section Title": n.sectionTitle,
          "Topic Title": n.nodeTitle,
          "Completed": n.completed ? "Yes" : "No",
          "Completed At": n.completedAt ? new Date(n.completedAt).toLocaleString() : "-",
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Roadmap Progress");
    XLSX.writeFile(workbook, "my_learning_progress.xlsx");
    toast.success("Excel report exported successfully!");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <main className="relative min-h-screen bg-background overflow-x-hidden flex flex-col justify-between">
      <Toaster position="top-center" theme="dark" />

      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-background to-background" />
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] print:hidden" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px] print:hidden" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Navigation */}
        <div className="print:hidden">
          <Navbar
            onMenuClick={() => setIsSidebarOpen(true)}
            isMenuOpen={isSidebarOpen}
          />
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        </div>

        {/* Dashboard Frame */}
        <section className="max-w-5xl mx-auto w-full px-4 md:px-8 pt-32 pb-24 flex-1 flex flex-col">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-10 w-1/4 bg-white/10 rounded" />
              <div className="h-32 bg-white/[0.02] border border-white/[0.05] rounded-2xl" />
              <div className="h-64 bg-white/[0.02] border border-white/[0.05] rounded-2xl" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Header section */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 print:hidden">
                <div>
                  <h1
                    className="text-3xl md:text-5xl font-bold text-white mb-2"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Your Dashboard
                  </h1>
                  <p className="text-white/50 text-sm">
                    Manage your progress, bookmarks, and learning paths.
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={handlePrint}
                    className="border-white/10 hover:bg-white/5 text-white/80 hover:text-white gap-2 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    Print Progress
                  </Button>
                  <Button
                    onClick={handleExportExcel}
                    className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 gap-2 cursor-pointer"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              </div>

              {/* Stats overview grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 print:hidden">
                <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-sm">
                  <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Total Completed Topics</span>
                  <div className="text-3xl font-bold text-white mt-1">{overallStats.totalCompleted}</div>
                </div>
                <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-sm">
                  <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Active Roadmaps</span>
                  <div className="text-3xl font-bold text-cyan-400 mt-1">{overallStats.startedRoadmaps}</div>
                </div>
                <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-sm">
                  <span className="text-xs text-white/40 uppercase tracking-wider font-semibold">Bookmarks Saved</span>
                  <div className="text-3xl font-bold text-violet-400 mt-1">{bookmarkedRoadmaps.length}</div>
                </div>
              </div>

              {/* Tabs controls */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full print:hidden">
                <TabsList className="bg-white/5 border border-white/10 text-white/60 p-1 rounded-xl mb-8 flex-wrap h-auto gap-1">
                  <TabsTrigger
                    value="progress"
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm cursor-pointer"
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    My Progress
                  </TabsTrigger>
                  <TabsTrigger
                    value="bookmarks"
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm cursor-pointer"
                  >
                    <Bookmark className="h-4 w-4 mr-2" />
                    Bookmarks ({bookmarkedRoadmaps.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="recent"
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm cursor-pointer"
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Recently Viewed
                  </TabsTrigger>
                  <TabsTrigger
                    value="profile"
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm cursor-pointer"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Profile
                  </TabsTrigger>
                </TabsList>

                {/* Progress Tab Content */}
                <TabsContent value="progress">
                  {progressDetails.length === 0 ? (
                    <div className="border border-white/[0.06] bg-white/[0.01] rounded-2xl p-16 text-center text-white/40 text-sm max-w-md mx-auto">
                      <Compass className="h-10 w-10 text-cyan-400/50 mx-auto mb-4" />
                      <p className="font-bold text-white mb-1">No progress logged yet</p>
                      <p className="text-white/40 mb-6">Open any learning path and mark topics as completed.</p>
                      <Button onClick={() => router.push("/#roadmaps")} className="bg-white/10 hover:bg-white/15 text-white border-0 cursor-pointer">
                        Find Roadmaps
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {progressDetails.map((roadmap) => {
                        const percent = roadmap.totalNodes > 0 ? Math.round((roadmap.completedNodes / roadmap.totalNodes) * 100) : 0;
                        return (
                          <div
                            key={roadmap.id}
                            className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-sm hover:border-cyan-500/20 transition-all"
                          >
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                              <div>
                                <span className="text-xs text-cyan-400 font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                                  {roadmap.category}
                                </span>
                                <h3 className="text-lg font-bold text-white mt-2">{roadmap.title}</h3>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => router.push(`/roadmap/${roadmap.id}`)}
                                className="bg-white/10 hover:bg-white/15 border border-white/20 text-white gap-1 cursor-pointer shrink-0"
                              >
                                Continue
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex items-center justify-between text-xs text-white/50 mb-2">
                              <span>Path Completion</span>
                              <span className="font-bold text-cyan-400">{percent}% ({roadmap.completedNodes}/{roadmap.totalNodes})</span>
                            </div>
                            <Progress value={percent} className="h-1.5 bg-white/5" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* Bookmarks Tab Content */}
                <TabsContent value="bookmarks">
                  {bookmarkedRoadmaps.length === 0 ? (
                    <div className="border border-white/[0.06] bg-white/[0.01] rounded-2xl p-16 text-center text-white/40 text-sm max-w-md mx-auto">
                      <Bookmark className="h-10 w-10 text-violet-400/50 mx-auto mb-4" />
                      <p className="font-bold text-white mb-1">No bookmarked roadmaps</p>
                      <p className="text-white/40 mb-6">Bookmark your favorite paths to save them here.</p>
                      <Button onClick={() => router.push("/#roadmaps")} className="bg-white/10 hover:bg-white/15 text-white border-0 cursor-pointer">
                        Browse Paths
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {bookmarkedRoadmaps.map((roadmap) => (
                        <div
                          key={roadmap.id}
                          onClick={() => router.push(`/roadmap/${roadmap.id}`)}
                          className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-sm hover:border-cyan-500/30 transition-all cursor-pointer flex flex-col justify-between"
                        >
                          <div>
                            <span className="text-xs text-white/40 font-semibold">{roadmap.category}</span>
                            <h3 className="text-base font-bold text-white mt-1 mb-2">{roadmap.title}</h3>
                            <p className="text-white/50 text-xs line-clamp-2">{roadmap.description}</p>
                          </div>
                          <div className="flex items-center justify-between text-xs text-white/30 pt-4 mt-4 border-t border-white/[0.05]">
                            <span>{roadmap.difficulty}</span>
                            <span className="text-cyan-400 flex items-center gap-1 font-semibold group-hover:text-cyan-300">
                              Open Path
                              <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Recently Viewed Tab Content */}
                <TabsContent value="recent">
                  {recentRoadmaps.length === 0 ? (
                    <div className="border border-white/[0.06] bg-white/[0.01] rounded-2xl p-16 text-center text-white/40 text-sm max-w-md mx-auto">
                      <Clock className="h-10 w-10 text-white/30 mx-auto mb-4" />
                      <p className="font-bold text-white mb-1">No view history</p>
                      <p className="text-white/40 mb-6">Your recently visited learning paths will show up here.</p>
                      <Button onClick={() => router.push("/#roadmaps")} className="bg-white/10 hover:bg-white/15 text-white border-0 cursor-pointer">
                        Start Exploring
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {recentRoadmaps.map((roadmap) => (
                        <div
                          key={roadmap.id}
                          onClick={() => router.push(`/roadmap/${roadmap.id}`)}
                          className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-sm hover:border-cyan-500/30 transition-all cursor-pointer flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex justify-between items-start gap-2 mb-2">
                              <span className="text-xs text-white/40 font-semibold">{roadmap.category}</span>
                              <span className="text-[10px] text-white/30">
                                {roadmap.viewedAt ? new Date(roadmap.viewedAt).toLocaleDateString() : ""}
                              </span>
                            </div>
                            <h3 className="text-base font-bold text-white">{roadmap.title}</h3>
                            <p className="text-white/50 text-xs line-clamp-2 mt-1">{roadmap.description}</p>
                          </div>
                          <div className="flex items-center justify-between text-xs text-white/30 pt-4 mt-4 border-t border-white/[0.05]">
                            <span>{roadmap.difficulty}</span>
                            <span className="text-cyan-400 flex items-center gap-1 font-semibold">
                              Open Path
                              <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Profile Tab Content */}
                <TabsContent value="profile">
                  {user && (
                    <div className="max-w-xl mx-auto rounded-2xl border border-white/[0.08] bg-black/60 backdrop-blur-xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] space-y-6">
                      <div className="flex items-center gap-6 pb-6 border-b border-white/[0.08]">
                        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white font-bold text-2xl flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                          {user.user_metadata?.full_name?.[0]?.toUpperCase() ||
                            user.email?.[0]?.toUpperCase() ||
                            "U"}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white">{user.user_metadata?.full_name || "Student"}</h3>
                          <span className="text-white/40 text-sm flex items-center gap-1.5 mt-1">
                            <Mail className="h-4 w-4 text-cyan-400" />
                            {user.email}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                          <span className="text-white/40 block text-xs">Member Since</span>
                          <span className="text-white font-semibold flex items-center gap-1.5 mt-1">
                            <Calendar className="h-4 w-4 text-cyan-400" />
                            {new Date(user.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                          <span className="text-white/40 block text-xs">Total Completed Topics</span>
                          <span className="text-white font-semibold flex items-center gap-1.5 mt-1">
                            <CheckCircle className="h-4 w-4 text-cyan-400" />
                            {overallStats.totalCompleted} Topics
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Printable layout page (hidden normally, visible when printing) */}
              <div className="hidden print:block text-black bg-white p-8 w-full font-sans" id="printable-report">
                <div className="border-b border-gray-300 pb-6 mb-8 text-center">
                  <h1 className="text-3xl font-extrabold tracking-tight">Roadmap Platform Progress Report</h1>
                  {user && (
                    <div className="mt-2 text-sm text-gray-600">
                      <span>Student: {user.user_metadata?.full_name || "Student"} ({user.email})</span>
                      <span className="mx-3">|</span>
                      <span>Date: {new Date().toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wide mb-2">Overall Statistics</h3>
                  <div className="grid grid-cols-3 gap-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div>
                      <span className="text-xs text-gray-500 block">Total Completed Topics</span>
                      <span className="text-xl font-bold text-gray-900">{overallStats.totalCompleted}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">Active Roadmaps</span>
                      <span className="text-xl font-bold text-gray-900">{overallStats.startedRoadmaps}</span>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 block">Report Generation</span>
                      <span className="text-xl font-bold text-gray-900">Success</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wide mb-4">Detailed Learning Paths</h3>
                  {progressDetails.length === 0 ? (
                    <p className="text-gray-500 text-sm">No progress recorded yet.</p>
                  ) : (
                    <div className="space-y-6">
                      {progressDetails.map((roadmap) => {
                        const percent = roadmap.totalNodes > 0 ? Math.round((roadmap.completedNodes / roadmap.totalNodes) * 100) : 0;
                        return (
                          <div key={roadmap.id} className="border border-gray-200 rounded-lg p-5">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2 mb-3">
                              <div>
                                <h4 className="text-base font-bold text-gray-900">{roadmap.title}</h4>
                                <span className="text-xs text-gray-500 font-semibold">{roadmap.category}</span>
                              </div>
                              <span className="text-sm font-bold text-gray-900">
                                {percent}% Complete ({roadmap.completedNodes}/{roadmap.totalNodes})
                              </span>
                            </div>

                            <table className="w-full text-xs text-left border-collapse">
                              <thead>
                                <tr className="border-b border-gray-200 text-gray-500 font-bold bg-gray-50">
                                  <th className="py-2 px-3">Section</th>
                                  <th className="py-2 px-3">Topic Title</th>
                                  <th className="py-2 px-3">Status</th>
                                  <th className="py-2 px-3">Completion Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {roadmap.nodes.map((n: any, idx: number) => (
                                  <tr key={idx} className="border-b border-gray-100">
                                    <td className="py-2 px-3 font-semibold">{n.sectionTitle}</td>
                                    <td className="py-2 px-3">{n.nodeTitle}</td>
                                    <td className="py-2 px-3 font-bold text-green-700">Completed</td>
                                    <td className="py-2 px-3 text-gray-600">
                                      {n.completedAt ? new Date(n.completedAt).toLocaleDateString() : ""}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      <Footer className="print:hidden" />
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
