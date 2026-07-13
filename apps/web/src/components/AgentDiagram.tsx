// Agents as a bipartite graph: agents (left) linked by curved arrows to the capabilities they operate
// (right). A capability targeted by two agents shows converging arrows. Hand-rolled SVG (reliable,
// like the automations wiring) — no graph library needed for a two-column relation.

import { type CapabilityDoc, type AgentsDoc } from "@kiln/compiler";
import { Icon } from "./Icon";

type T = (k: string, o?: Record<string, unknown>) => string;

export function AgentDiagram({ agents, caps, onSelect, t }: { agents: AgentsDoc; caps: CapabilityDoc; onSelect: (id: string) => void; t: T }): React.JSX.Element {
  if (!agents.agents.length) return <div className="stage-empty">{t("emptyAgents")}</div>;
  const capName = (id: string) => caps.capabilities.find((c) => c.id === id)?.name || id;
  const usedCaps = [...new Set(agents.agents.flatMap((a) => a.capabilities ?? []))];

  const AG_GAP = 84, CAP_GAP = 52, PADY = 12, AG_H = 64, CAP_H = 34, AG_W = 210, CAP_W = 190, GAP_X = 360;
  const H = Math.max(agents.agents.length * AG_GAP, usedCaps.length * CAP_GAP) + PADY;
  const agTop = (i: number) => i * AG_GAP + PADY;
  const capTop = (j: number) => j * CAP_GAP + PADY;
  const capIndex = new Map(usedCaps.map((c, j) => [c, j]));

  return (
    <div className="wiring agent-graph" style={{ height: H, minWidth: GAP_X + CAP_W }}>
      <svg className="wiring-svg" width={GAP_X + CAP_W} height={H}>
        <defs><marker id="ag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker></defs>
        {agents.agents.flatMap((a, i) => (a.capabilities ?? []).map((c) => {
          const j = capIndex.get(c); if (j === undefined) return null;
          const y1 = agTop(i) + AG_H / 2, y2 = capTop(j) + CAP_H / 2, x1 = AG_W, x2 = GAP_X;
          return <path key={`${a.id}-${c}`} d={`M ${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`} className="wire ag-wire" markerEnd="url(#ag-arrow)" />;
        }))}
      </svg>
      {agents.agents.map((a, i) => (
        <div key={a.id} className="ag-box" style={{ top: agTop(i), left: 0, width: AG_W, height: AG_H }}>
          <div className="ag-node-head"><Icon name="bot" size={14} />{a.name || a.id}</div>
          {a.goal && <div className="ag-node-goal">{a.goal}</div>}
        </div>
      ))}
      {usedCaps.map((c, j) => (
        <div key={c} className="wire-box command ag-cap" style={{ top: capTop(j), left: GAP_X, width: CAP_W }} onClick={() => onSelect(c)}>{capName(c)}</div>
      ))}
    </div>
  );
}
