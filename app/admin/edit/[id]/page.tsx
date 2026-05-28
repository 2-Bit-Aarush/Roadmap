"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  Panel,
  Connection,
  Edge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  Maximize,
  Search,
  Grid3X3,
  Copy,
  Palette,
  Save,
  Clock,
  History,
  Lock,
  Unlock,
  PlusCircle,
  X,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// Safe UUID generator supporting insecure (non-HTTPS / ngrok) environments
function generateUUID(): string {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  // Math-based fallback UUIDv4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Custom node styling mapping
const customNodeTypes = {
  customNode: ({ data, selected }: NodeProps) => {
    const color = (data.color as string) || "#3b82f6";
    const typeLabel = (data.node_type as string) || "topic";

    return (
      <div
        style={{
          border: selected ? "2px solid #22d3ee" : `1px solid ${color}40`,
          backgroundColor: "rgba(10, 10, 10, 0.9)",
          boxShadow: selected
            ? "0 0 20px rgba(34, 211, 238, 0.3)"
            : `0 4px 15px rgba(0, 0, 0, 0.4)`,
        }}
        className="p-4 rounded-xl backdrop-blur-md min-w-[200px] text-white flex flex-col gap-1 transition-all duration-300 relative"
      >
        <Handle type="target" position={Position.Top} className="!bg-cyan-400 !w-2 !h-2" />
        <div className="flex items-center gap-1.5 mb-1 justify-between">
          <div className="flex items-center gap-1">
            <div style={{ backgroundColor: color }} className="w-1.5 h-1.5 rounded-full shadow-[0_0_6px_currentColor]" />
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
              {typeLabel}
            </span>
          </div>
          {data.resources && (data.resources as any[]).length > 0 && (
            <span className="text-[9px] text-cyan-400 font-mono">{(data.resources as any[]).length} Links</span>
          )}
        </div>
        <div className="font-bold text-xs truncate pr-4 text-white/95">{data.label as string}</div>
        {data.description && (
          <div className="text-[9px] text-white/40 line-clamp-2 mt-1 leading-normal font-normal">
            {data.description as string}
          </div>
        )}
        <Handle type="source" position={Position.Bottom} className="!bg-cyan-400 !w-2 !h-2" />
      </div>
    );
  }
};

const defaultColors = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Orange", value: "#f97316" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
];

interface EditRoadmapProps {
  params: Promise<{ id: string }>;
}

