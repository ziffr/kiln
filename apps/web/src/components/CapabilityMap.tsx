import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import type { IR } from "@kiln/ir";
import { useTranslation } from "react-i18next";

const elk = new ELK();
const NODE_W = 210;
const NODE_H = 54; // minimum height; taller labels grow the box (estNodeH)
// Capability names can be long sentences — estimate the wrapped height so the box fits the text (and
// elk spaces rows for it), instead of clipping a fixed 54px box and overlapping the edge labels.
// Conservative chars/line (long German compound words break early in a 210px bold box) so elk reserves
// enough vertical room for the auto-growing node — better to over-reserve than clip/overlap.
const CHARS_PER_LINE = 17;
function estNodeH(label: string): number {
  const lines = Math.max(2, Math.ceil((label?.length ?? 0) / CHARS_PER_LINE));
  return Math.max(NODE_H, 26 + lines * 19);
}

type Selectable = { selectedId: string | null; onSelect: (id: string | null) => void };
type Bounds = { x: number; y: number; width: number; height: number };

/**
 * Inner flow — fits the elk-computed bounds deterministically. We compute the viewport transform
 * from the bounds and the container's real pixel size (read from the DOM) rather than relying on
 * React Flow's ResizeObserver-driven measurement, which can stay un-fired when the map is mounted
 * on stage navigation (not initial page load), leaving the graph scrolled to a corner. When RF's
 * own measurement is available, setViewport lands it; the DOM-transform fallback covers the rest.
 */
