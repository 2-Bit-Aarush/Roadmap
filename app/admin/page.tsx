"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { Footer } from "@/components/footer";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  Shield,
  FileText,
  Users,
  History,
  Plus,
  Edit2,
  Trash2,
  Settings,
  FolderOpen,
  ArrowUp,
  ArrowDown,
  Globe,
  PlusCircle,
  X,
  Save,
  Check,
  Eye,
  EyeOff,
  BookOpen,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

// Zod schemas for admin input validation
const roadmapSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title must not exceed 100 characters"),
  description: z.string().max(1000, "Description must not exceed 1000 characters").optional(),
  category: z.string().min(1, "Category is required"),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  estimated_duration: z.string().min(1, "Estimated duration is required").max(50, "Duration must not exceed 50 characters"),
  is_published: z.boolean(),
});

const sectionSchema = z.object({
  title: z.string().min(2, "Section title must be at least 2 characters").max(100, "Section title must not exceed 100 characters"),
  description: z.string().max(500, "Description must not exceed 500 characters").optional(),
});

const nodeSchema = z.object({
  title: z.string().min(2, "Topic title must be at least 2 characters").max(100, "Topic title must not exceed 100 characters"),
  description: z.string().max(5000, "Description must not exceed 5000 characters").optional(),
  resources: z.array(
    z.object({
      title: z.string().min(1, "Resource title is required"),
      url: z.string().url("Please enter a valid URL"),
      type: z.string(),
    })
  ),
});

