// Entities as a real ER diagram: entity boxes with typed fields, connected by reference edges, laid
// out with elk. Uses React Flow DEFAULT nodes (with a JSX label) — the same edge-rendering path the
// capability map uses, so reference edges render reliably. Clicking an entity selects its owner.

import { useEffect, useMemo, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, MarkerType, useReactFlow, useNodesInitialized, type Node, type Edge } from "@xyflow/react";
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

function Flow({ nodes, edges, onSelect }: { nodes: Node[]; edges: Edge[]; onSelect: (id: string) => void }): React.JSX.Element {
  const rf = useReactFlow();
  const inited = useNodesInitialized();
  useEffect(() => { if (inited && nodes.length) rf.fitView({ padding: 0.2, duration: 200 }); }, [inited, nodes, rf]);
  return (
    <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.15} proOptions={{ hideAttribution: true }} onNodeClick={(_, n) => onSelect(n.id)}>
      <Background color="var(--edge)" gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function EntityDiagram({ domain, caps, onSelect }: { domain: DomainDoc; caps: CapabilityDoc; onSelect: (id: string) => void }): React.JSX.Element {
  const [laid, setLaid] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
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
        return {
          id: a.id, position: pos.get(a.id) ?? { x: 0, y: 0 },
          data: { label: label(a.name || a.id, fields), owner: a.owner },
          width: NODE_W, height: nodeH(fields.length),
          style: { width: NODE_W, padding: 0, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-2)", overflow: "hidden" },
        };
      });
      const edges: Edge[] = refs.map((e) => ({ id: e.id, source: e.from, target: e.to, markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" }, style: { stroke: "#94a3b8" } }));
      setLaid({ nodes, edges });
    }).catch(() => setLaid({ nodes: [], edges: [] }));
    return () => { cancelled = true; };
  }, [sig, domain, caps]);

  if (!domain.aggregates.length) return <div className="stage-empty">—</div>;
  return (
    <div className="diagram-wrap">
      <ReactFlowProvider key={laid.nodes.map((n) => n.id).join("|")}>
        <Flow nodes={laid.nodes} edges={laid.edges} onSelect={onSelect} />
      </ReactFlowProvider>
    </div>
  );
}
