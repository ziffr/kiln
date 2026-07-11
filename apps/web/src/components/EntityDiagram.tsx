// Entities as a real ER diagram: entity boxes with typed fields, connected by reference edges, laid
// out with elk. Uses React Flow DEFAULT nodes (with a JSX label) — the same edge-rendering path the
// capability map uses, so reference edges render reliably. Clicking an entity selects its owner.

import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, MarkerType, useReactFlow, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { attributeSpecs, type CapabilityDoc, type DomainDoc } from "@vbd/compiler";

const elk = new ELK();
const NODE_W = 210;
const rowH = 22;
const headH = 34;
const nodeH = (fields: number) => headH + Math.max(1, fields) * rowH + 10;

function label(name: string, fields: { name: string; type: string }[]): React.JSX.Element {
  return (
    <div className="er-node-inner">
      <div className="er-node-head">{name}</div>
      <ul className="er-fields">
        {fields.map((f) => (<li key={f.name}><span className="er-fname">{f.name}</span><code className="er-ftype">{f.type}</code></li>))}
        {fields.length === 0 && <li className="muted er-nofields">—</li>}
      </ul>
    </div>
  );
}

type Bounds = { x: number; y: number; width: number; height: number };

function Flow({ nodes, edges, bounds, paneRef, onSelect }: { nodes: Node[]; edges: Edge[]; bounds: Bounds; paneRef: React.RefObject<HTMLDivElement | null>; onSelect: (id: string) => void }): React.JSX.Element {
  const rf = useReactFlow();
  // Fit deterministically: compute the viewport transform from the elk bounds and the container's
  // real pixel size (read straight from the DOM), then setViewport. This bypasses React Flow's
  // ResizeObserver-driven node/pane measurement entirely — which can stay un-fired on stage
  // navigation in throttled/headless environments, leaving the graph scrolled to a corner.
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
      // Fallback: if React Flow's pane never got measured (ResizeObserver un-fired), setViewport is a
      // no-op — write the transform straight onto the viewport element so the graph still fits.
      const vp = el.querySelector<HTMLElement>(".react-flow__viewport");
      if (vp && vp.style.transform.replace(/\s/g, "").startsWith("translate(0px,0px)")) {
        vp.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
      }
    };
    const timers = [40, 160, 400, 900].map((ms) => setTimeout(fit, ms));
    return () => timers.forEach(clearTimeout);
  }, [nodes, bounds, rf, paneRef]);
  return (
    <ReactFlow nodes={nodes} edges={edges} minZoom={0.15} proOptions={{ hideAttribution: true }} onNodeClick={(_, n) => onSelect(n.id)}>
      <Background color="var(--edge)" gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function EntityDiagram({ domain, caps, onSelect }: { domain: DomainDoc; caps: CapabilityDoc; onSelect: (id: string) => void }): React.JSX.Element {
  const [laid, setLaid] = useState<{ nodes: Node[]; edges: Edge[]; bounds: Bounds }>({ nodes: [], edges: [], bounds: { x: 0, y: 0, width: 1, height: 1 } });
  const sig = useMemo(() => domain.aggregates.map((a) => `${a.id}:${(a.references ?? []).join(",")}:${attributeSpecs(a).length}`).join("|"), [domain]);

  useEffect(() => {
    let cancelled = false;
    const aggs = domain.aggregates;
    const ids = new Set(aggs.map((a) => a.id));
    const refs = aggs.flatMap((a) => (a.references ?? []).filter((r) => ids.has(r) && r !== a.id).map((r) => ({ id: `${a.id}__${r}`, from: a.id, to: r })));
    const graph = {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": "DOWN", "elk.spacing.nodeNode": "40", "elk.layered.spacing.nodeNodeBetweenLayers": "64" },
      children: aggs.map((a) => ({ id: a.id, width: NODE_W, height: nodeH(attributeSpecs(a).length) })),
      edges: refs.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
    };
    elk.layout(graph).then((res) => {
      if (cancelled) return;
      const pos = new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
      const nodes: Node[] = aggs.map((a) => {
        const fields = attributeSpecs(a).map((f) => ({ name: f.name, type: f.type || "text" }));
        const h = nodeH(fields.length);
        return {
          id: a.id, position: pos.get(a.id) ?? { x: 0, y: 0 },
          data: { label: label(a.name || a.id, fields), owner: a.owner },
          // Explicit `measured` so React Flow treats the node as initialized without waiting on a
          // ResizeObserver pass — otherwise edges (and fitView) never render in some environments.
          width: NODE_W, height: h, measured: { width: NODE_W, height: h },
          style: { width: NODE_W, padding: 0, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-2)" },
        };
      });
      const edges: Edge[] = refs.map((e) => ({ id: e.id, source: e.from, target: e.to, markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8" } }));
      // Bounding box of the laid-out graph, for deterministic fitBounds (see Flow).
      const xs = nodes.map((n) => n.position.x), ys = nodes.map((n) => n.position.y);
      const maxX = Math.max(...nodes.map((n) => n.position.x + NODE_W));
      const maxY = Math.max(...nodes.map((n, i) => n.position.y + nodeH(attributeSpecs(aggs[i]).length)));
      const minX = Math.min(...xs), minY = Math.min(...ys);
      setLaid({ nodes, edges, bounds: { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) } });
    }).catch(() => setLaid({ nodes: [], edges: [], bounds: { x: 0, y: 0, width: 1, height: 1 } }));
    return () => { cancelled = true; };
  }, [sig, domain, caps]);

  const paneRef = useRef<HTMLDivElement | null>(null);
  if (!domain.aggregates.length) return <div className="stage-empty">—</div>;
  return (
    <div className="diagram-wrap" ref={paneRef}>
      {laid.nodes.length === 0 ? (
        <div className="map-empty"><span className="map-spinner" aria-hidden="true" /></div>
      ) : (
        <ReactFlowProvider key={laid.nodes.map((n) => n.id).join("|")}>
          <Flow nodes={laid.nodes} edges={laid.edges} bounds={laid.bounds} paneRef={paneRef} onSelect={onSelect} />
        </ReactFlowProvider>
      )}
    </div>
  );
}
