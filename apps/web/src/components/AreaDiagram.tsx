// Business areas as a CONTAINMENT diagram: each bounded context is a box that visually contains its
// capabilities, and capability dependencies are drawn — a dependency that stays inside an area reads
// as cohesion, one that crosses a boundary (amber, dashed) is an integration point. Hand-rolled
// HTML boxes + an SVG dependency overlay (reliable; positions are fully under our control).
//
// Areas WRAP into rows to fit the available width (measured) instead of one ever-growing row — so the
// stage never needs horizontal scrolling at normal sizes; the overlay is recomputed for the wrapped
// coordinates so cross-boundary arrows still connect.

import { useLayoutEffect, useRef, useState } from "react";
import { type CapabilityDoc, type ContextsDoc } from "@kiln/compiler";

type T = (k: string, o?: Record<string, unknown>) => string;
const CAP_W = 176, CAP_H = 40, GAP_Y = 12, HEAD = 40, PAD_X = 14, PAD_B = 14;
const AREA_W = CAP_W + 28, AREA_GAP = 32, ROW_GAP = 32, STRIDE = AREA_W + AREA_GAP;

export function AreaDiagram({ contexts, caps, colors, onSelectArea, onSelectCap, t }: {
  contexts: ContextsDoc; caps: CapabilityDoc; colors: string[];
  onSelectArea: (id: string) => void; onSelectCap: (id: string) => void; t: T;
}): React.JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setAvail(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!contexts.contexts.length) return <div className="area-scroll"><div className="stage-empty">{t("emptyAreas")}</div></div>;
  const capName = (id: string) => caps.capabilities.find((c) => c.id === id)?.name || id;

  const n = contexts.contexts.length;
  // How many area columns fit in the measured width. Before the first measure, guess 3 to avoid a
  // one-row flash; +AREA_GAP because the last column needs no trailing gap.
  const cols = avail > 0 ? Math.max(1, Math.min(n, Math.floor((avail + AREA_GAP) / STRIDE))) : Math.min(n, 3);
  const rows = Math.ceil(n / cols);

  // Each area's own height (by capability count); rows align to the tallest box in the row.
  const areaH = contexts.contexts.map((a) => HEAD + Math.max(1, (a.capabilities ?? []).length) * (CAP_H + GAP_Y) - GAP_Y + PAD_B);
  const rowMaxH = Array.from({ length: rows }, (_, r) => {
    let m = 0;
    for (let c = 0; c < cols; c++) { const i = r * cols + c; if (i < n) m = Math.max(m, areaH[i]); }
    return m;
  });
  const rowTop: number[] = [];
  { let y = 0; for (let r = 0; r < rows; r++) { rowTop.push(y); y += rowMaxH[r] + ROW_GAP; } }
  const totalH = rowTop[rows - 1] + rowMaxH[rows - 1];
  const totalW = Math.min(cols, n) * STRIDE - AREA_GAP;

  // Place every capability at its wrapped absolute position; record geometry for the overlay.
  type Box = { x: number; y: number; areaId: string };
  const pos = new Map<string, Box>();
  const boxes = contexts.contexts.map((a, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const ax = col * STRIDE, ay = rowTop[row];
    (a.capabilities ?? []).forEach((cap, j) => {
      pos.set(cap, { x: ax + PAD_X, y: ay + HEAD + j * (CAP_H + GAP_Y), areaId: a.id });
    });
    return { a, i, x: ax, y: ay, h: rowMaxH[row] };
  });

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
    <div className="area-scroll" ref={wrapRef}>
      <div className="area-containment" style={{ width: totalW, height: totalH }}>
        <svg className="wiring-svg" width={totalW} height={totalH}>
          <defs>
            <marker id="dep-in" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker>
            <marker id="dep-cross" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker>
          </defs>
          {edges.map((e) => <path key={e.id} d={e.d} className={`wire ${e.cross ? "dep-cross" : "dep-in"}`} markerEnd={`url(#${e.cross ? "dep-cross" : "dep-in"})`} />)}
        </svg>
        {boxes.map(({ a, i, x, y, h }) => (
          <div key={a.id} className="area-box" style={{ left: x, top: y, width: AREA_W, height: h, ["--area-color" as string]: colors[i % colors.length] }}>
            <button className="area-box-head" onClick={() => onSelectArea(a.id)}>{a.name || a.id}</button>
          </div>
        ))}
        {[...pos].map(([cap, b]) => (
          <div key={cap} className="area-cap" style={{ left: b.x, top: b.y, width: CAP_W, height: CAP_H }} onClick={() => onSelectCap(cap)}>{capName(cap)}</div>
        ))}
      </div>
    </div>
  );
}
