import { useMemo } from "react";
import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { IR } from "@vbd/ir";
import { useTranslation } from "react-i18next";

/**
 * Capability Map — a projection of the IR (SPEC-001 §3.3). Node positions are computed
 * deterministically from dependency depth and are NOT persisted (REV-002 F2). A later
 * milestone swaps this simple layered layout for elkjs (ADR-003 §5).
 */
export function CapabilityMap({ ir }: { ir: IR }): React.JSX.Element {
  const { t } = useTranslation();

  const { nodes, edges } = useMemo(() => {
    const capIds = ir.nodes.filter((n) => n.type === "capability").map((n) => n.id);
    const labelOf = new Map(ir.nodes.map((n) => [n.id, n.label]));

    const deps = new Map<string, string[]>();
    ir.edges
      .filter((e) => e.type === "depends_on")
      .forEach((e) => deps.set(e.from, [...(deps.get(e.from) ?? []), e.to]));

    const depth = new Map<string, number>();
    const calc = (id: string, seen: Set<string>): number => {
      const cached = depth.get(id);
      if (cached !== undefined) return cached;
      if (seen.has(id)) return 0; // cycle guard
      seen.add(id);
      const d = (deps.get(id) ?? []).reduce((m, x) => Math.max(m, calc(x, seen) + 1), 0);
      depth.set(id, d);
      return d;
    };
    capIds.forEach((id) => calc(id, new Set()));

    const rowByDepth = new Map<number, number>();
    const nodes: Node[] = capIds.map((id) => {
      const d = depth.get(id) ?? 0;
      const row = rowByDepth.get(d) ?? 0;
      rowByDepth.set(d, row + 1);
      return {
        id,
        position: { x: d * 260 + 30, y: row * 110 + 30 },
        data: { label: labelOf.get(id) ?? id },
        style: {
          width: 200,
          padding: 10,
          borderRadius: 10,
          border: "1px solid var(--edge)",
          background: "var(--card)",
          color: "var(--fg)",
          fontSize: 13,
          fontWeight: 600,
        },
      };
    });

    const edges: Edge[] = ir.edges
      .filter((e) => e.type === "depends_on")
      .map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: t("dependsOn"),
        labelStyle: { fill: "var(--muted)", fontSize: 10 },
        style: { stroke: "var(--edge)" },
      }));

    return { nodes, edges };
  }, [ir, t]);

  return (
    <div style={{ height: "100%", minHeight: 420 }}>
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background color="var(--edge)" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