function Flow({ nodes, edges, bounds, paneRef, onSelect }: { nodes: Node[]; edges: Edge[]; bounds: Bounds; paneRef: React.RefObject<HTMLDivElement | null>; onSelect: (id: string | null) => void }): React.JSX.Element {
  const rf = useReactFlow();
  useEffect(() => {
    if (!nodes.length) return;
    const fit = () => {
      const el = paneRef.current;
      if (!el) return;
      const pw = el.clientWidth, ph = el.clientHeight;
      if (pw < 2 || ph < 2) return;
      const pad = 0.14;
      const zoom = Math.min(3, Math.max(0.15, Math.min((pw * (1 - pad)) / bounds.width, (ph * (1 - pad)) / bounds.height)));
      const x = pw / 2 - (bounds.x + bounds.width / 2) * zoom;
      const y = ph / 2 - (bounds.y + bounds.height / 2) * zoom;
      rf.setViewport({ x, y, zoom });
      const vp = el.querySelector<HTMLElement>(".react-flow__viewport");
      if (vp && vp.style.transform.replace(/\s/g, "").startsWith("translate(0px,0px)")) {
        vp.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      }
    };
    const timers = [40, 160, 400, 900].map((ms) => setTimeout(fit, ms));
    // The detail slide-in reflows the canvas, so the pane loses width while `nodes`/`bounds` are
    // unchanged — the timers above have long since fired and nothing re-fits, leaving the graph
    // centred on the pane it no longer has. Re-fit on any pane resize (the same trick AreaDiagram
    // uses to re-wrap). No RO loop: fit only writes the viewport transform, never the pane's size.
    const el = paneRef.current;
    const ro = el ? new ResizeObserver(fit) : null;
    if (el && ro) ro.observe(el);
    return () => { timers.forEach(clearTimeout); ro?.disconnect(); };
  }, [nodes, bounds, rf, paneRef]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      minZoom={0.15}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
    >
      <Background color="var(--edge)" gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

/**
 * Capability Map — a projection of the IR (SPEC-001 §3.3), laid out with elkjs layered layout
 * (ADR-003 §5). Positions are a pure function of the IR (never persisted). Clicking a capability
 * selects it (→ node detail panel).
 */
type AreaInfo = { id: string; name: string; color: string };

export function CapabilityMap({
  ir,
  areaOf,
  selectedId,
  onSelect,
}: { ir: IR; areaOf?: Map<string, AreaInfo> } & Selectable): React.JSX.Element {
  const { t } = useTranslation();
  const [laid, setLaid] = useState<{ nodes: Node[]; edges: Edge[]; bounds: Bounds }>({ nodes: [], edges: [], bounds: { x: 0, y: 0, width: 1, height: 1 } });
  const paneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const caps = ir.nodes.filter((n) => n.type === "capability");
    const capIds = new Set(caps.map((c) => c.id));
    // Drop dangling depends_on edges (target deleted) — V5 flags them; elk would otherwise throw.
    const depEdges = ir.edges.filter((e) => e.type === "depends_on" && capIds.has(e.from) && capIds.has(e.to));
    const labelOf = new Map(ir.nodes.map((n) => [n.id, n.label]));
    const heightOf = new Map(caps.map((c) => [c.id, estNodeH(labelOf.get(c.id) ?? c.id)]));

    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        // Vertical layout fits the narrow, tall capabilities column far better than RIGHT.
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "28",
        "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      },
      children: caps.map((c) => ({ id: c.id, width: NODE_W, height: heightOf.get(c.id) ?? NODE_H })),
      edges: depEdges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
    };

    elk
      .layout(graph)
      .then((res) => {
        if (cancelled) return;
        const pos = new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
        const nodes: Node[] = caps.map((c) => ({
          id: c.id,
          position: pos.get(c.id) ?? { x: 0, y: 0 },
          data: { label: labelOf.get(c.id) ?? c.id },
          width: NODE_W,
          // No fixed height — a fixed React Flow height clips long labels. The box auto-grows to the text
          // (style below); elk still reserved `heightOf` rows so growth doesn't overlap the next node.
        }));
        const edges: Edge[] = depEdges.map((e) => ({
          id: e.id,
          source: e.from,
          target: e.to,
          label: t("dependsOn"),
          labelStyle: { fill: "var(--muted)", fontSize: 10 },
          style: { stroke: "var(--edge)" },
        }));
        const xs = nodes.map((n) => n.position.x), ys = nodes.map((n) => n.position.y);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const maxX = Math.max(...xs.map((x) => x + NODE_W));
        const maxY = Math.max(...caps.map((c) => (pos.get(c.id)?.y ?? 0) + (heightOf.get(c.id) ?? NODE_H)));
        setLaid({ nodes, edges, bounds: { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) } });
      })
      .catch(() => setLaid({ nodes: [], edges: [], bounds: { x: 0, y: 0, width: 1, height: 1 } }));

    return () => {
      cancelled = true;
    };
  }, [ir, t]);

  // Apply selection styling without recomputing the layout.
  const nodes = useMemo(
    () =>
      laid.nodes.map((n) => {
        const area = areaOf?.get(n.id);
        const sel = n.id === selectedId;
        return {
          ...n,
          selected: sel,
          style: {
            width: NODE_W,
            // Grow to the label instead of clipping a fixed box; minHeight keeps short names uniform.
            height: "auto" as const,
            minHeight: NODE_H,
            display: "flex" as const,
            alignItems: "center" as const,
            justifyContent: "center" as const,
            padding: 11,
            paddingLeft: area ? 15 : 11,
            borderRadius: 10,
            // Only the `border` shorthand (React Flow sets it too — avoid a shorthand/longhand mix).
            // The Business-Areas backdrop is an inset box-shadow left edge tinting each capability by
            // its area (REV-016 F1); selection adds an outline ring.
            border: `1px solid ${sel ? "var(--accent)" : "var(--border)"}`,
            boxShadow: [area ? `inset 5px 0 0 ${area.color}` : "", sel ? "0 0 0 2px var(--accent)" : "0 1px 3px rgba(0,0,0,.35)"].filter(Boolean).join(", "),
            background: "var(--panel-2)",
            color: "var(--fg)",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.35,
          },
        };
      }),
    [laid.nodes, selectedId, areaOf],
  );

  // Key by the capability set (NOT selection) so the flow remounts — and fitView-on-init
  // runs against measured nodes — whenever the model changes, but never when you just select.
  const flowKey = useMemo(() => laid.nodes.map((n) => n.id).join("|"), [laid.nodes]);

  return (
    <div style={{ height: "100%", minHeight: 420 }} ref={paneRef}>
      {laid.nodes.length === 0 ? (
        <div className="map-empty">
          <span className="map-spinner" aria-hidden="true" />
          <span className="map-empty-label">{t("generating")}</span>
        </div>
      ) : (
        <ReactFlowProvider key={flowKey}>
          <Flow nodes={nodes} edges={laid.edges} bounds={laid.bounds} paneRef={paneRef} onSelect={onSelect} />
        </ReactFlowProvider>
      )}
    </div>
  );
}
