"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import dagre from "dagre";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false, loading: () => <div className="h-[420px]" /> }
);

interface ExcalidrawScene {
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
}

type Unknown = Record<string, unknown>;

function isRec(v: unknown): v is Unknown {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

interface ParsedNode {
  id: string;
  type: "rectangle" | "ellipse" | "diamond";
  text: string;
  strokeColor: string;
  backgroundColor: string;
}

interface ParsedEdge {
  from: string;
  to: string;
}

/**
 * LLM output is unreliable about x/y coordinates. We throw the model's
 * layout away entirely and recompute it from the graph structure using
 * dagre. Nodes get uniform sizing (wide enough for their label), edges are
 * resolved from arrow startBinding/endBinding ids.
 */
function buildLayoutedSkeleton(rawElements: unknown[]): Unknown[] {
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];
  const standaloneText: Unknown[] = [];

  // Two passes: first collect nodes + remember any containerId-bound
  // text elements so we can attach them to their parent's label. LLM
  // output often splits node + text into sibling elements rather than
  // inlining text on the node, which left most boxes empty in the
  // preview.
  const pendingText = new Map<string, string>();
  const unattachedText: Unknown[] = [];

  for (const raw of rawElements) {
    if (!isRec(raw) || typeof raw.type !== "string") continue;

    if (raw.type === "rectangle" || raw.type === "ellipse" || raw.type === "diamond") {
      const id = typeof raw.id === "string" ? raw.id : `n${nodes.length}`;
      // Accept text on the node directly, in a nested label object, or
      // on originalText (Excalidraw's persisted field).
      const directText =
        typeof raw.text === "string"
          ? raw.text
          : isRec(raw.label) && typeof raw.label.text === "string"
            ? raw.label.text
            : typeof raw.originalText === "string"
              ? raw.originalText
              : "";
      nodes.push({
        id,
        type: raw.type,
        text: directText.trim(),
        strokeColor:
          typeof raw.strokeColor === "string" ? raw.strokeColor : "#1e1e1e",
        backgroundColor:
          typeof raw.backgroundColor === "string" && raw.backgroundColor !== "transparent"
            ? raw.backgroundColor
            : "#ffffff",
      });
      continue;
    }

    if (raw.type === "arrow" || raw.type === "line") {
      const from =
        isRec(raw.startBinding) && typeof raw.startBinding.elementId === "string"
          ? raw.startBinding.elementId
          : null;
      const to =
        isRec(raw.endBinding) && typeof raw.endBinding.elementId === "string"
          ? raw.endBinding.elementId
          : null;
      if (from && to) edges.push({ from, to });
      continue;
    }

    if (raw.type === "text") {
      const text = typeof raw.text === "string" ? raw.text : "";
      if (!text) continue;
      // If the LLM emitted a containerId (standard Excalidraw format
      // for node labels), stash it to attach to the parent node after
      // this loop finishes.
      const containerId =
        typeof raw.containerId === "string" ? raw.containerId : null;
      if (containerId) {
        pendingText.set(containerId, text);
      } else {
        unattachedText.push({
          type: "text",
          x: typeof raw.x === "number" ? raw.x : 0,
          y: typeof raw.y === "number" ? raw.y : 0,
          text,
          fontSize: typeof raw.fontSize === "number" ? raw.fontSize : 16,
        });
      }
    }
  }

  // Promote bound text elements to node labels.
  for (const n of nodes) {
    if (!n.text && pendingText.has(n.id)) {
      n.text = pendingText.get(n.id)!.trim();
    }
  }
  standaloneText.push(...unattachedText);

  // Size each node to fit its label. Excalidraw's Virgil at 18px needs
  // ~12 px/char and ~30 px of horizontal padding to avoid clipping the
  // first/last characters of long labels. No upper cap — let wide labels
  // get wide rectangles; dagre will space things out accordingly.
  function sizeFor(node: ParsedNode): { width: number; height: number } {
    const lines = node.text.split(/\r?\n/);
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const width = Math.max(180, longest * 12 + 60);
    const height = Math.max(72, lines.length * 28 + 32);
    return { width, height };
  }

  const g = new dagre.graphlib.Graph({ compound: false });
  g.setGraph({
    rankdir: "LR",
    nodesep: 60,
    ranksep: 100,
    marginx: 30,
    marginy: 30,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const { width, height } = sizeFor(n);
    g.setNode(n.id, { width, height });
  }

  // Only keep edges that reference real nodes — silent drop otherwise.
  const nodeIds = new Set(nodes.map((n) => n.id));
  let validEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  // Fallback: small LLMs routinely run out of tokens before emitting arrows
  // for long scenes, leaving N nodes with 0 edges. Without edges dagre
  // stacks every node in its own rank. Auto-chain them in emission order —
  // the user's prompt was a sequential flow description anyway, so a linear
  // A → B → C chain is the right default.
  if (validEdges.length === 0 && nodes.length >= 2) {
    validEdges = [];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      validEdges.push({ from: nodes[i].id, to: nodes[i + 1].id });
    }
  }

  for (const e of validEdges) g.setEdge(e.from, e.to);

  // If the graph is a pure linear chain (every node has ≤1 in/out edge) and
  // long enough that LR dagre would produce an unreadable ribbon, bypass
  // dagre and snake-wrap rows instead. Arrows between row ends turn back,
  // giving the preview a 2D shape that fills the canvas.
  const CHAIN_WRAP_THRESHOLD = 6;
  if (
    nodes.length > CHAIN_WRAP_THRESHOLD &&
    isLinearChain(nodes, validEdges)
  ) {
    return snakeLayout(nodes, validEdges, sizeFor, standaloneText);
  }

  dagre.layout(g);

  const skeleton: Unknown[] = [];

  // Node skeletons with dagre-computed positions. dagre gives us center
  // coords; Excalidraw wants top-left.
  for (const n of nodes) {
    const layout = g.node(n.id) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    if (!layout) continue;
    const el: Unknown = {
      type: n.type,
      x: layout.x - layout.width / 2,
      y: layout.y - layout.height / 2,
      width: layout.width,
      height: layout.height,
      strokeColor: n.strokeColor,
      backgroundColor: n.backgroundColor,
    };
    if (n.text) el.label = { text: n.text, fontSize: 20 };
    skeleton.push(el);
  }

  // Arrow skeletons. convertToExcalidrawElements accepts start/end by
  // element id — gives us nice arrow-to-box bindings for free.
  for (const e of validEdges) {
    const a = g.node(e.from) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const b = g.node(e.to) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    if (!a || !b) continue;
    const aEdge = edgePoint(a, b.x, b.y);
    const bEdge = edgePoint(b, a.x, a.y);
    const dx = bEdge.x - aEdge.x;
    const dy = bEdge.y - aEdge.y;
    // Skip degenerate arrows — zero-length arrows or ones with NaN
    // coords break Excalidraw's scene renderer (sad-face icon).
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    skeleton.push({
      type: "arrow",
      x: aEdge.x,
      y: aEdge.y,
      width: dx,
      height: dy,
      points: [
        [0, 0],
        [dx, dy],
      ],
    });
  }

  return [...skeleton, ...standaloneText];
}

