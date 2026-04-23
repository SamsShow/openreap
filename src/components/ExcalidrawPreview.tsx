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

  for (const raw of rawElements) {
    if (!isRec(raw) || typeof raw.type !== "string") continue;

    if (raw.type === "rectangle" || raw.type === "ellipse" || raw.type === "diamond") {
      const id = typeof raw.id === "string" ? raw.id : `n${nodes.length}`;
      nodes.push({
        id,
        type: raw.type,
        text: typeof raw.text === "string" ? raw.text.trim() : "",
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
      if (text) {
        standaloneText.push({
          type: "text",
          x: typeof raw.x === "number" ? raw.x : 0,
          y: typeof raw.y === "number" ? raw.y : 0,
          text,
          fontSize: typeof raw.fontSize === "number" ? raw.fontSize : 16,
        });
      }
    }
  }

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
    if (n.text) el.label = { text: n.text, fontSize: 18 };
    skeleton.push(el);
  }

  // Arrow skeletons — straight line between the two node centers, clipped to
  // each node's bounding box edge so arrowheads don't overlap the box.
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
    skeleton.push({
      type: "arrow",
      x: aEdge.x,
      y: aEdge.y,
      width: bEdge.x - aEdge.x,
      height: bEdge.y - aEdge.y,
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
