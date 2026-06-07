"use client";

import React, { useState, useEffect, use, useMemo } from "react";
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
  LayoutGrid,
  Search,
  SlidersHorizontal,
  Filter,
  Map,
  List
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface RoadmapPageProps {
  params: Promise<{ id: string }>;
}

export default function RoadmapPage({ params }: RoadmapPageProps) {
  return (
    <ReactFlowProvider>
      <RoadmapPageContent params={params} />
    </ReactFlowProvider>
  );
}

function RoadmapPageContent({ params }: RoadmapPageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const roadmapId = resolvedParams.id;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [roadmap, setRoadmap] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [activeNode, setActiveNode] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dual View Mode & Filtering States
  const [viewMode, setViewMode] = useState<"roadmap" | "title">("roadmap");
  const [searchQuery, setSearchQuery] = useState("");
  const [completionStatus, setCompletionStatus] = useState("all");
  const [categoryType, setCategoryType] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  
  // Collapse States (Issue 2)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [collapsedTopics, setCollapsedTopics] = useState<Record<string, boolean>>({});
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  const reactFlowInstance = useReactFlow();

  // Load view mode preference from localStorage
  useEffect(() => {
    if (typeof window !== "undefined" && roadmapId) {
      const saved = localStorage.getItem(`roadmap-viewmode-${roadmapId}`);
      if (saved === "title" || saved === "roadmap") {
        setViewMode(saved);
      }
    }
  }, [roadmapId]);

  const handleViewModeChange = (mode: "roadmap" | "title") => {
    setViewMode(mode);
    if (typeof window !== "undefined" && roadmapId) {
      localStorage.setItem(`roadmap-viewmode-${roadmapId}`, mode);
    }
  };

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

        if (roadmapData.schema_version === "v2") {
          // Fetch nodes directly
          const { data: nodeData, error: nodeError } = await supabase
            .from("roadmap_nodes")
            .select("*")
            .eq("roadmap_id", roadmapId);

          if (nodeError) throw nodeError;
          setNodes(nodeData || []);

          // Fetch edges
          const { data: edgeData, error: edgeError } = await supabase
            .from("roadmap_edges")
            .select("*")
            .eq("roadmap_id", roadmapId);

          if (edgeError) throw edgeError;
          setEdges(edgeData || []);

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
        } else {
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

  // Custom node types inside user view
  const customNodeTypes = {
    customNode: ({ data, id, selected }: NodeProps) => {
      const color = (data.color as string) || "#3b82f6";
      const typeLabel = (data.node_type as string) || "topic";
      const isDone = data.isCompleted as boolean;

      return (
        <div
          style={{
            border: selected
              ? "2px solid #22d3ee"
              : isDone
              ? "2px solid #10b981"
              : `1px solid ${color}40`,
            backgroundColor: "rgba(10, 10, 10, 0.9)",
            boxShadow: selected
              ? "0 0 20px rgba(34, 211, 238, 0.3)"
              : isDone
              ? "0 0 15px rgba(16, 185, 129, 0.2)"
              : `0 4px 15px rgba(0, 0, 0, 0.4)`,
          }}
          className="p-4 rounded-xl backdrop-blur-md min-w-[200px] text-white flex flex-col gap-1 transition-all duration-300 relative cursor-pointer"
        >
          <Handle type="target" position={Position.Top} className="!bg-cyan-400 !w-2 !h-2 !opacity-0 pointer-events-none" />
          <div className="flex items-center gap-1.5 mb-1 justify-between">
            <div className="flex items-center gap-1">
              <div style={{ backgroundColor: isDone ? "#10b981" : color }} className="w-1.5 h-1.5 rounded-full shadow-[0_0_6px_currentColor]" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                {typeLabel}
              </span>
            </div>
            {isDone && (
              <span className="text-[9px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                Done
              </span>
            )}
          </div>
          <div className="font-bold text-xs truncate pr-4 text-white/95">{data.label as string}</div>
          {typeof data.description === "string" && data.description && (
            <div className="text-[9px] text-white/40 line-clamp-2 mt-1 leading-normal font-normal">
              {data.description}
            </div>
          )}
          <Handle type="source" position={Position.Bottom} className="!bg-cyan-400 !w-2 !h-2 !opacity-0 pointer-events-none" />
        </div>
      );
    }
  };

  const flowchartNodes = nodes.map((n) => ({
    id: n.id,
    type: "customNode",
    position: { x: Number(n.x_position), y: Number(n.y_position) },
    selected: n.id === highlightedNodeId || (activeNode && activeNode.id === n.id),
    data: {
      label: n.title,
      description: n.description || "",
      node_type: n.node_type || "topic",
      color: n.color || "#3b82f6",
      resources: n.resources || [],
      isCompleted: completedNodes.includes(n.id)
    }
  }));

  const flowchartEdges = (edges || []).map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    label: e.label || "",
    animated: !completedNodes.includes(e.source_node_id) || !completedNodes.includes(e.target_node_id),
    markerEnd: { type: MarkerType.ArrowClosed, color: completedNodes.includes(e.source_node_id) && completedNodes.includes(e.target_node_id) ? "#10b981" : "#06b6d4" },
    style: {
      stroke: completedNodes.includes(e.source_node_id) && completedNodes.includes(e.target_node_id) ? "#10b981" : "#06b6d4",
      strokeWidth: 1.5
    },
  }));

  const handleStudentNodeClick = (_: any, node: any) => {
    const original = nodes.find((n) => n.id === node.id);
    if (original) {
      setActiveNode(original);
      setHighlightedNodeId(original.id);
    }
  };

  const focusOnNode = (node: any) => {
    setActiveNode(node);
    setViewMode("roadmap");
    setHighlightedNodeId(node.id);

    setTimeout(() => {
      try {
        const x = Number(node.x_position || 0);
        const y = Number(node.y_position || 0);
        reactFlowInstance.setCenter(x + 100, y + 40, { zoom: 1.1, duration: 800 });
      } catch (e) {
        console.warn("Failed to focus React Flow node:", e);
      }
    }, 100);
  };

  // Unique types computed for node type filter
  const uniqueTypes = useMemo(() => {
    const types = new Set<string>();
    nodes.forEach((n) => {
      if (n.node_type) types.add(n.node_type);
    });
    return Array.from(types);
  }, [nodes]);

  // Build the complete hierarchical tree from priority mapping sources (Issue 2)
  const buildHierarchy = () => {
    const parentMap = new globalThis.Map<string, string>(); // childId -> parentId

    // Build parent-child relationships from edges (Priority 2)
    edges.forEach((edge) => {
      if (edge.source_node_id && edge.target_node_id) {
        parentMap.set(edge.target_node_id, edge.source_node_id);
      } else if (edge.source && edge.target) {
        parentMap.set(edge.target, edge.source);
      }
    });

    // Build parent-child relationships from node metadata (Priority 3)
    nodes.forEach((node) => {
      if (node.metadata && typeof node.metadata === "object") {
        const parentId = node.metadata.parent_id || node.metadata.parent || node.metadata.parentId;
        if (parentId) {
          parentMap.set(node.id, String(parentId));
        }
      }
    });

    interface HierarchicalNode {
      node: any;
      subtopics: HierarchicalNode[];
    }

    interface HierarchicalSection {
      id: string;
      title: string;
      description?: string;
      topics: HierarchicalNode[];
    }

    const result: HierarchicalSection[] = [];
    const placedNodeIds = new Set<string>();

    // 1. Database Sections (Priority 1)
    if (sections && sections.length > 0) {
      sections.forEach((sec) => {
        const secNodes = nodes.filter((n) => n.section_id === sec.id);
        const topics: HierarchicalNode[] = [];

        // Identify top-level topics in this section: no parent, or parent not in this section, and not subtopic type
        secNodes.forEach((node) => {
          const hasParentInSec = parentMap.has(node.id) && secNodes.some((n) => n.id === parentMap.get(node.id));
          if (!hasParentInSec && node.node_type !== "subtopic") {
            topics.push({ node, subtopics: [] });
            placedNodeIds.add(node.id);
          }
        });

        // Match subtopics to their parent topics
        secNodes.forEach((node) => {
          if (node.node_type === "subtopic" || parentMap.has(node.id)) {
            const parentId = parentMap.get(node.id);
            const parentTopic = topics.find((t) => t.node.id === parentId);
            if (parentTopic) {
              parentTopic.subtopics.push({ node, subtopics: [] });
              placedNodeIds.add(node.id);
            }
          }
        });

        // Place any remaining nodes in this section that were skipped
        secNodes.forEach((node) => {
          if (!placedNodeIds.has(node.id)) {
            if (topics.length > 0) {
              topics[0].subtopics.push({ node, subtopics: [] });
            } else {
              topics.push({ node, subtopics: [] });
            }
            placedNodeIds.add(node.id);
          }
        });

        result.push({
          id: sec.id,
          title: sec.title,
          description: sec.description || "",
          topics
        });
      });
    }

    // 2. Flowchart Section Nodes (Priority 1)
    const flowchartSectionNodes = nodes.filter((n) => n.node_type === "section");
    if (flowchartSectionNodes.length > 0) {
      flowchartSectionNodes.forEach((secNode) => {
        const topics: HierarchicalNode[] = [];
        placedNodeIds.add(secNode.id);

        // Find topics linked to this section node
        nodes.forEach((node) => {
          if (node.node_type === "topic" && parentMap.get(node.id) === secNode.id) {
            topics.push({ node, subtopics: [] });
            placedNodeIds.add(node.id);
          }
        });

        // Find subtopics linked to these topics
        nodes.forEach((node) => {
          if (node.node_type === "subtopic") {
            const parentId = parentMap.get(node.id);
            const parentTopic = topics.find((t) => t.node.id === parentId);
            if (parentTopic) {
              parentTopic.subtopics.push({ node, subtopics: [] });
              placedNodeIds.add(node.id);
            }
          }
        });

        result.push({
          id: secNode.id,
          title: secNode.title,
          description: secNode.description || "",
          topics
        });
      });
    }

    // 3. Fallback: group any nodes not placed in any section yet under a "General" section (Priority 4)
    const unplacedNodes = nodes.filter((n) => !placedNodeIds.has(n.id) && n.node_type !== "section");
    if (unplacedNodes.length > 0) {
      const generalTopics: HierarchicalNode[] = [];

      // Find top-level unplaced nodes (topics)
      const unplacedTopics = unplacedNodes.filter((n) => n.node_type === "topic" || !parentMap.has(n.id));
      unplacedTopics.forEach((node) => {
        generalTopics.push({ node, subtopics: [] });
        placedNodeIds.add(node.id);
      });

      // Match remaining subtopics
      unplacedNodes.forEach((node) => {
        if (!placedNodeIds.has(node.id)) {
          const parentId = parentMap.get(node.id);
          const parentTopic = generalTopics.find((t) => t.node.id === parentId);
          if (parentTopic) {
            parentTopic.subtopics.push({ node, subtopics: [] });
            placedNodeIds.add(node.id);
          }
        }
      });

      // Place remaining orphans
      unplacedNodes.forEach((node) => {
        if (!placedNodeIds.has(node.id)) {
          if (generalTopics.length > 0) {
            generalTopics[0].subtopics.push({ node, subtopics: [] });
          } else {
            generalTopics.push({ node, subtopics: [] });
          }
          placedNodeIds.add(node.id);
        }
      });

      if (generalTopics.length > 0) {
        result.push({
          id: "general",
          title: "General Topics",
          description: "Topics that are not assigned to a specific section.",
          topics: generalTopics
        });
      }
    }

    return result;
  };

  // Filter hierarchy dynamically based on searchQuery, completionStatus, and categoryType (Issue 2 Search)
  const filteredHierarchy = useMemo(() => {
    const rawHierarchy = buildHierarchy();

    return rawHierarchy.map((sec) => {
      const filteredTopics = sec.topics.map((t) => {
        // Filter subtopics of this topic
        const filteredSubtopics = t.subtopics.filter((sub) => {
          const matchesSearch =
            searchQuery === "" ||
            sub.node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (sub.node.description &&
              sub.node.description.toLowerCase().includes(searchQuery.toLowerCase()));

          const isDone = completedNodes.includes(sub.node.id);
          const matchesStatus =
            completionStatus === "all" ||
            (completionStatus === "completed" && isDone) ||
            (completionStatus === "incomplete" && !isDone);

          const matchesType =
            categoryType === "all" || sub.node.node_type === categoryType;

          return matchesSearch && matchesStatus && matchesType;
        });

        // Filter topic itself
        const matchesSearch =
          searchQuery === "" ||
          t.node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.node.description &&
            t.node.description.toLowerCase().includes(searchQuery.toLowerCase()));

        const isDone = completedNodes.includes(t.node.id);
        const matchesStatus =
          completionStatus === "all" ||
          (completionStatus === "completed" && isDone) ||
          (completionStatus === "incomplete" && !isDone);

        const matchesType =
          categoryType === "all" || t.node.node_type === categoryType;

        const isTopicMatch = matchesSearch && matchesStatus && matchesType;

        // Keep topic if it matches directly OR if it has matching subtopics
        const shouldKeepTopic = isTopicMatch || filteredSubtopics.length > 0;

        if (shouldKeepTopic) {
          return {
            node: t.node,
            subtopics: filteredSubtopics
          };
        }
        return null;
      }).filter(Boolean) as any[];

      return {
        ...sec,
        topics: filteredTopics
      };
    }).filter((sec) => sec.topics.length > 0);
  }, [nodes, edges, sections, searchQuery, completionStatus, categoryType, completedNodes]);

  // Sort hierarchy dynamically (Issue 2 Sorting Options)
  const sortedHierarchy = useMemo(() => {
    const copy = [...filteredHierarchy];

    const sortNodes = (a: any, b: any) => {
      if (sortBy === "alphabetical") {
        return a.title.localeCompare(b.title);
      } else if (sortBy === "vertical") {
        return Number(a.y_position || 0) - Number(b.y_position || 0);
      } else {
        const orderA = a.order_index !== undefined && a.order_index !== null ? a.order_index : 0;
        const orderB = b.order_index !== undefined && b.order_index !== null ? b.order_index : 0;
        if (orderA !== orderB) return orderA - orderB;
        return Number(a.y_position || 0) - Number(b.y_position || 0);
      }
    };

    return copy.map((sec) => {
      const sortedTopics = [...sec.topics].sort((a, b) => sortNodes(a.node, b.node));
      const sortedTopicsWithSortedSubtopics = sortedTopics.map((t) => {
        const sortedSub = [...t.subtopics].sort((a, b) => sortNodes(a.node, b.node));
        return {
          ...t,
          subtopics: sortedSub
        };
      });

      return {
        ...sec,
        topics: sortedTopicsWithSortedSubtopics
      };
    });
  }, [filteredHierarchy, sortBy]);

  const toggleSection = (secId: string) => {
    setCollapsedSections((prev) => ({ ...prev, [secId]: !prev[secId] }));
  };

  const toggleTopicCollapse = (topId: string) => {
    setCollapsedTopics((prev) => ({ ...prev, [topId]: !prev[topId] }));
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

              {/* View Control Bar */}
              {roadmap.schema_version === "v2" && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={viewMode === "roadmap" ? "default" : "outline"}
                      onClick={() => handleViewModeChange("roadmap")}
                      className={cn(
                        "gap-2 cursor-pointer h-10 px-4 rounded-xl transition-all duration-300",
                        viewMode === "roadmap"
                          ? "bg-cyan-500 hover:bg-cyan-600 text-black font-semibold shadow-[0_0_15px_rgba(6,180,212,0.4)]"
                          : "border-white/10 text-white/80 hover:bg-white/5"
                      )}
                    >
                      <Map className="h-4 w-4" />
                      <span>Flowchart View</span>
                    </Button>
                    <Button
                      variant={viewMode === "title" ? "default" : "outline"}
                      onClick={() => handleViewModeChange("title")}
                      className={cn(
                        "gap-2 cursor-pointer h-10 px-4 rounded-xl transition-all duration-300",
                        viewMode === "title"
                          ? "bg-cyan-500 hover:bg-cyan-600 text-black font-semibold shadow-[0_0_15px_rgba(6,180,212,0.4)]"
                          : "border-white/10 text-white/80 hover:bg-white/5"
                      )}
                    >
                      <List className="h-4 w-4" />
                      <span>Card View</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Learning Content Selector */}
              {viewMode === "title" ? (
                <div className="space-y-6">
                  {/* Filter panel */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-xl mb-6 shadow-lg">
                    {/* Search query */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1">
                        <Search className="h-3 w-3 text-cyan-400" />
                        Search Topics
                      </span>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-white/5 border border-white/10 hover:border-white/20 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-white text-xs transition-colors duration-200 outline-none"
                      />
                    </div>

                    {/* Completion status */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-cyan-400" />
                        Status
                      </span>
                      <select
                        value={completionStatus}
                        onChange={(e) => setCompletionStatus(e.target.value)}
                        className="bg-white/5 border border-white/10 hover:border-white/20 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-white text-xs transition-colors duration-200 outline-none cursor-pointer"
                      >
                        <option value="all" className="bg-[#0c0c0c] text-white">All Status</option>
                        <option value="completed" className="bg-[#0c0c0c] text-white">Completed</option>
                        <option value="incomplete" className="bg-[#0c0c0c] text-white">Incomplete</option>
                      </select>
                    </div>

                    {/* Node Type filter */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1">
                        <Filter className="h-3 w-3 text-cyan-400" />
                        Type
                      </span>
                      <select
                        value={categoryType}
                        onChange={(e) => setCategoryType(e.target.value)}
                        className="bg-white/5 border border-white/10 hover:border-white/20 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-white text-xs transition-colors duration-200 outline-none cursor-pointer"
                      >
                        <option value="all" className="bg-[#0c0c0c] text-white">All Types</option>
                        {uniqueTypes.map((type) => (
                          <option key={type} value={type} className="bg-[#0c0c0c] text-white">
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Sort By */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1">
                        <SlidersHorizontal className="h-3 w-3 text-cyan-400" />
                        Sort By
                      </span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="bg-white/5 border border-white/10 hover:border-white/20 focus:border-cyan-500 rounded-lg px-3 py-1.5 text-white text-xs transition-colors duration-200 outline-none cursor-pointer"
                      >
                        <option value="default" className="bg-[#0c0c0c] text-white">Default Sequence</option>
                        <option value="alphabetical" className="bg-[#0c0c0c] text-white">Alphabetical (A-Z)</option>
                        <option value="vertical" className="bg-[#0c0c0c] text-white">Stage Order (Top-Down)</option>
                      </select>
                    </div>
                  </div>

                  {/* Hierarchical sections list (Issue 2) */}
                  {sortedHierarchy.length === 0 ? (
                    <div className="border border-dashed border-white/10 rounded-2xl p-12 text-center text-white/40 text-sm bg-black/40">
                      No topics matched your active filters.
                    </div>
                  ) : (
                    <div className="space-y-4 mb-12">
                      {sortedHierarchy.map((sec: any) => {
                        const isCollapsed = !!collapsedSections[sec.id];
                        
                        // Calculate stats for this section (Issue 2)
                        let totalInSec = 0;
                        let completedInSec = 0;
                        sec.topics.forEach((t: any) => {
                          totalInSec++;
                          if (completedNodes.includes(t.node.id)) completedInSec++;
                          t.subtopics.forEach((s: any) => {
                            totalInSec++;
                            if (completedNodes.includes(s.node.id)) completedInSec++;
                          });
                        });
                        const percentCompleted = totalInSec > 0 ? Math.round((completedInSec / totalInSec) * 100) : 0;

                        return (
                          <div key={sec.id} className="border border-white/10 rounded-xl overflow-hidden bg-black/25">
                            {/* Section Header */}
                            <div
                              onClick={() => toggleSection(sec.id)}
                              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] hover:bg-white/[0.04] transition-colors duration-200 cursor-pointer border-b border-white/[0.05]"
                            >
                              <div className="flex items-center gap-3">
                                <motion.div
                                  animate={{ rotate: isCollapsed ? 0 : 90 }}
                                  transition={{ duration: 0.2 }}
                                  className="text-white/60 font-bold"
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </motion.div>
                                <span className="font-bold text-sm text-white tracking-wide">{sec.title}</span>
                                <span className="text-xs text-white/40">({totalInSec} topics)</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-cyan-400 font-bold">
                                  {completedInSec}/{totalInSec} Completed ({percentCompleted}%)
                                </span>
                                <div className="w-24 bg-white/10 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className="bg-cyan-500 h-full transition-all duration-300"
                                    style={{ width: `${percentCompleted}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Section Content */}
                            {!isCollapsed && (
                              <div className="p-4 bg-transparent space-y-4">
                                {sec.topics.map((t: any) => {
                                  const isTopicDone = completedNodes.includes(t.node.id);
                                  const topicColor = t.node.color || "#3b82f6";
                                  const isTopicCollapsed = !!collapsedTopics[t.node.id];
                                  const hasSubtopics = t.subtopics.length > 0;

                                  return (
                                    <div key={t.node.id} className="flex flex-col gap-2 relative">
                                      {/* Topic Card */}
                                      <motion.div
                                        whileHover={{ y: -1 }}
                                        onClick={() => setActiveNode(t.node)}
                                        className={cn(
                                          "p-4 rounded-xl border flex flex-col gap-3 justify-between bg-black/40 cursor-pointer transition-all duration-300 relative",
                                          isTopicDone
                                            ? "border-emerald-500/20 shadow-[0_4px_12px_rgba(16,185,129,0.05)]"
                                            : "border-white/[0.06] hover:border-white/15"
                                        )}
                                      >
                                        <div
                                          className="absolute left-0 top-3 bottom-3 w-1 rounded-r-md"
                                          style={{ backgroundColor: isTopicDone ? "#10b981" : topicColor }}
                                        />
                                        <div className="pl-2 space-y-1.5">
                                          <div className="flex items-center gap-2 justify-between">
                                            <span className="text-[9px] text-white/40 uppercase tracking-wider font-semibold">
                                              {t.node.node_type || "topic"}
                                            </span>
                                            <div className="flex items-center gap-2">
                                              {hasSubtopics && (
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleTopicCollapse(t.node.id);
                                                  }}
                                                  className="h-5 px-1.5 text-[8px] text-white/40 hover:text-white hover:bg-white/5 rounded flex items-center gap-1"
                                                >
                                                  <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", !isTopicCollapsed && "rotate-90")} />
                                                  <span>{t.subtopics.length} Subtopics</span>
                                                </Button>
                                              )}
                                              {isTopicDone && (
                                                <span className="text-[8px] text-emerald-400 font-bold px-1 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                                  Done
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <h3 className="font-bold text-xs text-white/95 line-clamp-1">{t.node.title}</h3>
                                          {t.node.description && (
                                            <p className="text-[9px] text-white/40 line-clamp-2 leading-relaxed font-normal">
                                              {t.node.description}
                                            </p>
                                          )}
                                        </div>

                                        <div className="pl-2 flex items-center justify-between pt-2 border-t border-white/[0.05]">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleNodeProgress(t.node.id, isTopicDone);
                                            }}
                                            className="flex items-center gap-1.5 text-[10px] text-white/50 hover:text-white transition-colors cursor-pointer"
                                          >
                                            {isTopicDone ? (
                                              <>
                                                <CheckCircle className="h-3.5 w-3.5 text-emerald-400 fill-emerald-400/10" />
                                                <span className="text-emerald-400 font-semibold">Done</span>
                                              </>
                                            ) : (
                                              <>
                                                <Circle className="h-3.5 w-3.5" />
                                                <span>Mark Complete</span>
                                              </>
                                            )}
                                          </button>
                                          
                                          {/* Show on Graph action */}
                                          {roadmap.schema_version === "v2" && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                focusOnNode(t.node);
                                              }}
                                              className="h-6 px-2 text-[9px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-md cursor-pointer flex items-center gap-1"
                                            >
                                              <Map className="h-2.5 w-2.5" />
                                              Show Graph
                                            </Button>
                                          )}
                                        </div>
                                      </motion.div>

                                      {/* Subtopics Nested Tree List (Issue 2) */}
                                      {hasSubtopics && !isTopicCollapsed && (
                                        <div className="ml-6 pl-6 border-l border-white/10 mt-1 space-y-2 relative">
                                          {t.subtopics.map((sub: any) => {
                                            const isSubDone = completedNodes.includes(sub.node.id);
                                            const subColor = sub.node.color || "#06b6d4";

                                            return (
                                              <div key={sub.node.id} className="relative">
                                                {/* Connecting tree branches CSS lines */}
                                                <div className="absolute left-0 top-1/2 w-4 h-px bg-white/10 -translate-x-6" />

                                                <motion.div
                                                  whileHover={{ y: -1 }}
                                                  onClick={() => setActiveNode(sub.node)}
                                                  className={cn(
                                                    "p-3 rounded-lg border flex flex-col gap-2 justify-between bg-black/50 cursor-pointer transition-all duration-300 relative",
                                                    isSubDone
                                                      ? "border-emerald-500/20 shadow-[0_4px_12px_rgba(16,185,129,0.03)]"
                                                      : "border-white/[0.04] hover:border-white/10"
                                                  )}
                                                >
                                                  <div
                                                    className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r"
                                                    style={{ backgroundColor: isSubDone ? "#10b981" : subColor }}
                                                  />
                                                  <div className="pl-2 space-y-1">
                                                    <div className="flex items-center gap-2 justify-between">
                                                      <span className="text-[8px] text-white/30 uppercase tracking-wider font-semibold">
                                                        {sub.node.node_type || "subtopic"}
                                                      </span>
                                                      {isSubDone && (
                                                        <span className="text-[7px] text-emerald-400 font-bold px-1 rounded bg-emerald-500/5 border border-emerald-500/10">
                                                          Done
                                                        </span>
                                                      )}
                                                    </div>
                                                    <h4 className="font-bold text-[11px] text-white/90 line-clamp-1">{sub.node.title}</h4>
                                                    {sub.node.description && (
                                                      <p className="text-[8px] text-white/30 line-clamp-2 leading-relaxed font-normal">
                                                        {sub.node.description}
                                                      </p>
                                                    )}
                                                  </div>

                                                  <div className="pl-2 flex items-center justify-between pt-1.5 border-t border-white/[0.03]">
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleNodeProgress(sub.node.id, isSubDone);
                                                      }}
                                                      className="flex items-center gap-1 text-[9px] text-white/40 hover:text-white transition-colors cursor-pointer"
                                                    >
                                                      {isSubDone ? (
                                                        <>
                                                          <CheckCircle className="h-3 w-3 text-emerald-400 fill-emerald-400/10" />
                                                          <span className="text-emerald-400 font-semibold">Done</span>
                                                        </>
                                                      ) : (
                                                        <>
                                                          <Circle className="h-3 w-3" />
                                                          <span>Mark Complete</span>
                                                        </>
                                                      )}
                                                    </button>
                                                    
                                                    {/* Show on Graph action */}
                                                    {roadmap.schema_version === "v2" && (
                                                      <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          focusOnNode(sub.node);
                                                        }}
                                                        className="h-5 px-1.5 text-[8px] text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded cursor-pointer flex items-center gap-1"
                                                      >
                                                        <Map className="h-2 w-2" />
                                                        Show Graph
                                                      </Button>
                                                    )}
                                                  </div>
                                                </motion.div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Roadmap Flow View Mode */
                roadmap.schema_version === "v2" ? (
                  <div className="h-[60vh] border border-white/10 rounded-2xl bg-[#050505] overflow-hidden relative mb-12 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                    <ReactFlow
                      nodes={flowchartNodes}
                      edges={flowchartEdges}
                      nodeTypes={customNodeTypes}
                      onNodeClick={handleStudentNodeClick}
                      fitView
                      minZoom={0.2}
                      maxZoom={1.5}
                      nodesConnectable={false}
                      nodesDraggable={false}
                      zoomOnDoubleClick={false}
                    >
                      <Background color="#333" gap={15} size={1} />
                      <Controls className="!bg-black/80 !border-white/10 !rounded-lg overflow-hidden [&_button]:!bg-transparent [&_button]:!border-white/5 [&_svg]:!fill-white/70" />
                    </ReactFlow>
                  </div>
                ) : sections.length === 0 ? (
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
                )
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