const categories = [
  "Web Development",
  "Machine Learning",
  "Cyber Security",
  "App Development",
  "Data Science",
  "DevOps",
];

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "roadmaps";

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Roadmaps list & forms
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [isRoadmapModalOpen, setIsRoadmapModalOpen] = useState(false);
  const [editingRoadmap, setEditingRoadmap] = useState<any>(null);
  
  // Roadmap form states
  const [rmTitle, setRmTitle] = useState("");
  const [rmDescription, setRmDescription] = useState("");
  const [rmCategory, setRmCategory] = useState("Web Development");
  const [rmDifficulty, setRmDifficulty] = useState("Beginner");
  const [rmDuration, setRmDuration] = useState("");
  const [rmIsPublished, setRmIsPublished] = useState(false);

  // Content Architect sub-view states
  const [selectedRoadmapForContent, setSelectedRoadmapForContent] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionDesc, setNewSectionDesc] = useState("");

  // Topic Node form states
  const [activeSectionForNode, setActiveSectionForNode] = useState<string | null>(null);
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeDescription, setNodeDescription] = useState("");
  const [nodeResources, setNodeResources] = useState<any[]>([]);
  const [resTitle, setResTitle] = useState("");
  const [resUrl, setResUrl] = useState("");
  const [editingNode, setEditingNode] = useState<any>(null);

  // Users analytics & logs
  const [usersList, setUsersList] = useState<any[]>([]);
  const [logsList, setLogsList] = useState<any[]>([]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    async function verifyAdminAndLoad() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push("/login");
          return;
        }

        // Verify role in database
        const { data: adminRole } = await supabase
          .from("admin_roles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        if (!adminRole || adminRole.role !== "admin") {
          router.push("/dashboard");
          return;
        }

        setAdminUser(session.user);

        // Fetch Roadmaps
        await loadRoadmaps();

        // Fetch Users list
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*");
        
        // Count progress per user to calculate analytics
        const { data: progress } = await supabase
          .from("progress_tracking")
          .select("user_id, completed");

        const usersWithStats = profiles?.map((u) => {
          const userProgress = progress?.filter((p) => p.user_id === u.id && p.completed) || [];
          return {
            ...u,
            completedCount: userProgress.length,
          };
        }) || [];
        setUsersList(usersWithStats);

        // Fetch Audit Logs
        const { data: logs } = await supabase
          .from("admin_logs")
          .select("*, profiles(name, email)")
          .order("created_at", { ascending: false })
          .limit(100);
        setLogsList(logs || []);

      } catch (err) {
        console.error("Admin initialization error:", err);
      } finally {
        setLoading(false);
      }
    }

    verifyAdminAndLoad();
  }, [router]);

  const loadRoadmaps = async () => {
    const { data } = await supabase
      .from("roadmaps")
      .select("*")
      .order("created_at", { ascending: false });
    setRoadmaps(data || []);
  };

  const recordAdminLog = async (action: string, details: any) => {
    if (!adminUser) return;
    try {
      await supabase.from("admin_logs").insert({
        admin_id: adminUser.id,
        action,
        details,
      });
    } catch (e) {
      console.error("Failed to log admin action:", e);
    }
  };

  const handleSaveRoadmap = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // 1. Zod input validation
      const validatedData = roadmapSchema.parse({
        title: rmTitle,
        description: rmDescription || undefined,
        category: rmCategory,
        difficulty: rmDifficulty,
        estimated_duration: rmDuration,
        is_published: rmIsPublished,
      });

      const roadmapPayload = {
        title: validatedData.title,
        description: validatedData.description || "",
        category: validatedData.category,
        difficulty: validatedData.difficulty,
        estimated_duration: validatedData.estimated_duration,
        is_published: validatedData.is_published,
        created_by: adminUser.id,
        updated_at: new Date().toISOString(),
      };

      if (editingRoadmap) {
        const { error } = await supabase
          .from("roadmaps")
          .update(roadmapPayload)
          .eq("id", editingRoadmap.id);

        if (error) throw error;
        toast.success("Roadmap updated successfully");
        await recordAdminLog("update_roadmap", { id: editingRoadmap.id, title: validatedData.title });
      } else {
        const { data, error } = await supabase
          .from("roadmaps")
          .insert(roadmapPayload)
          .select()
          .single();

        if (error) throw error;
        toast.success("Roadmap created successfully");
        await recordAdminLog("create_roadmap", { id: data.id, title: validatedData.title });
      }

      setIsRoadmapModalOpen(false);
      setEditingRoadmap(null);
      resetRoadmapForm();
      await loadRoadmaps();
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      } else {
        toast.error(err.message || "Failed to save roadmap");
      }
    }
  };

  const resetRoadmapForm = () => {
    setRmTitle("");
    setRmDescription("");
    setRmCategory("Web Development");
    setRmDifficulty("Beginner");
    setRmDuration("");
    setRmIsPublished(false);
  };

  const handleEditRoadmap = (rm: any) => {
    setEditingRoadmap(rm);
    setRmTitle(rm.title);
    setRmDescription(rm.description);
    setRmCategory(rm.category);
    setRmDifficulty(rm.difficulty);
    setRmDuration(rm.estimated_duration);
    setRmIsPublished(rm.is_published);
    setIsRoadmapModalOpen(true);
  };

  const handleDeleteRoadmap = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      const { error } = await supabase.from("roadmaps").delete().eq("id", id);
      if (error) throw error;
      toast.success("Roadmap deleted successfully");
      await recordAdminLog("delete_roadmap", { id, title });
      await loadRoadmaps();
      if (selectedRoadmapForContent?.id === id) {
        setSelectedRoadmapForContent(null);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete roadmap");
    }
  };

  // Manage Content sub-view loaders
  const loadRoadmapContent = async (rm: any) => {
    setSelectedRoadmapForContent(rm);
    setLoading(true);
    try {
      const { data: sectionData } = await supabase
        .from("roadmap_sections")
        .select("*")
        .eq("roadmap_id", rm.id)
        .order("order_index", { ascending: true });

      setSections(sectionData || []);

      if (sectionData && sectionData.length > 0) {
        const { data: nodeData } = await supabase
          .from("roadmap_nodes")
          .select("*")
          .in("section_id", sectionData.map((s) => s.id))
          .order("order_index", { ascending: true });
        setNodes(nodeData || []);
      } else {
        setNodes([]);
      }
    } catch (err) {
      toast.error("Failed to load content details");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionTitle || !selectedRoadmapForContent) return;

    try {
      // Validate input using Zod section schema
      const validatedData = sectionSchema.parse({
        title: newSectionTitle,
        description: newSectionDesc || undefined,
      });

      const nextIndex = sections.length > 0 ? Math.max(...sections.map(s => s.order_index)) + 1 : 0;
      const { data, error } = await supabase
        .from("roadmap_sections")
        .insert({
          roadmap_id: selectedRoadmapForContent.id,
          title: validatedData.title,
          description: validatedData.description || "",
          order_index: nextIndex,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Section added");
      setSections([...sections, data]);
      setNewSectionTitle("");
      setNewSectionDesc("");
      await recordAdminLog("create_section", { roadmap_id: selectedRoadmapForContent.id, title: validatedData.title });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      } else {
        toast.error(err.message || "Failed to add section");
      }
    }
  };

  const handleMoveSection = async (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === sections.length - 1) return;

    const swapIndex = direction === "up" ? index - 1 : index + 1;
    const item1 = sections[index];
    const item2 = sections[swapIndex];

    try {
      const { error: err1 } = await supabase
        .from("roadmap_sections")
        .update({ order_index: item2.order_index })
        .eq("id", item1.id);
      
      const { error: err2 } = await supabase
        .from("roadmap_sections")
        .update({ order_index: item1.order_index })
        .eq("id", item2.id);

      if (err1 || err2) throw new Error("Swap failed");

      // Reload
      await loadRoadmapContent(selectedRoadmapForContent);
    } catch {
      toast.error("Failed to reorder sections");
    }
  };

  const handleDeleteSection = async (sectionId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete section "${title}" and all its topics?`)) return;
    try {
      const { error } = await supabase.from("roadmap_sections").delete().eq("id", sectionId);
      if (error) throw error;
      toast.success("Section deleted");
      await recordAdminLog("delete_section", { roadmap_id: selectedRoadmapForContent.id, section_id: sectionId, title });
      await loadRoadmapContent(selectedRoadmapForContent);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete section");
    }
  };

  // Node controls
  const handleAddResource = () => {
    if (!resTitle || !resUrl) return;
    try {
      z.string().url("Please enter a valid URL").parse(resUrl);
      if (!resTitle.trim()) {
        toast.error("Resource title is required");
        return;
      }
      setNodeResources([...nodeResources, { title: resTitle, url: resUrl, type: "link" }]);
      setResTitle("");
      setResUrl("");
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      } else {
        toast.error("Invalid resource URL");
      }
    }
  };

  const handleRemoveResource = (index: number) => {
    setNodeResources(nodeResources.filter((_, idx) => idx !== index));
  };

  const handleSaveNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeTitle || (!activeSectionForNode && !editingNode)) return;

    try {
      // Validate node input using Zod nodeSchema
      const validatedData = nodeSchema.parse({
        title: nodeTitle,
        description: nodeDescription || undefined,
        resources: nodeResources,
      });

      const sectionId = editingNode ? editingNode.section_id : activeSectionForNode;
      const nextIndex = nodes.filter(n => n.section_id === sectionId).length;

      const nodePayload = {
        section_id: sectionId,
        title: validatedData.title,
        description: validatedData.description || "",
        resources: validatedData.resources,
        updated_at: new Date().toISOString(),
      };

      if (editingNode) {
        const { error } = await supabase
          .from("roadmap_nodes")
          .update(nodePayload)
          .eq("id", editingNode.id);

        if (error) throw error;
        toast.success("Topic updated successfully");
        await recordAdminLog("update_node", { id: editingNode.id, title: validatedData.title });
      } else {
        const { error } = await supabase
          .from("roadmap_nodes")
          .insert({
            ...nodePayload,
            order_index: nextIndex,
          });

        if (error) throw error;
        toast.success("Topic added successfully");
        await recordAdminLog("create_node", { section_id: sectionId, title: validatedData.title });
      }

      setEditingNode(null);
      setActiveSectionForNode(null);
      resetNodeForm();
      await loadRoadmapContent(selectedRoadmapForContent);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      } else {
        toast.error(err.message || "Failed to save topic");
      }
    }
  };

  const resetNodeForm = () => {
    setNodeTitle("");
    setNodeDescription("");
    setNodeResources([]);
    setResTitle("");
    setResUrl("");
  };

  const handleEditNodeClick = (node: any) => {
    setEditingNode(node);
    setNodeTitle(node.title);
    setNodeDescription(node.description || "");
    setNodeResources(node.resources || []);
    setActiveSectionForNode(node.section_id);
  };

  const handleMoveNode = async (sectionId: string, nodeIndex: number, direction: "up" | "down") => {
    const sectionNodes = nodes.filter((n) => n.section_id === sectionId);
    if (direction === "up" && nodeIndex === 0) return;
    if (direction === "down" && nodeIndex === sectionNodes.length - 1) return;

    const swapIndex = direction === "up" ? nodeIndex - 1 : nodeIndex + 1;
    const item1 = sectionNodes[nodeIndex];
    const item2 = sectionNodes[swapIndex];

    try {
      const { error: err1 } = await supabase
        .from("roadmap_nodes")
        .update({ order_index: item2.order_index })
        .eq("id", item1.id);
      
      const { error: err2 } = await supabase
        .from("roadmap_nodes")
        .update({ order_index: item1.order_index })
        .eq("id", item2.id);

      if (err1 || err2) throw new Error("Swap failed");
      await loadRoadmapContent(selectedRoadmapForContent);
    } catch {
      toast.error("Failed to reorder topics");
    }
  };

  const handleDeleteNode = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete topic "${title}"?`)) return;
    try {
      const { error } = await supabase.from("roadmap_nodes").delete().eq("id", id);
      if (error) throw error;
      toast.success("Topic deleted");
      await recordAdminLog("delete_node", { id, title });
      await loadRoadmapContent(selectedRoadmapForContent);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete topic");
    }
  };

  return (
    <main className="relative min-h-screen bg-background overflow-x-hidden flex flex-col justify-between">
      <Toaster position="top-center" theme="dark" />

      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-background to-background" />
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />
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
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-10 w-1/4 bg-white/10 rounded" />
              <div className="h-48 bg-white/[0.02] border border-white/[0.05] rounded-2xl" />
            </div>
          ) : selectedRoadmapForContent ? (
            /* Roadmap Content Architect View */
            <div className="flex-1 flex flex-col">
              {/* Back link */}
              <div className="mb-6">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedRoadmapForContent(null)}
                  className="text-white/60 hover:text-white hover:bg-white/5 gap-2 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Roadmaps List
                </Button>
              </div>

              {/* Header Details */}
              <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-violet-400 font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20">
                      Content Architect
                    </span>
                    <span className="text-xs text-white/40">{selectedRoadmapForContent.category}</span>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
                    Designing: {selectedRoadmapForContent.title}
                  </h1>
                </div>
              </div>

              {/* Migration Alert for v1 */}
              {selectedRoadmapForContent.schema_version !== "v2" && (
                <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 backdrop-blur-sm">
                  <div>
                    <h4 className="font-bold text-sm">Legacy Format (Section/Node)</h4>
                    <p className="text-xs text-amber-200/70 mt-1 max-w-xl">
                      This roadmap is currently using the legacy Section/Node format. You can migrate it to the new visual Flowchart Graph layout. This will execute server-side as a single atomic transaction and preserve user progress.
                    </p>
                  </div>
                  <Button
                    onClick={async () => {
                      if (!confirm("Are you sure you want to migrate this roadmap to the visual flowchart editor? This will automatically layout sections vertically and connect nodes sequentially. This transaction-safe migration cannot be undone.")) return;
                      try {
                        const { error } = await supabase.rpc("migrate_roadmap_to_v2", { target_roadmap_id: selectedRoadmapForContent.id });
                        if (error) throw error;
                        toast.success("Successfully migrated roadmap to flowchart (v2)!");
                        router.push(`/admin/edit/${selectedRoadmapForContent.id}`);
                      } catch (err: any) {
                        toast.error(err.message || "Failed to migrate roadmap");
                      }
                    }}
                    className="bg-amber-600 hover:bg-amber-500 text-white border-0 shrink-0 text-xs font-semibold cursor-pointer py-2 px-4 rounded-lg"
                  >
                    Migrate to Flowchart (v2)
                  </Button>
                </div>
              )}

              <div className="grid lg:grid-cols-3 gap-8 items-start">
                {/* Left Columns - Architect list */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Create section form */}
                  <div className="p-6 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-sm">
                    <h3 className="text-base font-bold text-white mb-4">Add New Section</h3>
                    <form onSubmit={handleAddSection} className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="sec-title" className="text-white/70 text-xs">Section Title</Label>
                          <Input
                            id="sec-title"
                            placeholder="e.g. Fundamentals"
                            value={newSectionTitle}
                            onChange={(e) => setNewSectionTitle(e.target.value)}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="sec-desc" className="text-white/70 text-xs">Short Description (Optional)</Label>
                          <Input
                            id="sec-desc"
                            placeholder="Basic foundational principles"
                            value={newSectionDesc}
                            onChange={(e) => setNewSectionDesc(e.target.value)}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        className="bg-violet-600 hover:bg-violet-500 text-white border-0 shadow-[0_0_15px_rgba(139,92,246,0.2)] cursor-pointer"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Section
                      </Button>
                    </form>
                  </div>

                  {/* Visual tree structure */}
                  {sections.length === 0 ? (
                    <div className="border border-dashed border-white/10 rounded-2xl p-16 text-center text-white/30 text-sm">
                      No sections created yet. Add your first section above.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {sections.map((section, sIndex) => {
                        const sectionNodes = nodes.filter((n) => n.section_id === section.id);

                        return (
                          <div key={section.id} className="p-6 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-sm relative">
                            {/* Section Controls */}
                            <div className="flex justify-between items-start gap-4 mb-4 border-b border-white/[0.05] pb-4">
                              <div>
                                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                  <span className="text-xs text-white/40 font-mono">Sec {sIndex + 1}:</span>
                                  {section.title}
                                </h3>
                                {section.description && (
                                  <p className="text-xs text-white/40 mt-1">{section.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleMoveSection(sIndex, "up")}
                                  disabled={sIndex === 0}
                                  className="h-8 w-8 text-white/50 hover:text-white cursor-pointer"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleMoveSection(sIndex, "down")}
                                  disabled={sIndex === sections.length - 1}
                                  className="h-8 w-8 text-white/50 hover:text-white cursor-pointer"
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteSection(section.id, section.title)}
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10 cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Node checklist within section */}
                            {sectionNodes.length === 0 ? (
                              <p className="text-white/30 text-xs italic mb-4">No topic nodes added to this section.</p>
                            ) : (
                              <div className="space-y-2 mb-4">
                                {sectionNodes.map((node, nIndex) => (
                                  <div
                                    key={node.id}
                                    className="p-3 rounded-lg bg-white/5 border border-white/10 flex justify-between items-center gap-4 hover:border-white/20 transition-all"
                                  >
                                    <div className="overflow-hidden">
                                      <h4 className="font-bold text-white text-sm truncate">{node.title}</h4>
                                      {node.resources && node.resources.length > 0 && (
                                        <span className="text-[10px] text-cyan-400 mt-0.5 block">
                                          {node.resources.length} resource links attached
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleMoveNode(section.id, nIndex, "up")}
                                        disabled={nIndex === 0}
                                        className="h-7 w-7 text-white/40 hover:text-white cursor-pointer"
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleMoveNode(section.id, nIndex, "down")}
                                        disabled={nIndex === sectionNodes.length - 1}
                                        className="h-7 w-7 text-white/40 hover:text-white cursor-pointer"
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleEditNodeClick(node)}
                                        className="h-7 w-7 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeleteNode(node.id, node.title)}
                                        className="h-7 w-7 text-destructive hover:bg-destructive/10 cursor-pointer"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Trigger form to add node */}
                            {!activeSectionForNode && !editingNode && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setActiveSectionForNode(section.id)}
                                className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 cursor-pointer"
                              >
                                <PlusCircle className="h-4 w-4 mr-1.5" />
                                Add Topic Node
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Columns - Node Form Details */}
                <div className="lg:col-span-1">
                  {(activeSectionForNode || editingNode) && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-6 rounded-xl border border-white/[0.08] bg-black/60 backdrop-blur-xl sticky top-28 shadow-xl"
                    >
                      <div className="flex items-center justify-between mb-6 pb-2 border-b border-white/[0.05]">
                        <h3 className="font-bold text-white text-base">
                          {editingNode ? "Edit Topic Node" : "New Topic Node"}
                        </h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingNode(null);
                            setActiveSectionForNode(null);
                            resetNodeForm();
                          }}
                          className="h-7 w-7 text-white/40 hover:text-white cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <form onSubmit={handleSaveNode} className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="node-title" className="text-white/70 text-xs">Topic Title</Label>
                          <Input
                            id="node-title"
                            placeholder="e.g. Basic Syntaxes"
                            value={nodeTitle}
                            onChange={(e) => setNodeTitle(e.target.value)}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="node-desc" className="text-white/70 text-xs">Detailed Description</Label>
                          <Textarea
                            id="node-desc"
                            rows={4}
                            placeholder="Enter study guide details and reference material description..."
                            value={nodeDescription}
                            onChange={(e) => setNodeDescription(e.target.value)}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs"
                          />
                        </div>

                        {/* Resources Sub Form */}
                        <div className="border-t border-white/[0.05] pt-4">
                          <Label className="text-white/40 text-[10px] uppercase font-bold tracking-wider block mb-3">
                            Learning Resources Links
                          </Label>

                          {/* Render resources list */}
                          {nodeResources.length > 0 && (
                            <div className="space-y-1.5 mb-3">
                              {nodeResources.map((res, index) => (
                                <div key={index} className="flex justify-between items-center gap-3 p-2 rounded bg-white/5 text-xs">
                                  <span className="truncate flex-1 font-medium">{res.title}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveResource(index)}
                                    className="text-destructive hover:text-red-400"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <Input
                              placeholder="Link Title (e.g. MDN Docs)"
                              value={resTitle}
                              onChange={(e) => setResTitle(e.target.value)}
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs h-8"
                            />
                            <Input
                              placeholder="URL (https://...)"
                              value={resUrl}
                              onChange={(e) => setResUrl(e.target.value)}
                              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs h-8"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddResource}
                            className="w-full border-white/10 hover:bg-white/5 text-xs text-cyan-400 cursor-pointer"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Resource Link
                          </Button>
                        </div>

                        <div className="flex gap-2 pt-4">
                          <Button
                            type="submit"
                            className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white border-0 cursor-pointer"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Save Topic
                          </Button>
                        </div>
                      </form>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Main Admin Dashboard View */
            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h1
                    className="text-3xl md:text-5xl font-bold text-white mb-2"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Admin Control Panel
                  </h1>
                  <p className="text-white/50 text-sm">
                    Manage learning paths, analyze users, and audit operations.
                  </p>
                </div>
              </div>

              {/* Tabs controls */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-white/5 border border-white/10 text-white/60 p-1 rounded-xl mb-8 flex-wrap h-auto gap-1">
                  <TabsTrigger
                    value="roadmaps"
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm cursor-pointer"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Manage Roadmaps
                  </TabsTrigger>
                  <TabsTrigger
                    value="analytics"
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm cursor-pointer"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    User Analytics
                  </TabsTrigger>
                  <TabsTrigger
                    value="logs"
                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm cursor-pointer"
                  >
                    <History className="h-4 w-4 mr-2" />
                    Audit Logs
                  </TabsTrigger>
                </TabsList>

                {/* Manage Roadmaps Tab */}
                <TabsContent value="roadmaps">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-white">All Platform Roadmaps</h3>
                    <Button
                      onClick={() => {
                        setEditingRoadmap(null);
                        resetRoadmapForm();
                        setIsRoadmapModalOpen(true);
                      }}
                      className="bg-violet-600 hover:bg-violet-500 text-white border-0 shadow-[0_0_15px_rgba(139,92,246,0.3)] cursor-pointer"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Roadmap
                    </Button>
                  </div>

                  {/* Roadmaps List Table */}
                  <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-white/5 border-b border-white/10">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-white/60">Roadmap Title</TableHead>
                          <TableHead className="text-white/60">Category</TableHead>
                          <TableHead className="text-white/60">Difficulty</TableHead>
                          <TableHead className="text-white/60">Duration</TableHead>
                          <TableHead className="text-white/60">Status</TableHead>
                          <TableHead className="text-white/60 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roadmaps.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-white/40 py-10">
                              No roadmaps created yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          roadmaps.map((rm) => (
                            <TableRow key={rm.id} className="border-b border-white/[0.05] hover:bg-white/[0.02]">
                              <TableCell className="font-semibold text-white">{rm.title}</TableCell>
                              <TableCell className="text-white/70">{rm.category}</TableCell>
                              <TableCell className="text-white/70">{rm.difficulty}</TableCell>
                              <TableCell className="text-white/70">{rm.estimated_duration}</TableCell>
                              <TableCell>
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                                  rm.is_published
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                )}>
                                  {rm.is_published ? (
                                    <>
                                      <Eye className="h-3 w-3" />
                                      Published
                                    </>
                                  ) : (
                                    <>
                                      <EyeOff className="h-3 w-3" />
                                      Draft
                                    </>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (rm.schema_version === "v2") {
                                        router.push(`/admin/edit/${rm.id}`);
                                      } else {
                                        loadRoadmapContent(rm);
                                      }
                                    }}
                                    className="border-white/10 hover:bg-white/5 text-cyan-400 cursor-pointer"
                                  >
                                    <Settings className="h-3.5 w-3.5 mr-1" />
                                    Architect
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEditRoadmap(rm)}
                                    className="h-8 w-8 text-white/60 hover:text-white cursor-pointer"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteRoadmap(rm.id, rm.title)}
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10 cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Users Analytics Tab */}
                <TabsContent value="analytics">
                  <h3 className="text-lg font-bold text-white mb-6">User Learning Progress Analytics</h3>
                  <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-white/5 border-b border-white/10">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-white/60">Student Name</TableHead>
                          <TableHead className="text-white/60">Email Address</TableHead>
                          <TableHead className="text-white/60">Completed Topics</TableHead>
                          <TableHead className="text-white/60">Profile Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersList.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-white/40 py-10">
                              No registered users found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          usersList.map((user) => (
                            <TableRow key={user.id} className="border-b border-white/[0.05] hover:bg-white/[0.02]">
                              <TableCell className="font-semibold text-white">{user.name}</TableCell>
                              <TableCell className="text-white/70">{user.email}</TableCell>
                              <TableCell className="text-cyan-400 font-bold">{user.completedCount} Topics</TableCell>
                              <TableCell className="text-white/40">
                                {user.updated_at ? new Date(user.updated_at).toLocaleDateString() : "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                {/* Audit Logs Tab */}
                <TabsContent value="logs">
                  <h3 className="text-lg font-bold text-white mb-6">Admin Action Audit Log</h3>
                  <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-white/5 border-b border-white/10">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-white/60">Timestamp</TableHead>
                          <TableHead className="text-white/60">Admin User</TableHead>
                          <TableHead className="text-white/60">Action Event</TableHead>
                          <TableHead className="text-white/60">Event Context Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logsList.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-white/40 py-10">
                              Audit history is clean. No logged operations yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          logsList.map((log) => (
                            <TableRow key={log.id} className="border-b border-white/[0.05] hover:bg-white/[0.02] text-xs">
                              <TableCell className="text-white/40 font-mono">
                                {new Date(log.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-white/80">
                                {log.profiles?.name || log.profiles?.email || log.admin_id}
                              </TableCell>
                              <TableCell>
                                <span className={cn(
                                  "px-2 py-0.5 rounded font-mono text-[10px] font-bold border",
                                  log.action.startsWith("create") && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                                  log.action.startsWith("update") && "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
                                  log.action.startsWith("delete") && "bg-destructive/10 border-destructive/20 text-destructive"
                                )}>
                                  {log.action}
                                </span>
                              </TableCell>
                              <TableCell className="text-white/60 max-w-sm truncate">
                                {log.details ? JSON.stringify(log.details) : "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Create/Edit Roadmap Dialog Modal */}
              <Dialog open={isRoadmapModalOpen} onOpenChange={() => setIsRoadmapModalOpen(false)}>
                <DialogContent className="bg-black/95 border border-white/10 text-white backdrop-blur-2xl max-w-lg shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-white mb-4">
                      {editingRoadmap ? "Modify Roadmap Settings" : "Create New Learning Roadmap"}
                    </DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleSaveRoadmap} className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="rm-title" className="text-white/70 text-xs">Roadmap Title</Label>
                      <Input
                        id="rm-title"
                        placeholder="e.g. Fullstack React Developer"
                        value={rmTitle}
                        onChange={(e) => setRmTitle(e.target.value)}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="rm-desc" className="text-white/70 text-xs">Description Summary</Label>
                      <Textarea
                        id="rm-desc"
                        rows={3}
                        placeholder="Study outline and target learning outcomes..."
                        value={rmDescription}
                        onChange={(e) => setRmDescription(e.target.value)}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-white/70 text-xs">Category Tag</Label>
                        <Select value={rmCategory} onValueChange={setRmCategory}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue placeholder="Select Category" />
                          </SelectTrigger>
                          <SelectContent className="bg-black border-white/10 text-white">
                            {categories.map((cat) => (
                              <SelectItem key={cat} value={cat} className="focus:bg-white/10 focus:text-white">
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1.5">
                          <Label className="text-white/70 text-xs">Difficulty</Label>
                          <Select value={rmDifficulty} onValueChange={setRmDifficulty}>
                            <SelectTrigger className="bg-white/5 border-white/10 text-white px-2">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent className="bg-black border-white/10 text-white">
                              {["Beginner", "Intermediate", "Advanced"].map((level) => (
                                <SelectItem key={level} value={level} className="focus:bg-white/10 focus:text-white">
                                  {level}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="rm-dur" className="text-white/70 text-xs">Duration</Label>
                          <Input
                            id="rm-dur"
                            placeholder="e.g. 2 months"
                            value={rmDuration}
                            onChange={(e) => setRmDuration(e.target.value)}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/20 px-2"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-3">
                      <Switch
                        checked={rmIsPublished}
                        onCheckedChange={setRmIsPublished}
                        id="publish-toggle"
                        className="data-[state=checked]:bg-cyan-500 cursor-pointer"
                      />
                      <label htmlFor="publish-toggle" className="text-xs font-semibold text-white/80 cursor-pointer flex items-center gap-1.5">
                        <span>Publish instantly on platform</span>
                        <span className="text-[10px] text-white/40">(Makes it visible to student users)</span>
                      </label>
                    </div>

                    <DialogFooter className="border-t border-white/10 pt-4 flex flex-row items-center justify-end gap-2 mt-6">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsRoadmapModalOpen(false)}
                        className="border-white/10 hover:bg-white/5 text-white/80 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-violet-600 hover:bg-violet-500 text-white border-0 cursor-pointer"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </section>
      </div>

      <Footer />
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AdminContent />
    </Suspense>
  );
}