function isLinearChain(nodes: ParsedNode[], edges: ParsedEdge[]): boolean {
  if (nodes.length < 2) return false;
  if (edges.length !== nodes.length - 1) return false;
  const outDeg = new Map<string, number>();
  const inDeg = new Map<string, number>();
  for (const e of edges) {
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }
  for (const n of nodes) {
    if ((outDeg.get(n.id) ?? 0) > 1) return false;
    if ((inDeg.get(n.id) ?? 0) > 1) return false;
  }
  return true;
}

/**
 * Snake-wrap a linear chain into rows. Row width is driven by the widest
 * node so long labels don't clip. Rows alternate LR / RL so the chain
 * reads continuously — arrows between end-of-row and start-of-next-row
 * route vertically via a midpoint.
 */
function snakeLayout(
  nodes: ParsedNode[],
  edges: ParsedEdge[],
  sizeFor: (n: ParsedNode) => { width: number; height: number },
  standaloneText: Unknown[]
): Unknown[] {
  // Walk edges to determine actual chain order (can't rely on emission).
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const next = new Map(edges.map((e) => [e.from, e.to]));
  const hasIncoming = new Set(edges.map((e) => e.to));
  const start = nodes.find((n) => !hasIncoming.has(n.id)) ?? nodes[0];
  const chain: ParsedNode[] = [];
  let cursor: ParsedNode | undefined = start;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.push(cursor);
    const nextId = next.get(cursor.id);
    cursor = nextId ? byId.get(nextId) : undefined;
  }
  // In case of a broken walk, append the leftovers so no node disappears.
  for (const n of nodes) if (!seen.has(n.id)) chain.push(n);

  const sizes = chain.map(sizeFor);
  const maxWidth = Math.max(...sizes.map((s) => s.width));
  const maxHeight = Math.max(...sizes.map((s) => s.height));
  const gapX = 80;
  const gapY = 120;

  const cols = Math.min(5, Math.max(3, Math.ceil(Math.sqrt(chain.length))));
  const cellW = maxWidth + gapX;
  const cellH = maxHeight + gapY;

  const positions = chain.map((_, i) => {
    const row = Math.floor(i / cols);
    const colInRow = i % cols;
    const col = row % 2 === 0 ? colInRow : cols - 1 - colInRow;
    return {
      cx: col * cellW + maxWidth / 2 + 40,
      cy: row * cellH + maxHeight / 2 + 40,
    };
  });

  const skeleton: Unknown[] = [];

  for (let i = 0; i < chain.length; i += 1) {
    const n = chain[i];
    const { width, height } = sizes[i];
    const { cx, cy } = positions[i];
    const el: Unknown = {
      type: n.type,
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      strokeColor: n.strokeColor,
      backgroundColor: n.backgroundColor,
    };
    if (n.text) el.label = { text: n.text, fontSize: 20 };
    skeleton.push(el);
  }

  for (let i = 0; i < chain.length - 1; i += 1) {
    const aSize = sizes[i];
    const bSize = sizes[i + 1];
    const a = {
      x: positions[i].cx,
      y: positions[i].cy,
      width: aSize.width,
      height: aSize.height,
    };
    const b = {
      x: positions[i + 1].cx,
      y: positions[i + 1].cy,
      width: bSize.width,
      height: bSize.height,
    };
    const aEdge = edgePoint(a, b.x, b.y);
    const bEdge = edgePoint(b, a.x, a.y);
    const dx = bEdge.x - aEdge.x;
    const dy = bEdge.y - aEdge.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    skeleton.push({
      type: "arrow",
      x: aEdge.x,
      y: aEdge.y,
      width: dx,
      height: dy,
      points: [
        [0, 0],
        [dx, dy],
      ],
    });
  }

  return [...skeleton, ...standaloneText];
}

