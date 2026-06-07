import { z } from "zod";

// 1. Zod schema for Native JSON import validation
export const nativeImportSchema = z.object({
  roadmap_id: z.string().uuid("Roadmap ID must be a valid UUID").optional(),
  roadmap: z.object({
    title: z.string().min(3, "Roadmap title must be at least 3 characters").max(100, "Roadmap title cannot exceed 100 characters"),
    description: z.string().max(1000, "Roadmap description cannot exceed 1000 characters").optional(),
    category: z.string().min(1, "Category tag is required").optional(),
    difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
    estimated_duration: z.string().max(50, "Estimated duration must be less than 50 characters").optional(),
    is_published: z.boolean().optional(),
  }),
  nodes: z.array(
    z.object({
      id: z.string().min(1, "Node ID cannot be empty"),
      title: z.string().min(1, "Node title cannot be empty"),
      description: z.string().optional(),
      position: z.object({
        x: z.number(),
        y: z.number()
      }).optional(),
      color: z.string().optional(),
      node_type: z.string().optional(),
      resources: z.array(
        z.object({
          title: z.string().min(1, "Resource title is required"),
          url: z.string().url("Please enter a valid URL")
        })
      ).optional()
    })
  ),
  edges: z.array(
    z.object({
      id: z.string().optional(),
      source: z.string().min(1, "Source node ID is required"),
      target: z.string().min(1, "Target node ID is required"),
      label: z.string().optional()
    })
  )
});

export interface ValidationOutput {
  errors: string[];
  warnings: string[];
  ignoredFields: string[];
  nodeCount: number;
  edgeCount: number;
}

