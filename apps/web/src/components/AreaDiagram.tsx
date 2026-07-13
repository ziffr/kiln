// Business areas as a CONTAINMENT diagram: each bounded context is a box that visually contains its
// capabilities, and capability dependencies are drawn — a dependency that stays inside an area reads
// as cohesion, one that crosses a boundary (orange, dashed) is an integration point. Hand-rolled
// HTML boxes + an SVG dependency overlay (reliable; positions are fully under our control).

import { type CapabilityDoc, type ContextsDoc } from "@kiln/compiler";

type T = (k: string, o?: Record<string, unknown>) => string;
const CAP_W = 176, CAP_H = 40, GAP_Y = 12, HEAD = 40, PAD_X = 14, PAD_B = 14, AREA_W = CAP_W + 28, AREA_GAP = 48;

export function AreaDiagram({ contexts, caps, colors, onSelectArea, onSelectCap, t }: {
  contexts: ContextsDoc; caps: CapabilityDoc; colors: string[];
  onSelectArea: (id: string) => void; onSelectCap: (id: string) => void; t: T;
}): React.JSX.Element {
  if (!contexts.contexts.length) return <div className="stage-empty">{t("emptyAreas")}</div>;
  const capName = (id: string) => caps.capabilities.find((c) => c.id === id)?.name || id;

  // Layout: areas in a row; capabilities stacked inside each. Record each capability's box geometry.
  type Box = { x: number; y: number; areaId: string };
  const pos = new Map<string, Box>();
  const areaOf = new Map<string, string>();
  let maxH = 0;
  contexts.contexts.forEach((a, ai) => {
    const areaX = ai * (AREA_W + AREA_GAP);
    (a.capabilities ?? []).forEach((cap, j) => {
      pos.set(cap, { x: areaX + PAD_X, y: HEAD + j * (CAP_H + GAP_Y), areaId: a.id });
      areaOf.set(cap, a.id);
    });
    const h = HEAD + Math.max(1, (a.capabilities ?? []).length) * (CAP_H + GAP_Y) - GAP_Y + PAD_B;
    maxH = Math.max(maxH, h);
  });
  const totalW = contexts.contexts.length * (AREA_W + AREA_GAP);

  const edges = caps.capabilities.flatMap((c) =>
    (c.depends_on ?? []).filter((d) => pos.has(d) && pos.has(c.id) && d !== c.id).map((d) => {
      const A = pos.get(c.id)!, B = pos.get(d)!;
      const cross = A.areaId !== B.areaId;
      const sx = A.x < B.x ? A.x + CAP_W : A.x, ex = B.x < A.x ? B.x + CAP_W : B.x;
      const sy = A.y + CAP_H / 2, ey = B.y + CAP_H / 2;
      return { id: `${c.id}-${d}`, d: `M ${sx} ${sy} C ${sx + (ex > sx ? 60 : -60)} ${sy}, ${ex + (sx > ex ? 60 : -60)} ${ey}, ${ex} ${ey}`, cross };
    }),
  );

  return (
    <div className="area-containment" style={{ width: totalW, height: maxH }}>
      <svg className="wiring-svg" width={totalW} height={maxH}>
        <defs>
          <marker id="dep-in" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b" /></marker>
          <marker id="dep-cross" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#f59e0b" /></marker>
        </defs>
        {edges.map((e) => <path key={e.id} d={e.d} className={`wire ${e.cross ? "dep-cross" : "dep-in"}`} markerEnd={`url(#${e.cross ? "dep-cross" : "dep-in"})`} />)}
      </svg>
      {contexts.contexts.map((a, ai) => (
        <div key={a.id} className="area-box" style={{ left: ai * (AREA_W + AREA_GAP), top: 0, width: AREA_W, height: maxH, ["--area-color" as string]: colors[ai % colors.length] }}>
          <button className="area-box-head" onClick={() => onSelectArea(a.id)}>{a.name || a.id}</button>
        </div>
      ))}
      {[...pos].map(([cap, b]) => (
        <div key={cap} className="area-cap" style={{ left: b.x, top: b.y, width: CAP_W, height: CAP_H }} onClick={() => onSelectCap(cap)}>{capName(cap)}</div>
      ))}
    </div>
  );
}