export default function EditRoadmapPage({ params }: EditRoadmapProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const roadmapId = resolvedParams.id;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // States
  const [roadmap, setRoadmap] = useState<any>(null);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [lockHolder, setLockHolder] = useState<any>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);

  // Search & Navigation
  const [searchQuery, setSearchQuery] = useState("");

  // History & Undo / Redo Stacks
  const undoStack = useRef<any[]>([]);
  const redoStack = useRef<any[]>([]);
  const isTrackingHistory = useRef(true);

  // Active Editor Sidebar Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#3b82f6");
  const [editType, setEditType] = useState("topic");
  const [editResources, setEditResources] = useState<any[]>([]);
  
  // Resource inputs
  const [resTitle, setResTitle] = useState("");
  const [resUrl, setResUrl] = useState("");

  // Versions / Rollbacks List
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  // Autosave status
  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Error" | "Changes made">("Saved");
  const autosaveTimer = useRef<any>(null);

  // 1. Initial Access Check and Load
  useEffect(() => {
    async function verifyAndLoad() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push("/login");
          return;
        }

        // Verify Admin role
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

        // Fetch Roadmap Info
        const { data: roadmapData, error: roadmapError } = await supabase
          .from("roadmaps")
          .select("*, profiles:locked_by(name, email)")
          .eq("id", roadmapId)
          .single();

        if (roadmapError) throw roadmapError;
        setRoadmap(roadmapData);

        // Check locks
        const now = new Date();
        const lockExpiry = 5 * 60 * 1000; // 5 minutes
        const hasActiveLock =
          roadmapData.locked_by &&
          roadmapData.locked_at &&
          now.getTime() - new Date(roadmapData.locked_at).getTime() < lockExpiry;

        if (hasActiveLock && roadmapData.locked_by !== session.user.id) {
          setIsLocked(true);
          setLockHolder(roadmapData.profiles || { name: "Another Admin", email: "" });
        } else {
          // Acquire Lock
          await acquireLock(session.user.id);
        }

        // Load Nodes and Edges
        await loadGraphData();
        await loadVersions();

      } catch (err) {
        console.error("Initialization error:", err);
        toast.error("Failed to load flowchart editor");
      } finally {
        setLoading(false);
      }
    }

    verifyAndLoad();

    return () => {
      // Release lock on unmount
      releaseLockOnUnmount();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [roadmapId, router]);

  // Lock Actions
  const acquireLock = async (userId: string) => {
    try {
      await supabase
        .from("roadmaps")
        .update({
          locked_by: userId,
          locked_at: new Date().toISOString(),
        })
        .eq("id", roadmapId);
      setIsLocked(false);
      setLockHolder(null);
    } catch (e) {
      console.error("Acquiring lock failed:", e);
    }
  };

  const handleForceUnlock = async () => {
    if (!adminUser) return;
    if (!confirm("Are you sure you want to override and take over the editing lock? The other admin's active session will be disconnected.")) return;
    setLoading(true);
    try {
      await acquireLock(adminUser.id);
      await loadGraphData();
      toast.success("Lock overridden successfully!");
    } catch {
      toast.error("Failed to force unlock");
    } finally {
      setLoading(false);
    }
  };

  const releaseLockOnUnmount = async () => {
    try {
      // Read current roadmap state to check if we still hold the lock
      const { data } = await supabase
        .from("roadmaps")
        .select("locked_by")
        .eq("id", roadmapId)
        .single();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (data && user && data.locked_by === user.id) {
        await supabase
          .from("roadmaps")
          .update({
            locked_by: null,
            locked_at: null,
          })
          .eq("id", roadmapId);
      }
    } catch (e) {
      console.error("Releasing lock failed:", e);
    }
  };

  // Heartbeat to keep lock active
  useEffect(() => {
    if (isLocked || !adminUser) return;
    const interval = setInterval(() => {
      supabase
        .from("roadmaps")
        .update({ locked_at: new Date().toISOString() })
        .eq("id", roadmapId)
        .then(({ error }) => {
          if (error) console.error("Heartbeat error:", error);
        });
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isLocked, adminUser, roadmapId]);

  // Fetch Graph Data
  const loadGraphData = async () => {
    try {
      const { data: nodesData } = await supabase
        .from("roadmap_nodes")
        .select("*")
        .eq("roadmap_id", roadmapId);

      const { data: edgesData } = await supabase
        .from("roadmap_edges")
        .select("*")
        .eq("roadmap_id", roadmapId);

      const flowNodes = (nodesData || []).map((n) => ({
        id: n.id,
        type: "customNode",
        position: { x: Number(n.x_position), y: Number(n.y_position) },
        data: {
          label: n.title,
          description: n.description || "",
          node_type: n.node_type || "topic",
          color: n.color || "#3b82f6",
          resources: n.resources || [],
          metadata: n.metadata || {}
        }
      }));

      const flowEdges = (edgesData || []).map((e) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        label: e.label || "",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4" },
        style: { stroke: "#06b6d4", strokeWidth: 1.5 },
      }));

      // Set state silently without adding to undo history
      isTrackingHistory.current = false;
      setNodes(flowNodes);
      setEdges(flowEdges);
      setTimeout(() => {
        isTrackingHistory.current = true;
        undoStack.current = [];
        redoStack.current = [];
      }, 100);

    } catch (err) {
      toast.error("Failed to load flowchart details");
    }
  };

  // Fetch Versions
  const loadVersions = async () => {
    try {
      const { data } = await supabase
        .from("roadmap_versions")
        .select("*")
        .eq("roadmap_id", roadmapId)
        .order("created_at", { ascending: false });
      setVersions(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  // 2. State history and Undo/Redo tracking
  const captureHistoryState = (customNodes = nodes, customEdges = edges) => {
    if (!isTrackingHistory.current) return;
    undoStack.current.push({
      nodes: JSON.parse(JSON.stringify(customNodes)),
      edges: JSON.parse(JSON.stringify(customEdges))
    });
    redoStack.current = []; // Reset redo
    setSaveStatus("Changes made");
    triggerAutosave();
  };

  const handleUndo = () => {
    if (undoStack.current.length === 0) return;
    const previous = undoStack.current.pop();
    redoStack.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges))
    });

    isTrackingHistory.current = false;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setSelectedNodeId(null);
    setTimeout(() => {
      isTrackingHistory.current = true;
      triggerAutosave();
    }, 50);
  };

  const handleRedo = () => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop();
    undoStack.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges))
    });

    isTrackingHistory.current = false;
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedNodeId(null);
    setTimeout(() => {
      isTrackingHistory.current = true;
      triggerAutosave();
    }, 50);
  };

  // 3. Flowcanvas modifications handlers
  const onConnect = (params: Connection) => {
    captureHistoryState(nodes, edges);
    const newEdge: Edge = {
      ...params,
      id: generateUUID(),
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4" },
      style: { stroke: "#06b6d4", strokeWidth: 1.5 }
    } as Edge;
    setEdges((eds) => addEdge(newEdge, eds));
  };

  const onNodeDragStop = () => {
    captureHistoryState(nodes, edges);
  };

  const handleAddBox = () => {
    // Generate fresh stable ID (valid UUIDv4 format via browser API)
    const newId = generateUUID();
    captureHistoryState(nodes, edges);
    const newNode = {
      id: newId,
      type: "customNode",
      position: { x: 200 + Math.random() * 80, y: 200 + Math.random() * 80 },
      data: {
        label: "New Topic",
        description: "",
        node_type: "topic",
        color: "#3b82f6",
        resources: [],
        metadata: {}
      }
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleNodeClick = (_: any, node: any) => {
    setSelectedNodeId(node.id);
    setEditTitle(node.data.label);
    setEditDesc(node.data.description || "");
    setEditColor(node.data.color || "#3b82f6");
    setEditType(node.data.node_type || "topic");
    setEditResources(node.data.resources || []);
  };

  // Node details form changes
  const handleUpdateNodeDetails = () => {
    if (!selectedNodeId) return;
    captureHistoryState(nodes, edges);
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              label: editTitle,
              description: editDesc,
              color: editColor,
              node_type: editType,
              resources: editResources
            }
          };
        }
        return n;
      })
    );
    toast.success("Node updated successfully");
  };

  const handleDuplicateNode = () => {
    if (!selectedNodeId) return;
    const target = nodes.find((n) => n.id === selectedNodeId);
    if (!target) return;

    captureHistoryState(nodes, edges);
    const newId = generateUUID();
    const duplicatedNode = {
      ...target,
      id: newId,
      position: { x: target.position.x + 30, y: target.position.y + 30 },
      data: {
        ...target.data,
        label: `${target.data.label} (Copy)`
      }
    };
    setNodes((nds) => [...nds, duplicatedNode]);
    setSelectedNodeId(newId);
    toast.success("Node duplicated");
  };

  const handleDeleteNode = () => {
    if (!selectedNodeId) return;
    if (!confirm("Are you sure you want to delete this node? All connected edges will be removed.")) return;
    captureHistoryState(nodes, edges);
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    toast.success("Node and connected edges deleted");
  };

  const handleAddResource = () => {
    if (!resTitle || !resUrl) return;
    if (!resUrl.startsWith("http://") && !resUrl.startsWith("https://")) {
      toast.error("Please enter a valid URL (starting with http:// or https://)");
      return;
    }
    const updated = [...editResources, { title: resTitle, url: resUrl, type: "link" }];
    setEditResources(updated);
    setResTitle("");
    setResUrl("");
    
    // Save to node directly
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              resources: updated
            }
          };
        }
        return n;
      })
    );
  };

  const handleRemoveResource = (index: number) => {
    const updated = editResources.filter((_, idx) => idx !== index);
    setEditResources(updated);
    
    // Save to node directly
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              resources: updated
            }
          };
        }
        return n;
      })
    );
  };

  // Node Search Zooming
  const handleSearchNode = () => {
    if (!searchQuery.trim()) return;
    const found = nodes.find((n) =>
      (n.data.label as string).toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (found) {
      // Focus/Highlight
      setSelectedNodeId(found.id);
      setEditTitle(found.data.label as string);
      setEditDesc((found.data.description as string) || "");
      setEditColor((found.data.color as string) || "#3b82f6");
      setEditType((found.data.node_type as string) || "topic");
      setEditResources((found.data.resources as any[]) || []);
      toast.success(`Found node: ${found.data.label}`);
    } else {
      toast.error("No matching node found");
    }
  };

  // 4. Stable IDs key-matching upserts and version rollback saving
  const handleSaveToDatabase = async (isAutosaveMode = false) => {
    if (isLocked) return;
    setSaveStatus("Saving...");

    try {
      // 1. Fetch current database nodes for this roadmap
      const { data: dbNodes, error: dbError } = await supabase
        .from("roadmap_nodes")
        .select("id, title, description, x_position, y_position, node_type, color, resources, metadata")
        .eq("roadmap_id", roadmapId);

      if (dbError) throw dbError;

      // 2. Fetch current database edges for this roadmap
      const { data: dbEdges, error: dbEdgesError } = await supabase
        .from("roadmap_edges")
        .select("id, source_node_id, target_node_id, label")
        .eq("roadmap_id", roadmapId);

      if (dbEdgesError) throw dbEdgesError;

      // Ensure all edges in state have valid UUIDs.
      // If any edge was created on-canvas (e.g. starting with "e-" or similar temp ID format),
      // we generate a clean, stable UUID for it and backport it to react-flow state.
      const updatedEdges = edges.map((e) => {
        if (!e.id || e.id.startsWith("e-") || e.id.includes("temp")) {
          return { ...e, id: generateUUID() };
        }
        return e;
      });

      let hasNewEdgeIds = false;
      for (let i = 0; i < edges.length; i++) {
        if (edges[i].id !== updatedEdges[i].id) {
          hasNewEdgeIds = true;
          break;
        }
      }
      if (hasNewEdgeIds) {
        setEdges(updatedEdges);
      }

      // Compute Node differences
      const canvasNodeIds = new Set(nodes.map((n) => n.id));
      const dbNodeMap = new Map((dbNodes || []).map((n) => [n.id, n]));

      const nodesToDelete = (dbNodes || []).filter((n) => !canvasNodeIds.has(n.id));
      const nodesToInsert: any[] = [];
      const nodesToUpdate: any[] = [];
      let nodeUnchanged = 0;

      for (const n of nodes) {
        const payload = {
          id: n.id,
          roadmap_id: roadmapId,
          title: n.data.label,
          description: n.data.description || "",
          x_position: Math.round(n.position.x),
          y_position: Math.round(n.position.y),
          node_type: n.data.node_type || "topic",
          color: n.data.color || "#3b82f6",
          resources: n.data.resources || [],
          metadata: n.data.metadata || {},
          updated_at: new Date().toISOString()
        };

        const dbN = dbNodeMap.get(n.id);
        if (!dbN) {
          nodesToInsert.push(payload);
        } else {
          const isChanged =
            n.data.label !== dbN.title ||
            (n.data.description || "") !== (dbN.description || "") ||
            Math.round(n.position.x) !== Math.round(Number(dbN.x_position)) ||
            Math.round(n.position.y) !== Math.round(Number(dbN.y_position)) ||
            (n.data.node_type || "topic") !== (dbN.node_type || "topic") ||
            (n.data.color || "#3b82f6") !== (dbN.color || "#3b82f6") ||
            JSON.stringify(n.data.resources || []) !== JSON.stringify(dbN.resources || []) ||
            JSON.stringify(n.data.metadata || {}) !== JSON.stringify(dbN.metadata || {});

          if (isChanged) {
            nodesToUpdate.push(payload);
          } else {
            nodeUnchanged++;
          }
        }
      }

      // Compute Edge differences
      const canvasEdgeIds = new Set(updatedEdges.map((e) => e.id));
      const dbEdgeMap = new Map((dbEdges || []).map((e) => [e.id, e]));

      const edgesToDelete = (dbEdges || []).filter((e) => !canvasEdgeIds.has(e.id));
      const edgesToInsert: any[] = [];
      const edgesToUpdate: any[] = [];
      let edgeUnchanged = 0;

      for (const e of updatedEdges) {
        const payload = {
          id: e.id,
          roadmap_id: roadmapId,
          source_node_id: e.source,
          target_node_id: e.target,
          label: e.label || "",
          styling_metadata: {}
        };

        const dbE = dbEdgeMap.get(e.id);
        if (!dbE) {
          edgesToInsert.push(payload);
        } else {
          const isChanged =
            e.source !== dbE.source_node_id ||
            e.target !== dbE.target_node_id ||
            (e.label || "") !== (dbE.label || "");

          if (isChanged) {
            edgesToUpdate.push(payload);
          } else {
            edgeUnchanged++;
          }
        }
      }

      // 3. Delete removed nodes only
      if (nodesToDelete.length > 0) {
        const { error: delNodesError } = await supabase
          .from("roadmap_nodes")
          .delete()
          .in("id", nodesToDelete.map((n) => n.id));
        if (delNodesError) throw delNodesError;
      }

      // 4. Upsert changed/new nodes only
      const nodesToUpsert = [...nodesToInsert, ...nodesToUpdate];
      if (nodesToUpsert.length > 0) {
        const { error: upsertNodesError } = await supabase
          .from("roadmap_nodes")
          .upsert(nodesToUpsert);
        if (upsertNodesError) throw upsertNodesError;
      }

      // 5. Delete removed edges only
      if (edgesToDelete.length > 0) {
        const { error: delEdgesError } = await supabase
          .from("roadmap_edges")
          .delete()
          .in("id", edgesToDelete.map((e) => e.id));
        if (delEdgesError) throw delEdgesError;
      }

      // 6. Upsert changed/new edges only
      const edgesToUpsert = [...edgesToInsert, ...edgesToUpdate];
      if (edgesToUpsert.length > 0) {
        const { error: upsertEdgesError } = await supabase
          .from("roadmap_edges")
          .upsert(edgesToUpsert);
        if (upsertEdgesError) throw upsertEdgesError;
      }

      // Logging requirement
      console.log("inserted count:", nodesToInsert.length + edgesToInsert.length);
      console.log("updated count:", nodesToUpdate.length + edgesToUpdate.length);
      console.log("deleted count:", nodesToDelete.length + edgesToDelete.length);
      console.log("unchanged count:", nodeUnchanged + edgeUnchanged);

      console.log(`[Save Sync] Nodes: Inserted: ${nodesToInsert.length}, Updated: ${nodesToUpdate.length}, Deleted: ${nodesToDelete.length}, Unchanged: ${nodeUnchanged}`);
      console.log(`[Save Sync] Edges: Inserted: ${edgesToInsert.length}, Updated: ${edgesToUpdate.length}, Deleted: ${edgesToDelete.length}, Unchanged: ${edgeUnchanged}`);

      // 7. Create Version history snapshot
      const { error: verError } = await supabase
        .from("roadmap_versions")
        .insert({
          roadmap_id: roadmapId,
          nodes_data: nodes.map((n) => ({
            id: n.id,
            label: n.data.label,
            description: n.data.description,
            x: n.position.x,
            y: n.position.y,
            node_type: n.data.node_type,
            color: n.data.color,
            resources: n.data.resources,
            metadata: n.data.metadata
          })),
          edges_data: updatedEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: e.label
          })),
          is_autosave: isAutosaveMode
        });

      if (verError) throw verError;

      // 8. Enforce 20-snapshot retention limit (prune old versions)
      const { data: currentVersions } = await supabase
        .from("roadmap_versions")
        .select("id")
        .eq("roadmap_id", roadmapId)
        .order("created_at", { ascending: false });

      if (currentVersions && currentVersions.length > 20) {
        const keepIds = currentVersions.slice(0, 20).map((v) => v.id);
        await supabase
          .from("roadmap_versions")
          .delete()
          .eq("roadmap_id", roadmapId)
          .not("id", "in", `(${keepIds.join(",")})`);
      }

      await loadVersions();
      setSaveStatus("Saved");
      if (!isAutosaveMode) {
        toast.success("Roadmap draft saved successfully");
      }

    } catch (err: any) {
      console.error(err);
      setSaveStatus("Error");
      if (!isAutosaveMode) {
        toast.error("Failed to save changes: " + err.message);
      }
      throw err;
    }
  };

  const triggerAutosave = () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      handleSaveToDatabase(true);
    }, 5000); // 5 seconds debounce
  };

  const handleRollback = async (ver: any) => {
    if (!confirm("Are you sure you want to roll back the current canvas to this snapshot? Canvas edits will revert but stable IDs of current nodes will be maintained on restore.")) return;
    setLoading(true);

    try {
      const restoredNodes = (ver.nodes_data as any[]).map((n) => ({
        id: n.id,
        type: "customNode",
        position: { x: Number(n.x), y: Number(n.y) },
        data: {
          label: n.label,
          description: n.description || "",
          node_type: n.node_type || "topic",
          color: n.color || "#3b82f6",
          resources: n.resources || [],
          metadata: n.metadata || {}
        }
      }));

      const restoredEdges = (ver.edges_data as any[]).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || "",
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4" },
        style: { stroke: "#06b6d4", strokeWidth: 1.5 }
      }));

      isTrackingHistory.current = false;
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      setSelectedNodeId(null);
      setTimeout(async () => {
        isTrackingHistory.current = true;
        // Save restored canvas to DB immediately
        await handleSaveToDatabase(false);
        setLoading(false);
        toast.success("Snapshot successfully restored!");
      }, 100);

    } catch (err: any) {
      toast.error("Rollback failed: " + err.message);
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!roadmap) return;
    try {
      // First save current state
      await handleSaveToDatabase(false);

      const { error } = await supabase
        .from("roadmaps")
        .update({
          is_published: true,
          updated_at: new Date().toISOString()
        })
        .eq("id", roadmapId);

      if (error) throw error;
      setRoadmap((prev: any) => ({ ...prev, is_published: true }));
      toast.success("Roadmap published successfully!");
    } catch (e: any) {
      toast.error("Failed to publish: " + e.message);
    }
  };

  const handleUnpublish = async () => {
    if (!roadmap) return;
    try {
      const { error } = await supabase
        .from("roadmaps")
        .update({
          is_published: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", roadmapId);

      if (error) throw error;
      setRoadmap((prev: any) => ({ ...prev, is_published: false }));
      toast.success("Roadmap changed to Draft mode");
    } catch (e: any) {
      toast.error("Failed to save draft status: " + e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="h-10 w-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 5. Block editing view if locked
  if (isLocked) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full border border-white/10 rounded-2xl bg-black/60 backdrop-blur-xl p-8 text-center space-y-6 shadow-2xl relative z-10"
        >
          <div className="h-16 w-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <Lock className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Roadmap is Locked</h2>
            <p className="text-sm text-white/50 leading-relaxed">
              This roadmap is currently being designed/edited by:
            </p>
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl mt-2 text-sm font-semibold text-cyan-400">
              {lockHolder?.name || "Another Admin"} ({lockHolder?.email || "No email available"})
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-4">
            <Button
              onClick={handleForceUnlock}
              className="bg-amber-600 hover:bg-amber-500 text-white border-0 cursor-pointer w-full"
            >
              <Unlock className="h-4 w-4 mr-2" />
              Force Takeover Lock
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push("/admin")}
              className="text-white/60 hover:text-white hover:bg-white/5 cursor-pointer w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col h-screen overflow-hidden">
      <Toaster position="top-center" theme="dark" />

      {/* Editor Top Navigation Bar */}
      <header className="h-16 bg-black/90 border-b border-white/10 flex items-center justify-between px-6 shrink-0 relative z-30 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push("/admin")}
            className="text-white/60 hover:text-white hover:bg-white/5 p-2 h-9 w-9 rounded-lg cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">{roadmap?.title || "Flowchart Editor"}</h1>
            <span className="text-[10px] text-white/40">{roadmap?.category} • Flowchart v2</span>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-3">
          {/* Save Status indicator */}
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full font-mono border",
            saveStatus === "Saved" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
            saveStatus === "Saving..." && "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 animate-pulse",
            saveStatus === "Changes made" && "bg-amber-500/10 border-amber-500/20 text-amber-400",
            saveStatus === "Error" && "bg-destructive/10 border-destructive/20 text-destructive"
          )}>
            {saveStatus}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSaveToDatabase(false)}
            className="border-white/10 hover:bg-white/5 text-white/80 h-9 px-3 text-xs cursor-pointer"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Save Draft
          </Button>

          {roadmap?.is_published ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnpublish}
              className="border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 h-9 px-3 text-xs cursor-pointer"
            >
              Draft Mode
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handlePublish}
              className="bg-cyan-600 hover:bg-cyan-500 text-white border-0 h-9 px-3 text-xs font-semibold shadow-[0_0_15px_rgba(6,182,212,0.25)] cursor-pointer"
            >
              Publish Map
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersions(!showVersions)}
            className={cn(
              "border-white/10 hover:bg-white/5 text-white/80 h-9 px-3 text-xs cursor-pointer",
              showVersions && "bg-white/10 text-white"
            )}
          >
            <History className="h-3.5 w-3.5 mr-1" />
            History ({versions.length})
          </Button>
        </div>
      </header>

      {/* Editor Body Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* React Flow Infinite Canvas */}
        <div className="flex-1 h-full bg-[#050505] relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={handleNodeClick}
            nodeTypes={customNodeTypes}
            snapToGrid={snapToGrid}
            snapGrid={[15, 15]}
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Background color="#333" gap={15} size={1} />
            <Controls className="!bg-black/80 !border-white/10 !rounded-lg overflow-hidden [&_button]:!bg-transparent [&_button]:!border-white/5 [&_svg]:!fill-white/70" />
            <MiniMap
              nodeColor={(n) => (n.data.color as string) || "#3b82f6"}
              maskColor="rgba(0,0,0,0.7)"
              style={{ backgroundColor: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px" }}
              className="!bottom-4 !right-4"
            />

            {/* Custom Interactive Panel Toolbar inside canvas */}
            <Panel position="top-left" className="flex items-center gap-2 p-2 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 z-20 shadow-2xl">
              <Button
                size="sm"
                onClick={handleAddBox}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs h-8 border-0 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Box
              </Button>

              <div className="w-px h-5 bg-white/10 mx-1" />

              <Button
                variant="ghost"
                size="icon"
                onClick={handleUndo}
                disabled={undoStack.current.length === 0}
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 cursor-pointer"
              >
                <Undo2 className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleRedo}
                disabled={redoStack.current.length === 0}
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/5 disabled:opacity-30 cursor-pointer"
              >
                <Redo2 className="h-4 w-4" />
              </Button>

              <div className="w-px h-5 bg-white/10 mx-1" />

              {/* Snap grid toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSnapToGrid(!snapToGrid)}
                className={cn(
                  "h-8 w-8 text-white/60 hover:text-white hover:bg-white/5 cursor-pointer",
                  snapToGrid && "text-cyan-400 bg-cyan-500/10"
                )}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>

              <div className="w-px h-5 bg-white/10 mx-1" />

              {/* Node Search Bar */}
              <div className="flex items-center gap-1.5 pl-1">
                <Input
                  placeholder="Search Nodes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchNode()}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-[10px] w-28 h-7 focus:border-cyan-500/50"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSearchNode}
                  className="h-7 w-7 text-white/60 hover:text-white cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Right Drawer: Version History List */}
        <AnimatePresence>
          {showVersions && (
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              className="w-80 border-l border-white/10 bg-black/95 backdrop-blur-2xl p-6 h-full overflow-y-auto shrink-0 relative z-20 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
                  <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                    <History className="h-4 w-4 text-cyan-400" />
                    Version History
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowVersions(false)}
                    className="h-7 w-7 text-white/40 hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  {versions.length === 0 ? (
                    <p className="text-xs text-white/30 italic text-center py-8">No saved snapshots yet.</p>
                  ) : (
                    versions.map((ver, idx) => (
                      <div
                        key={ver.id}
                        className="p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:border-cyan-500/20 transition-all flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] text-white/40 font-mono">
                            {new Date(ver.created_at).toLocaleString()}
                          </span>
                          <span className={cn(
                            "text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
                            ver.is_autosave ? "bg-cyan-500/10 text-cyan-400" : "bg-violet-500/10 text-violet-400"
                          )}>
                            {ver.is_autosave ? "Autosave" : "Manual"}
                          </span>
                        </div>
                        <div className="text-[10px] text-white/60">
                          Nodes: {(ver.nodes_data as any[]).length} • Edges: {(ver.edges_data as any[]).length}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRollback(ver)}
                          className="w-full bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 border border-cyan-500/20 text-[10px] h-7 cursor-pointer"
                        >
                          Restore Snapshot
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Drawer: Properties sidebar of Selected Node */}
        <AnimatePresence>
          {selectedNodeId && (
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              className="w-96 border-l border-white/10 bg-black/95 backdrop-blur-2xl p-6 h-full overflow-y-auto shrink-0 relative z-20 flex flex-col justify-between"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                  <h3 className="font-bold text-sm text-white">Edit Node Properties</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedNodeId(null)}
                    className="h-7 w-7 text-white/40 hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  {/* Title */}
                  <div className="space-y-1.5">
                    <Label htmlFor="node-title" className="text-white/70 text-xs">Node Title</Label>
                    <Input
                      id="node-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={handleUpdateNodeDetails}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs h-9"
                    />
                  </div>

                  {/* Type */}
                  <div className="space-y-1.5">
                    <Label htmlFor="node-type" className="text-white/70 text-xs">Node Type</Label>
                    <select
                      id="node-type"
                      value={editType}
                      onChange={(e) => {
                        setEditType(e.target.value);
                        // Save node immediately
                        setNodes((nds) =>
                          nds.map((n) => {
                            if (n.id === selectedNodeId) {
                              return {
                                ...n,
                                data: { ...n.data, node_type: e.target.value }
                              };
                            }
                            return n;
                          })
                        );
                        captureHistoryState();
                      }}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-lg p-2 text-xs focus:outline-none focus:border-cyan-500"
                    >
                      <option value="topic">Topic Node</option>
                      <option value="group">Container / Group</option>
                      <option value="subtopic">Sub-Topic Node</option>
                      <option value="resource">Resource Hub</option>
                    </select>
                  </div>

                  {/* Node Colors */}
                  <div className="space-y-2">
                    <Label className="text-white/70 text-xs">Node Accent Color</Label>
                    <div className="flex gap-2 flex-wrap">
                      {defaultColors.map((color) => (
                        <button
                          key={color.value}
                          onClick={() => {
                            setEditColor(color.value);
                            // Save node color directly
                            setNodes((nds) =>
                              nds.map((n) => {
                                if (n.id === selectedNodeId) {
                                  return {
                                    ...n,
                                    data: { ...n.data, color: color.value }
                                  };
                                }
                                return n;
                              })
                            );
                            captureHistoryState();
                          }}
                          style={{ backgroundColor: color.value }}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-all cursor-pointer",
                            editColor === color.value ? "border-cyan-400 scale-110 shadow-[0_0_8px_currentColor]" : "border-transparent"
                          )}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Detailed Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor="node-desc" className="text-white/70 text-xs">Description</Label>
                    <Textarea
                      id="node-desc"
                      rows={4}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      onBlur={handleUpdateNodeDetails}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-xs"
                      placeholder="Add learning details and summary guidelines..."
                    />
                  </div>

                  {/* Resources Links section */}
                  <div className="border-t border-white/5 pt-4">
                    <h4 className="text-white/50 text-[10px] uppercase font-bold tracking-wider mb-3">
                      Learning Resources
                    </h4>

                    {/* Resources list */}
                    {editResources.length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {editResources.map((res, index) => (
                          <div key={index} className="flex justify-between items-center gap-3 p-2 rounded bg-white/5 text-xs">
                            <span className="truncate flex-1 font-medium">{res.title}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveResource(index)}
                              className="text-destructive hover:text-red-400 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Input
                        placeholder="Link Title (e.g. documentation)"
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddResource}
                        className="w-full border-white/10 hover:bg-white/5 text-xs text-cyan-400 cursor-pointer h-8"
                      >
                        <PlusCircle className="h-3.5 w-3.5 mr-1" />
                        Add Link
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Duplicate / Delete controls */}
              <div className="border-t border-white/10 pt-4 mt-6 flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleDuplicateNode}
                  className="flex-1 border-white/10 hover:bg-white/5 text-xs cursor-pointer text-white/80 h-9"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Duplicate
                </Button>
                <Button
                  onClick={handleDeleteNode}
                  className="flex-1 bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive text-xs cursor-pointer h-9"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Node
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