// 2. Comprehensive graph validation rules (Section 7)
export function validateGraph(nodes: any[], edges: any[]): ValidationOutput {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ignoredFields: string[] = [];

  const nodeIds = new Set<string>();
  const duplicateNodeIds = new Set<string>();

  // A. Check Node IDs & resources
  nodes.forEach((node, index) => {
    if (!node.id) {
      errors.push(`Node at index ${index} is missing an 'id'`);
    } else {
      const stringId = String(node.id);
      if (nodeIds.has(stringId)) {
        duplicateNodeIds.add(stringId);
      }
      nodeIds.add(stringId);
    }

    if (node.resources && Array.isArray(node.resources)) {
      node.resources.forEach((res: any, rIndex: number) => {
        if (!res.title || String(res.title).trim() === '') {
          errors.push(`Node '${node.id || index}' resource at index ${rIndex} is missing a title`);
        }
        if (!res.url || String(res.url).trim() === '') {
          errors.push(`Node '${node.id || index}' resource at index ${rIndex} is missing a URL`);
        } else if (!res.url.startsWith("http://") && !res.url.startsWith("https://")) {
          errors.push(`Node '${node.id || index}' resource at index ${rIndex} has an invalid URL format (must start with http/https)`);
        }
      });
    }

    // Capture ignored fields in node
    const allowedNodeKeys = ['id', 'title', 'description', 'position', 'color', 'node_type', 'resources', 'metadata'];
    Object.keys(node).forEach(key => {
      if (!allowedNodeKeys.includes(key)) {
        ignoredFields.push(`Node '${node.id || index}' metadata key '${key}' will be ignored`);
      }
    });
  });

  if (duplicateNodeIds.size > 0) {
    errors.push(`Duplicate Node IDs found in import: ${Array.from(duplicateNodeIds).join(", ")}`);
  }

  // B. Check Edges (Self-loops, broken references, duplicate pairs)
  const edgeKeys = new Set<string>();
  const duplicateEdges = new Set<string>();
  let selfLoopsCount = 0;

  edges.forEach((edge, index) => {
    const edgeId = edge.id || `edge-${index}`;
    if (!edge.source) {
      errors.push(`Edge at index ${index} is missing source node reference`);
    } else if (!nodeIds.has(String(edge.source))) {
      errors.push(`Edge '${edgeId}' references non-existent source node: '${edge.source}'`);
    }

    if (!edge.target) {
      errors.push(`Edge at index ${index} is missing target node reference`);
    } else if (!nodeIds.has(String(edge.target))) {
      errors.push(`Edge '${edgeId}' references non-existent target node: '${edge.target}'`);
    }

    if (edge.source && edge.target) {
      const src = String(edge.source);
      const tgt = String(edge.target);
      if (src === tgt) {
        selfLoopsCount++;
        errors.push(`Self-loop detected: Edge '${edgeId}' connects node '${src}' to itself`);
      }

      const pairKey = `${src}->${tgt}`;
      if (edgeKeys.has(pairKey)) {
        duplicateEdges.add(pairKey);
      }
      edgeKeys.add(pairKey);
    }
  });

  if (duplicateEdges.size > 0) {
    errors.push(`Duplicate edge connections detected: ${Array.from(duplicateEdges).join(", ")}`);
  }

  // C. Calculate Isolated Nodes & Edge Density
  const activeNodes = new Set<string>();
  edges.forEach(e => {
    if (e.source) activeNodes.add(String(e.source));
    if (e.target) activeNodes.add(String(e.target));
  });

  let isolatedCount = 0;
  nodes.forEach(n => {
    if (n.id && !activeNodes.has(String(n.id))) {
      isolatedCount++;
    }
  });

  if (isolatedCount > 0) {
    warnings.push(`${isolatedCount} isolated nodes detected (no incoming or outgoing edge relationships)`);
  }

  if (nodes.length > 0 && edges.length > nodes.length * 3) {
    warnings.push(`Excessive edge density warning (Ratio: ${(edges.length / nodes.length).toFixed(2)} edges/node). Flowchart may look cluttered.`);
  }

  // D. Cycles Warning (DFS-based detection)
  const adj = new Map<string, string[]>();
  nodeIds.forEach(id => adj.set(id, []));
  edges.forEach(e => {
    if (e.source && e.target && adj.has(String(e.source))) {
      adj.get(String(e.source))!.push(String(e.target));
    }
  });

  const visited = new Set<string>();
  const recStack = new Set<string>();
  let hasCycle = false;

  const dfs = (node: string): boolean => {
    visited.add(node);
    recStack.add(node);

    const neighbors = adj.get(node) || [];
    for (const n of neighbors) {
      if (!visited.has(n)) {
        if (dfs(n)) return true;
      } else if (recStack.has(n)) {
        return true;
      }
    }

    recStack.delete(node);
    return false;
  };

  for (const node of Array.from(nodeIds)) {
    if (!visited.has(node)) {
      if (dfs(node)) {
        hasCycle = true;
        break;
      }
    }
  }

  if (hasCycle) {
    warnings.push("Cycles (circular references) detected in the graph connections. (Allowed but may indicate loopbacks).");
  }

  return {
    errors,
    warnings,
    ignoredFields,
    nodeCount: nodes.length,
    edgeCount: edges.length
  };
}

