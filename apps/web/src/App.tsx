import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseNarrative,
  validateNarrative,
  businessOutcomes,
  coreActivities,
  customers,
} from "@vbd/narrative";
import { compileCapabilities } from "@vbd/compiler";
import { validateAll } from "@vbd/validation";
import { mockGenerateCapabilities } from "@vbd/skills";
import { narrativeMd } from "./data/solar";
import { CapabilityMap } from "./components/CapabilityMap";

function FindingsBadge({ count }: { count: number }): React.JSX.Element {
  const { t } = useTranslation();
  const ok = count === 0;
  return (
    <span className={`badge ${ok ? "ok" : "warn"}`}>
      {ok ? t("clean") : t("findingsCount", { count })}
    </span>
  );
}

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState(narrativeMd);

  // Everything below runs client-side over the pure @vbd/* packages (ADR-003 §4).
  const doc = useMemo(() => parseNarrative(text), [text]);
  const narrativeFindings = useMemo(() => validateNarrative(doc), [doc]);
  // M2: capabilities are GENERATED from the narrative (mock generator, client-side, ADR-004),
  // then compiled to the IR the map renders. Editing the narrative regenerates the map live.
  const generated = useMemo(() => mockGenerateCapabilities(doc), [doc]);
  const ir = useMemo(() => compileCapabilities(generated), [generated]);
  const capFindings = useMemo(() => validateAll(generated), [generated]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{t("appTitle")}</h1>
          <p className="tagline">{t("tagline")}</p>
        </div>
        <div className="lang">
          <span>{t("language")}:</span>
          {(["de", "en"] as const).map((lng) => (
            <button
              key={lng}
              className={i18n.language === lng ? "active" : ""}
              onClick={() => void i18n.changeLanguage(lng)}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="cols">
        <section className="col">
          <div className="col-head">
            <h2>{t("narrative")}</h2>
            <FindingsBadge count={narrativeFindings.length} />
          </div>
          <p className="hint">{t("narrativeHint")}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          {narrativeFindings.length > 0 && (
            <ul className="findings">
              {narrativeFindings.map((f) => (
                <li key={f.id}>
                  <code>{f.code}</code> {f.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="col">
          <div className="col-head">
            <h2>{t("sections")}</h2>
            <span className="muted">{doc.title}</span>
          </div>
          <ul className="sections">
            {doc.sections.map((s) => (
              <li key={s.anchor}>
                <span className="s-head">{s.heading}</span>
                <span className="muted">
                  #{s.anchor} · {s.items.length} {t("items")}
                </span>
              </li>
            ))}
          </ul>
          <div className="lists">
            <div>
              <h3>{t("outcomes")}</h3>
              <ul>{businessOutcomes(doc).map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
            <div>
              <h3>{t("activities")}</h3>
              <ul>{coreActivities(doc).map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
            <div>
              <h3>{t("customers")}</h3>
              <ul>{customers(doc).map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="col grow">
          <div className="col-head">
            <h2>{t("capabilities")}</h2>
            <FindingsBadge count={capFindings.length} />
          </div>
          <p className="hint">{t("generatedNote")}</p>
          <CapabilityMap ir={ir} />
        </section>
      </main>
    </div>
  );
}
