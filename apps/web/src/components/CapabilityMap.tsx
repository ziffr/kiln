import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  useNodesInitialized,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import type { IR } from "@vbd/ir";
import { useTranslation } from "react-i18next";

const elk = new ELK();
const NODE_W = 190;
const NODE_H = 54;

type Selectable = { selectedId: string | null; onSelect: (id: string | null) => void };

/** Inner flow — refits once React Flow has measured the elk-positioned nodes. */
function Flow({ nodes, edges, onSelect }: { nodes: Node[]; edges: Edge[]; onSelect: (id: string | null) => void }): React.JSX.Element {
  const rf = useReactFlow();
  const inited = useNodesInitialized();
  useEffect(() => {
    if (inited && nodes.length) rf.fitView({ padding: 0.2, duration: 200 });
  }, [inited, nodes, rf]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
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
  const [laid, setLaid] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    let cancelled = false;
    const caps = ir.nodes.filter((n) => n.type === "capability");
    const capIds = new Set(caps.map((c) => c.id));
    // Drop dangling depends_on edges (target deleted) — V5 flags them; elk would otherwise throw.
    const depEdges = ir.edges.filter((e) => e.type === "depends_on" && capIds.has(e.from) && capIds.has(e.to));
    const labelOf = new Map(ir.nodes.map((n) => [n.id, n.label]));

    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        // Vertical layout fits the narrow, tall capabilities column far better than RIGHT.
        "elk.direction": "DOWN",
        "elk.spacing.nodeNode": "28",
        "elk.layered.spacing.nodeNodeBetweenLayers": "48",
      },
      children: caps.map((c) => ({ id: c.id, width: NODE_W, height: NODE_H })),
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
          height: NODE_H,
        }));
        const edges: Edge[] = depEdges.map((e) => ({
          id: e.id,
          source: e.from,
          target: e.to,
          label: t("dependsOn"),
          labelStyle: { fill: "var(--muted)", fontSize: 10 },
          style: { stroke: "var(--edge)" },
        }));
        setLaid({ nodes, edges });
      })
      .catch(() => setLaid({ nodes: [], edges: [] }));

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
            padding: 10,
            borderRadius: 10,
            // The Business-Areas backdrop: a thick coloured left edge tints each capability by its
            // area (REV-016 F1 — one surface, colour+legend), selection still wins the outline.
            border: `1px solid ${sel ? "var(--accent)" : "var(--edge)"}`,
            borderLeft: area ? `6px solid ${area.color}` : `1px solid ${sel ? "var(--accent)" : "var(--edge)"}`,
            boxShadow: sel ? "0 0 0 2px var(--accent)" : "none",
            background: "var(--card)",
            color: "var(--fg)",
            fontSize: 13,
            fontWeight: 600,
          },
        };
      }),
    [laid.nodes, selectedId, areaOf],
  );

  // Key by the capability set (NOT selection) so the flow remounts — and fitView-on-init
  // runs against measured nodes — whenever the model changes, but never when you just select.
  const flowKey = useMemo(() => laid.nodes.map((n) => n.id).join("|"), [laid.nodes]);

  return (
    <div style={{ height: "100%", minHeight: 420 }}>
      {laid.nodes.length === 0 ? (
        <div className="map-empty">
          <span className="map-spinner" aria-hidden="true" />
          <span className="map-empty-label">{t("generating")}</span>
        </div>
      ) : (
        <ReactFlowProvider key={flowKey}>
          <Flow nodes={nodes} edges={laid.edges} onSelect={onSelect} />
        </ReactFlowProvider>
      )}
    </div>
  );
}