// 3. Traverses nested tree structures (roadmap.sh) and normalizes into flat schema
export function normalizeRoadmapSh(json: any): { roadmap: any; nodes: any[]; edges: any[] } {
  const title = json.title || json.name || "Imported Roadmap";
  const description = json.description || "";
  const category = json.category || "Web Development";
  const difficulty = json.difficulty || "Intermediate";
  const estimated_duration = json.estimated_duration || "3 months";
  const is_published = false;

  const nodes: any[] = [];
  const edges: any[] = [];
  const processedIds = new Set<string>();

  // Simple layout parameters
  const xSpacing = 280;
  const ySpacing = 160;

  interface NodeItem {
    id: string;
    title?: string;
    label?: string;
    description?: string;
    node_type?: string;
    color?: string;
    resources?: any[];
    children?: NodeItem[];
    items?: NodeItem[];
  }

  // Flatten nested nodes recursively and position them
  function traverse(item: NodeItem, parentId: string | null, depth: number, siblingIndex: number, parentX: number, parentY: number) {
    if (!item || !item.id) return;
    const cleanId = String(item.id).trim().toLowerCase();

    // Prevent duplicate traversals
    if (processedIds.has(cleanId)) return;
    processedIds.add(cleanId);

    // Coordinate calculation (staggered hierarchy layout)
    let x = parentX;
    let y = parentY;

    if (depth > 0) {
      y = parentY + ySpacing;
      // Stagger children horizontally around the parent node center
      x = parentX + (siblingIndex - 0.5) * xSpacing;
    }

    const titleStr = item.title || item.label || item.id;
    const colorStr = item.color || (depth === 0 ? "#8b5cf6" : depth === 1 ? "#3b82f6" : "#06b6d4");
    const nodeType = item.node_type || (depth === 0 ? "group" : depth === 1 ? "topic" : "subtopic");

    nodes.push({
      id: cleanId,
      title: titleStr,
      description: item.description || "",
      position: { x: Math.round(x), y: Math.round(y) },
      color: colorStr,
      node_type: nodeType,
      resources: (item.resources || []).map(r => ({
        title: r.title || r.label || "Documentation",
        url: r.url || ""
      }))
    });

    if (parentId) {
      edges.push({
        id: `edge-${parentId}-${cleanId}`,
        source: parentId,
        target: cleanId,
        label: ""
      });
    }

    // Children arrays can be called 'children' or 'items'
    const kids = item.children || item.items || [];
    kids.forEach((child, idx) => {
      traverse(child, cleanId, depth + 1, idx, x, y);
    });
  }

  // Root elements can be in 'items' or 'nodes' or the root JSON itself
  const roots = json.items || json.nodes || [];
  if (Array.isArray(roots)) {
    roots.forEach((root, idx) => {
      traverse(root, null, 0, idx, 300 + idx * 350, 100);
    });
  } else if (typeof roots === "object") {
    traverse(roots, null, 0, 0, 300, 100);
  } else {
    // If not a list, try parsing root as a single node
    traverse(json, null, 0, 0, 300, 100);
  }

  return {
    roadmap: { title, description, category, difficulty, estimated_duration, is_published },
    nodes,
    edges
  };
}

// 4. Native JSON Exporter containing safety headers (Section 12)
export function exportToNativeJson(roadmap: any, nodes: any[], edges: any[]): string {
  const exportData = {
    schema_version: "v2",
    export_version: "1.0",
    created_with: "TechRoadmap",
    exported_at: new Date().toISOString(),
    roadmap_id: roadmap.id,
    roadmap: {
      title: roadmap.title,
      description: roadmap.description || "",
      category: roadmap.category || "Web Development",
      difficulty: roadmap.difficulty || "Intermediate",
      estimated_duration: roadmap.estimated_duration || "2 months",
      is_published: false // Force imported roadmaps to draft first
    },
    nodes: nodes.map(n => ({
      id: n.metadata?.external_id || n.id,
      title: n.title,
      description: n.description || "",
      position: {
        x: Math.round(Number(n.x_position)),
        y: Math.round(Number(n.y_position))
      },
      color: n.color || "#3b82f6",
      node_type: n.node_type || "topic",
      resources: (n.resources || []).map((r: any) => ({
        title: r.title,
        url: r.url
      }))
    })),
    edges: edges.map(e => ({
      source: e.source_external_id || e.source_node_id,
      target: e.target_external_id || e.target_node_id,
      label: e.label || ""
    }))
  };

  return JSON.stringify(exportData, null, 2);
}