function edgePoint(
  box: { x: number; y: number; width: number; height: number },
  tx: number,
  ty: number
): { x: number; y: number } {
  const dx = tx - box.x;
  const dy = ty - box.y;
  if (dx === 0 && dy === 0) return { x: box.x, y: box.y };
  const hw = box.width / 2;
  const hh = box.height / 2;
  const scaleX = hw / Math.abs(dx || 1);
  const scaleY = hh / Math.abs(dy || 1);
  const scale = Math.min(scaleX, scaleY);
  return { x: box.x + dx * scale, y: box.y + dy * scale };
}

export function ExcalidrawPreview({ scene }: { scene: ExcalidrawScene }) {
  const skeleton = useMemo(
    () => buildLayoutedSkeleton(Array.isArray(scene.elements) ? scene.elements : []),
    [scene.elements]
  );

  const [state, setState] = useState<{
    elements: unknown[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@excalidraw/excalidraw");
        const converted = mod.convertToExcalidrawElements(
          skeleton as Parameters<typeof mod.convertToExcalidrawElements>[0]
        );
        if (!cancelled) setState({ elements: converted, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ExcalidrawPreview] convert failed:", err, {
          skeleton,
        });
        if (!cancelled) setState({ elements: [], error: msg });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skeleton]);

  const appState = {
    viewBackgroundColor:
      (scene.appState?.viewBackgroundColor as string) ?? "#ffffff",
    collaborators: new Map(),
  };

  return (
    <div className="rounded-lg overflow-hidden border border-border h-[480px] bg-white">
      {state?.error && (
        <div className="p-3 text-xs text-red-600 font-mono">{state.error}</div>
      )}
      {state && !state.error && (
        <Excalidraw
          initialData={{
            elements: state.elements as never,
            appState: appState as never,
            files: (scene.files ?? {}) as never,
            scrollToContent: true,
          }}
          viewModeEnabled
          zenModeEnabled
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false,
              export: false,
              loadScene: false,
              saveToActiveFile: false,
              toggleTheme: false,
              saveAsImage: false,
            },
            tools: { image: false },
          }}
        />
      )}
    </div>
  );
}

export default ExcalidrawPreview;
