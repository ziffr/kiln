import {
  resolvePlacement,
  validatePlacement,
  registeredDeployTargets,
  engineDescriptor,
  DEFAULT_BINDING,
  type Binding,
  type HostingMode,
  type HostingSpec,
} from "@kiln/codegen";

// SPEC-012 Phase 2b#1 — the in-app editor for `binding.hosting` (deployment placement). Authored here
// instead of hand-editing model.json. Pure/isomorphic codegen helpers run live in the browser (zero cost),
// so PB1–PB5 findings surface as you edit. Placement round-trips as part of the project's binding.

interface Props {
  binding: Binding | null | undefined;
  onChange: (next: Binding) => void;
}

const MODES: HostingMode[] = ["local", "selfhost", "managed"];
const MODE_HELP: Record<HostingMode, string> = {
  local: "runs in the generated docker-compose on your machine",
  selfhost: "the same image on your own remote box",
  managed: "a hosted service you point at (pruned from docker-compose)",
};

export function PlacementEditor({ binding, onChange }: Props): React.JSX.Element {
  const eff: Binding = binding ?? DEFAULT_BINDING;

  // The engines actually in the topology: every value in defaults + per-area overrides + the agent runtime.
  const engineIds = Array.from(
    new Set(
      [
        ...Object.values(eff.defaults ?? {}),
        ...Object.values(eff.byArea ?? {}).flatMap((a) => Object.values(a ?? {})),
        eff.agentRuntime,
      ].filter((x): x is string => Boolean(x)),
    ),
  ).sort();

  const targets = registeredDeployTargets();
  const findings = validatePlacement(eff, engineIds);

  const setSpec = (engineId: string, patch: Partial<HostingSpec> | null): void => {
    const hosting = { ...(eff.hosting ?? {}) };
    if (patch === null || patch.mode === "local") {
      delete hosting[engineId]; // local is the default → keep the binding minimal (byte-identical export)
    } else {
      const cur = resolvePlacement(eff, engineId);
      const next: HostingSpec = { mode: cur.mode, target: cur.target, urlEnv: eff.hosting?.[engineId]?.urlEnv, url: eff.hosting?.[engineId]?.url, ...patch };
      // default a sensible target when switching to a non-local mode with none chosen
      if (!next.target && next.mode !== "local") next.target = next.mode === "managed" ? "managed" : "docker";
      hosting[engineId] = next;
    }
    onChange({ ...eff, hosting });
  };

  return (
    <div className="placement-editor">
      <h3 className="settings-h">Deployment placement</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Where each part of the generated system runs. <strong>Local</strong> runs it in docker-compose;
        <strong> managed</strong> points at a hosted service and prunes it from compose. Leave everything
        local (the default) and the exported project is unchanged.
      </p>
      <table className="settings-table">
        <thead><tr><th>Engine</th><th>Where</th><th>Target</th><th>Reach var</th></tr></thead>
        <tbody>
          {engineIds.map((id) => {
            const place = resolvePlacement(eff, id);
            const name = engineDescriptor(id)?.name ?? id;
            const modeTargets = targets.filter((tg) => tg.modes.includes(place.mode));
            return (
              <tr key={id}>
                <td><span className="settings-stage-name">{name}</span></td>
                <td>
                  <select value={place.mode} onChange={(e) => setSpec(id, { mode: e.target.value as HostingMode })} title={MODE_HELP[place.mode]}>
                    {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </td>
                <td>
                  {place.mode === "local" ? (
                    <span className="muted">—</span>
                  ) : (
                    <select value={place.target ?? ""} onChange={(e) => setSpec(id, { target: e.target.value || undefined })}>
                      {modeTargets.map((tg) => <option key={tg.id} value={tg.id}>{tg.name}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  {place.mode === "local" ? (
                    <span className="muted">—</span>
                  ) : (
                    <input type="text" value={eff.hosting?.[id]?.urlEnv ?? ""} placeholder={place.urlEnv ?? "REACH_URL"}
                      onChange={(e) => setSpec(id, { urlEnv: e.target.value || undefined })} style={{ minWidth: 150 }} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {findings.length > 0 && (
        <ul className="placement-findings">
          {findings.map((f, i) => (
            <li key={i} className={f.level === "error" ? "pf-error" : "pf-warn"}>
              <strong>{f.code}</strong> {f.message}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Put credentials in <code>.env</code> at deploy time — a <code>url</code> here is a non-secret host
        hint only. The export writes <code>PLACEMENT.md</code> + <code>deployment.json</code> when anything
        is remote.
      </p>
    </div>
  );
}
