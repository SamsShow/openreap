/**
 * Diagram Weaver intermediate format → Excalidraw scene.
 *
 * The Diagram Weaver model emits a tiny graph schema instead of full
 * Excalidraw JSON. The schema is dramatically easier for a 9B-class model
 * to produce correctly than Excalidraw's element format, and it makes
 * branching invariants checkable (every decision must have ≥2 outgoing
 * edges, leaves must be terminal kinds, etc).
 *
 *   {
 *     "title": "ER triage",
 *     "nodes": [
 *       { "id": "n1", "kind": "start",    "label": "Patient walks in" },
 *       { "id": "n2", "kind": "step",     "label": "Triage assesses" },
 *       { "id": "n3", "kind": "decision", "label": "Life threatening?" },
 *       { "id": "n4", "kind": "step",     "label": "Trauma Bay" },
 *       { "id": "n5", "kind": "step",     "label": "Waiting room" },
 *       { "id": "n6", "kind": "end",      "label": "Patient discharged" }
 *     ],
 *     "edges": [
 *       { "from": "n1", "to": "n2" },
 *       { "from": "n2", "to": "n3" },
 *       { "from": "n3", "to": "n4", "label": "yes" },
 *       { "from": "n3", "to": "n5", "label": "no"  },
 *       { "from": "n4", "to": "n6" },
 *       { "from": "n5", "to": "n6" }
 *     ]
 *   }
 *
 * This module:
 *   1. detects whether `raw` looks like the graph schema,
 *   2. validates structural invariants (collects warnings, doesn't throw),
 *   3. converts to the Excalidraw scene shape that ExcalidrawPreview eats.
 */

export type GraphNodeKind = "start" | "step" | "decision" | "end" | "io";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  color?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface DiagramGraph {
  title?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ExcalidrawScene {
  type: "excalidraw";
  version: 2;
  source: "openreap";
  elements: unknown[];
  appState: { viewBackgroundColor: string; gridSize: null };
  files: Record<string, never>;
}

const KIND_TO_SHAPE: Record<GraphNodeKind, "rectangle" | "ellipse" | "diamond"> = {
  start: "ellipse",
  end: "ellipse",
  decision: "diamond",
  step: "rectangle",
  io: "rectangle",
};

const KIND_DEFAULT_COLOR: Record<GraphNodeKind, string> = {
  start: "#bbf7d0",
  end: "#fecaca",
  decision: "#fde68a",
  step: "#bae6fd",
  io: "#e9d5ff",
};

export function looksLikeGraph(value: unknown): value is DiagramGraph {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.nodes) && Array.isArray(v.edges);
}

function asNode(raw: unknown): GraphNode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  const label = typeof r.label === "string" ? r.label : "";
  if (!id) return null;
  const kindRaw = typeof r.kind === "string" ? r.kind.toLowerCase() : "step";
  const kind: GraphNodeKind =
    kindRaw === "start" ||
    kindRaw === "end" ||
    kindRaw === "decision" ||
    kindRaw === "io"
      ? (kindRaw as GraphNodeKind)
      : "step";
  const color = typeof r.color === "string" ? r.color : undefined;
  return { id, kind, label: label.trim(), color };
}

function asEdge(raw: unknown): GraphEdge | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const from = typeof r.from === "string" ? r.from : null;
  const to = typeof r.to === "string" ? r.to : null;
  if (!from || !to) return null;
  const label = typeof r.label === "string" ? r.label : undefined;
  return { from, to, label };
}

export interface NormalizedGraph {
  graph: DiagramGraph;
  warnings: string[];
}

/**
 * Validate + repair. Drops edges to unknown nodes. Warns when a decision
 * node has fewer than 2 outgoing edges (the model failed to branch). Does
 * NOT throw — the caller already paid; surface the diagram we have.
 */
export function normalizeGraph(raw: unknown): NormalizedGraph {
  const warnings: string[] = [];
  if (!looksLikeGraph(raw)) {
    return {
      graph: { nodes: [], edges: [] },
      warnings: ["payload is not a graph (missing nodes/edges arrays)"],
    };
  }

  const rawNodes = (raw as DiagramGraph).nodes ?? [];
  const rawEdges = (raw as DiagramGraph).edges ?? [];

  const nodes: GraphNode[] = [];
  const seenIds = new Set<string>();
  for (const n of rawNodes) {
    const parsed = asNode(n);
    if (!parsed) continue;
    if (seenIds.has(parsed.id)) continue;
    seenIds.add(parsed.id);
    nodes.push(parsed);
  }

  const edges: GraphEdge[] = [];
  for (const e of rawEdges) {
    const parsed = asEdge(e);
    if (!parsed) continue;
    if (!seenIds.has(parsed.from) || !seenIds.has(parsed.to)) {
      warnings.push(
        `edge ${parsed.from}→${parsed.to} references unknown node — dropped`
      );
      continue;
    }
    edges.push(parsed);
  }

  const outDeg = new Map<string, number>();
  for (const e of edges) outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);

  for (const n of nodes) {
    if (n.kind === "decision" && (outDeg.get(n.id) ?? 0) < 2) {
      warnings.push(
        `decision "${n.label || n.id}" has only ${outDeg.get(n.id) ?? 0} outgoing edge(s) — flow is missing a branch`
      );
    }
  }

  return {
    graph: {
      title: typeof (raw as DiagramGraph).title === "string"
        ? (raw as DiagramGraph).title
        : undefined,
      nodes,
      edges,
    },
    warnings,
  };
}

export function graphToExcalidraw(graph: DiagramGraph): ExcalidrawScene {
  const elements: unknown[] = [];

  for (const n of graph.nodes) {
    const shape = KIND_TO_SHAPE[n.kind];
    elements.push({
      id: n.id,
      type: shape,
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      text: n.label,
      strokeColor: "#1e1e1e",
      backgroundColor: n.color ?? KIND_DEFAULT_COLOR[n.kind],
    });
  }

  let edgeIdx = 0;
  for (const e of graph.edges) {
    elements.push({
      id: `e${edgeIdx++}`,
      type: "arrow",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      points: [
        [0, 0],
        [1, 0],
      ],
      startBinding: { elementId: e.from, focus: 0, gap: 4 },
      endBinding: { elementId: e.to, focus: 0, gap: 4 },
      label: e.label ? { text: e.label, fontSize: 14 } : undefined,
    });
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "openreap",
    elements,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: {},
  };
}