// 5. Normalizer for section-based roadmap configurations (Issue 1)
export function normalizeSectionBased(json: any): { 
  roadmap: any; 
  nodes: any[]; 
  edges: any[]; 
  detected: { sections: number; topics: number; subtopics: number } 
} | null {
  if (!json || !Array.isArray(json.sections)) {
    return null;
  }

  const title = json.title || json.name || "Section-Based Roadmap";
  const description = json.description || "";
  const category = json.category || "Web Development";
  const difficulty = json.difficulty || "Intermediate";
  const estimated_duration = json.estimated_duration || "3 months";
  const is_published = false;

  const nodes: any[] = [];
  const edges: any[] = [];

  let detectedSections = 0;
  let detectedTopics = 0;
  let detectedSubtopics = 0;

  const xSpacing = 280;
  const ySpacing = 160;
  let currentY = 100;

  json.sections.forEach((section: any, sIdx: number) => {
    detectedSections++;
    const sectionId = `sec-${sIdx}`;
    const sectionTitle = typeof section === "string" ? section : (section.title || section.name || `Section ${sIdx + 1}`);
    const sectionDesc = typeof section === "string" ? "" : (section.description || "");

    nodes.push({
      id: sectionId,
      title: sectionTitle,
      description: sectionDesc,
      node_type: "section",
      color: "#8b5cf6",
      position: { x: 400, y: currentY }
    });

    const topics = (section && typeof section === "object" && Array.isArray(section.topics)) ? section.topics : [];
    const numTopics = topics.length;

    topics.forEach((topic: any, tIdx: number) => {
      detectedTopics++;
      const topicId = `sec-${sIdx}-top-${tIdx}`;
      const topicTitle = typeof topic === "string" ? topic : (topic.title || topic.name || `Topic ${tIdx + 1}`);
      const topicDesc = typeof topic === "string" ? "" : (topic.description || "");

      // Position horizontally staggered under the section node
      const topicX = 400 + (tIdx - (numTopics - 1) / 2) * xSpacing;
      const topicY = currentY + ySpacing;

      nodes.push({
        id: topicId,
        title: topicTitle,
        description: topicDesc,
        node_type: "topic",
        color: "#3b82f6",
        position: { x: Math.round(topicX), y: Math.round(topicY) }
      });

      edges.push({
        id: `edge-${sectionId}-${topicId}`,
        source: sectionId,
        target: topicId,
        label: ""
      });

      const subtopics = (topic && typeof topic === "object" && Array.isArray(topic.subtopics)) ? topic.subtopics : [];
      subtopics.forEach((sub: any, subIdx: number) => {
        detectedSubtopics++;
        const subtopicId = `sec-${sIdx}-top-${tIdx}-sub-${subIdx}`;
        const subTitle = typeof sub === "string" ? sub : (sub.title || sub.name || `Subtopic ${subIdx + 1}`);
        const subDesc = typeof sub === "string" ? "" : (sub.description || "");

        // Position vertically stacked under their parent topic node
        const subX = topicX;
        const subY = topicY + ySpacing + subIdx * 100;

        nodes.push({
          id: subtopicId,
          title: subTitle,
          description: subDesc,
          node_type: "subtopic",
          color: "#06b6d4",
          position: { x: Math.round(subX), y: Math.round(subY) }
        });

        edges.push({
          id: `edge-${topicId}-${subtopicId}`,
          source: topicId,
          target: subtopicId,
          label: ""
        });
      });
    });

    // Calculate vertical offset for the next section to prevent overlapping
    let maxSubtopics = 0;
    topics.forEach((t: any) => {
      const subLength = (t && typeof t === "object" && Array.isArray(t.subtopics)) ? t.subtopics.length : 0;
      if (subLength > maxSubtopics) {
        maxSubtopics = subLength;
      }
    });

    currentY += ySpacing + ySpacing + maxSubtopics * 100 + 100;
  });

  return {
    roadmap: { title, description, category, difficulty, estimated_duration, is_published },
    nodes,
    edges,
    detected: {
      sections: detectedSections,
      topics: detectedTopics,
      subtopics: detectedSubtopics
    }
  };
}
