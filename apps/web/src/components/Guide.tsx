import { useTranslation } from "react-i18next";

/**
 * In-app user guide — a friendly, non-technical walkthrough for business owners. Opens as an overlay
 * from the header. Bilingual (DE/EN) via the app language toggle. Content is plain prose, not i18n
 * keys, so each language reads naturally.
 */

interface Step {
  n?: string;
  heading: string;
  body?: string;
  why?: string;
  how?: string;
  example?: string;
}

const EN: { intro: string[]; steps: Step[]; closing: string[] } = {
  intro: [
    "Kiln turns a plain-language description of your business into a complete, structured model of how it works — and a starting point for real software. You do not need to be technical. Think of it as a “business compiler”: you tell the story of your business in normal words, and the app builds the model.",
    "The golden rule: your words are the source of truth. Everything you see — the maps, the boxes, the generated code — is produced from your description. The picture is only a projection; the text is what’s real. If something looks wrong, fix your description or edit the box, and everything downstream updates.",
    "Order matters, and it’s deliberately bottom-up. Kiln first finds the concrete things your business does (Capabilities), then draws the bigger boundaries around them (Business Areas — the higher-level view), then fills in the detail: the data, the actions, the rules, the people, the processes. Each layer is derived from the ones above it, so you work top to bottom down the left rail — and you can stop at any step and still have something useful. The Home screen (click the flame, top-left) shows the whole pipeline at a glance.",
  ],
  steps: [
    {
      n: "1",
      heading: "Describe your business",
      why: "This is the foundation. The clearer your description, the better everything that follows. Nothing is thrown away — the app always traces back to what you wrote.",
      how: "Three ways in, as tabs at the top. Interview: answer questions from a friendly business analyst in your own words. From text/transcript: paste a meeting transcript, notes, or a brief (or upload a .txt/.md) and let the app structure it for you. Markdown: paste a written description under the given headings.",
      example: "“We are a solar installer. We find customers, design a system for their roof, order the parts, install it, and send the invoice.”",
    },
    {
      n: "2",
      heading: "Capabilities — the building blocks",
      why: "Capabilities are the major things your business does — its “blocks of work”. They are found first because everything else in the model hangs off them.",
      how: "Click “Generate with LLM”. A map of boxes appears, joined by “depends on” lines. Click any box to read or edit it in the side panel; use “+ Capability” to add one. “Enrich” suggests blocks a typical business in your industry usually has that yours is missing — you keep only the ones that fit.",
      example: "For the solar installer you get boxes like Lead Management, Solution Design, Procurement, Installation, and Billing.",
    },
    {
      n: "3",
      heading: "Business Areas — the big picture",
      why: "This is the higher-level view: the capabilities you just found, grouped into the major parts of the business — like Sales, Delivery, and Finance. It comes after capabilities because you can only group things once you’ve found them. Later, these areas become the modules of the software.",
      how: "Click “Generate areas”. The same capability map is now coloured by area, with a legend on top. Click an area to rename it; on a capability, use the Area drop-down to move it to a different area.",
      example: "Lead Management, Customer & Offer → “Sales & Onboarding”; Design, Procurement, Installation → “Delivery”; Billing → “Finance”.",
    },
    {
      n: "4",
      heading: "Entities — the things you keep track of",
      why: "Entities are the records your business keeps — the nouns you store information about. Each has fields (a name, an amount, a date). This is your data, and it becomes database tables and on-screen forms.",
      how: "Click “Generate entities”. You get a diagram of record-boxes joined by their relationships. Click any box to open it and edit its fields; give each field a plain type — Text, Number, Yes/No, Date, Money, or Reference — so the app knows what kind of information it holds.",
      example: "Billing owns an Invoice with fields amount (Money), due date (Date), and paid (Yes/No).",
    },
    {
      n: "5",
      heading: "Behaviour — actions and what happens",
      why: "This captures what your business actually does moment to moment: the actions people take (“commands”), and the facts that result (“events”). It’s the difference between a static list and a living model of operations.",
      how: "Click “Generate behaviour”. Actions and their events are listed grouped by entity — each action (e.g. Qualify Lead, in blue) points to the events it causes (e.g. Lead Qualified). Some events happen on a timer, like “Invoice Overdue”.",
      example: "On an Invoice: the action “Record Payment” results in either “Invoice Paid” or “Payment Failed”.",
    },
    {
      n: "6",
      heading: "Automations — when this happens, do that",
      why: "Automations connect the areas of your business: when something happens in one place, work starts automatically in another. This is how your business flows without someone chasing every hand-off.",
      how: "Click “Generate automations”. Each automation appears under the event that triggers it, showing the follow-on action and which part of the business it affects.",
      example: "“When Invoice Paid → then Schedule Installation (Delivery).”",
    },
    {
      n: "7",
      heading: "Roles — who is allowed to do what",
      why: "Roles are the job personas in your business and the capabilities each one is responsible for. This is your access model — who can do which work.",
      how: "Click “Generate roles”. You get a grid: capabilities down the side, roles across the top, and a dot where a role is allowed to run a capability. “Enrich” can suggest roles you’re missing.",
      example: "Sales Representative → Lead Management; Installation Manager → Installation; Finance Clerk → Billing.",
    },
    {
      n: "8",
      heading: "Workflows — the end-to-end processes",
      why: "Workflows are the named processes that run across your whole business, step by step. They show the journey, not just the individual actions — and let you decide how each one should run.",
      how: "Click “Generate workflows”. Each process shows its steps as a chain; click the name to open its details, or a step to jump to that action. Per process, “Run as” lets you choose a fixed Workflow, an Agent (uses judgement), or External (hand it to an outside service) — and you can delegate individual steps.",
      example: "“Order to Cash”: Capture Lead → Qualify Lead → Draft Offer → Accept Offer → Issue Invoice → Record Payment.",
    },
    {
      n: "9",
      heading: "Agents — autonomous helpers",
      why: "Agents describe where software or AI could take over parts of the business, each with a clear goal. This is forward-looking: it maps the automation opportunities.",
      how: "Click “Generate agents”. Each agent card shows its goal and is wired to the capabilities it would run.",
      example: "A “Sales Agent” whose goal is to convert incoming leads into scheduled installations.",
    },
  ],
  closing: [
    "Getting around. Use the left rail to move between layers, in order. As you click into things, a breadcrumb trail builds along the top — click any crumb to go back. Most items are click-through: a step jumps to its action, a capability to its area, and so on. The grid icon (top-left, by the project name) opens the Examples picker — worked businesses you can load and explore.",
    "Findings — the app checking your work. Each layer runs automatic checks; any gaps or inconsistencies appear as findings in a panel at the top of the screen, and as a small count next to the layer in the rail. Each finding is labelled by severity (Important vs. a lighter Note) and tells you what to do about it. Click a finding to jump straight to the thing it’s about and fix it; or click ✕ to Ignore it — ignored findings stay hidden even after you regenerate, for things you can’t fix yet.",
    "AI review. Beyond the automatic checks, the “AI Review” button (top-right) asks an AI to critique the current layer for quality — vague names, missing pieces, over-wiring — and can refine it. This is a second opinion, still yours to accept or reject.",
    "Editing & enriching. Everything the app generates is a proposal, not a verdict. Click any box to change it; your edits are kept and marked with a ✎. “Enrich” (on several layers) proposes additions — either from common industry patterns or from live web research — and you keep only what fits. Remove what doesn’t belong, add what’s missing — you’re always in charge.",
    "View code — the payoff. The last item on the rail turns your model into a technical blueprint across tabs: data types, an API, on-screen structure, permissions, processes, agents, and deployment. The toolbar groups two things: Check (have an AI review, auto-fix, and test the code) and Export (download just the scaffold, a runnable app with AI-written logic, or the whole Full-Stack project as a zip). It’s a strong starting point for developers — scaffolding, not the finished software.",
    "Projects & saving. Your work saves automatically in your browser. Use the Project drop-down (top-left) to keep several businesses side by side, rename, or start a new one. The up/down arrows export and import the whole model as a single file — your portable, versionable record of the business.",
    "A note on cost. Each “Generate”, “Enrich”, or AI-review action asks an AI model to do the work, which costs a small amount per click (shown as a spend estimate). Browsing and editing are free.",
  ],
};

const DE: { intro: string[]; steps: Step[]; closing: string[] } = {
  intro: [
    "Der Kiln verwandelt eine Beschreibung Ihres Unternehmens in normaler Sprache in ein vollständiges, strukturiertes Abbild seiner Funktionsweise – und in einen Startpunkt für echte Software. Sie müssen dafür nicht technisch sein. Stellen Sie es sich wie einen „Business-Compiler“ vor: Sie erzählen die Geschichte Ihres Unternehmens in ganz normalen Worten, und die App baut daraus das Modell.",
    "Die goldene Regel: Ihre Worte sind die Wahrheit. Alles, was Sie sehen – die Karten, die Kästchen, der generierte Code – entsteht aus Ihrer Beschreibung. Das Bild ist nur eine Projektion; der Text ist das Echte. Wirkt etwas falsch, korrigieren Sie Ihre Beschreibung oder das Kästchen – alles Nachgelagerte passt sich an.",
    "Die Reihenfolge zählt und ist bewusst von unten nach oben gedacht. Der Kiln findet zuerst die konkreten Dinge, die Ihr Unternehmen tut (Fähigkeiten), zieht dann die größeren Grenzen darum (Geschäftsbereiche – die übergeordnete Sicht) und füllt danach das Detail: Daten, Aktionen, Regeln, Menschen, Prozesse. Jede Ebene wird aus den darüberliegenden abgeleitet – Sie arbeiten also die linke Leiste von oben nach unten ab und können jederzeit aufhören. Die Startseite (Klick auf die Flamme oben links) zeigt die ganze Abfolge auf einen Blick.",
  ],
  steps: [
    {
      n: "1",
      heading: "Beschreiben Sie Ihr Unternehmen",
      why: "Das ist das Fundament. Je klarer Ihre Beschreibung, desto besser alles Weitere. Nichts geht dabei verloren – die App führt alles auf das zurück, was Sie geschrieben haben.",
      how: "Drei Wege, als Tabs oben. Interview: Antworten Sie einem freundlichen Unternehmensberater in eigenen Worten. Aus Text/Transkript: Fügen Sie ein Meeting-Transkript, Notizen oder ein Briefing ein (oder laden Sie eine .txt/.md hoch) – die App strukturiert es für Sie. Markdown: Fügen Sie eine Beschreibung unter den vorgegebenen Überschriften ein.",
      example: "„Wir sind ein Solarteur. Wir gewinnen Kunden, planen eine Anlage für ihr Dach, bestellen die Teile, installieren sie und stellen die Rechnung.“",
    },
    {
      n: "2",
      heading: "Fähigkeiten – die Bausteine",
      why: "Fähigkeiten sind die großen Dinge, die Ihr Unternehmen tut – seine „Arbeitsblöcke“. Sie werden zuerst gefunden, weil alles Weitere im Modell an ihnen hängt.",
      how: "Klicken Sie auf „Mit LLM generieren“. Eine Karte aus Kästchen erscheint, verbunden durch „hängt ab von“-Linien. Klicken Sie ein Kästchen an, um es im Seitenpanel zu lesen oder zu bearbeiten; mit „+ Fähigkeit“ fügen Sie eine hinzu. „Anreichern“ schlägt Blöcke vor, die ein typisches Unternehmen Ihrer Branche üblicherweise hat und Ihnen fehlen – Sie behalten nur die passenden.",
      example: "Beim Solarteur entstehen Kästchen wie Lead-Management, Lösungsdesign, Beschaffung, Installation und Abrechnung.",
    },
    {
      n: "3",
      heading: "Geschäftsbereiche – der Überblick",
      why: "Die übergeordnete Sicht: die eben gefundenen Fähigkeiten, gebündelt zu den großen Teilen des Unternehmens – etwa Vertrieb, Lieferung und Finanzen. Dieser Schritt kommt nach den Fähigkeiten, weil man nur gruppieren kann, was man schon gefunden hat. Später werden diese Bereiche zu den Modulen der Software.",
      how: "Klicken Sie auf „Bereiche generieren“. Dieselbe Fähigkeitskarte ist nun nach Bereich eingefärbt, mit einer Legende oben. Klicken Sie einen Bereich an, um ihn umzubenennen; über das Bereich-Auswahlfeld an einer Fähigkeit verschieben Sie sie in einen anderen Bereich.",
      example: "Lead-Management, Kunde & Angebot → „Vertrieb & Onboarding“; Design, Beschaffung, Installation → „Lieferung“; Abrechnung → „Finanzen“.",
    },
    {
      n: "4",
      heading: "Entitäten – die Dinge, die Sie festhalten",
      why: "Entitäten sind die Datensätze, die Ihr Unternehmen führt – die Dinge, über die Sie Informationen speichern. Jede hat Felder (Name, Betrag, Datum). Das sind Ihre Daten und werden später zu Datenbanktabellen und Formularen.",
      how: "Klicken Sie auf „Entitäten generieren“. Sie erhalten ein Diagramm aus Datensatz-Kästchen, verbunden durch ihre Beziehungen. Klicken Sie ein Kästchen an, um es zu öffnen und seine Felder zu bearbeiten; geben Sie jedem Feld einen einfachen Typ – Text, Zahl, Ja/Nein, Datum, Betrag oder Verweis.",
      example: "Die Abrechnung besitzt eine Rechnung mit den Feldern Betrag (Betrag), Fälligkeitsdatum (Datum) und bezahlt (Ja/Nein).",
    },
    {
      n: "5",
      heading: "Verhalten – Aktionen und was passiert",
      why: "Das erfasst, was Ihr Unternehmen tatsächlich tut: die Aktionen, die Menschen ausführen („Kommandos“), und die Fakten, die daraus entstehen („Ereignisse“). Das ist der Unterschied zwischen einer statischen Liste und einem lebendigen Modell des Betriebs.",
      how: "Klicken Sie auf „Verhalten generieren“. Aktionen und ihre Ereignisse werden nach Entität gruppiert aufgelistet – jede Aktion (z. B. Lead qualifizieren, in Blau) zeigt auf die Ereignisse, die sie auslöst (z. B. Lead qualifiziert). Manche Ereignisse sind zeitgesteuert, etwa „Rechnung überfällig“.",
      example: "Bei einer Rechnung führt die Aktion „Zahlung erfassen“ zu „Rechnung bezahlt“ oder „Zahlung fehlgeschlagen“.",
    },
    {
      n: "6",
      heading: "Automatisierungen – wenn dies passiert, tue das",
      why: "Automatisierungen verbinden die Bereiche Ihres Unternehmens: Passiert an einer Stelle etwas, startet an anderer Stelle automatisch Arbeit. So fließt Ihr Betrieb, ohne dass jemand jede Übergabe nachhalten muss.",
      how: "Klicken Sie auf „Automatisierungen generieren“. Jede Automatisierung erscheint unter dem auslösenden Ereignis und zeigt die Folgeaktion und den betroffenen Teil des Unternehmens.",
      example: "„Wenn Rechnung bezahlt → dann Installation planen (Lieferung).“",
    },
    {
      n: "7",
      heading: "Rollen – wer darf was",
      why: "Rollen sind die Job-Personas in Ihrem Unternehmen und die Fähigkeiten, für die jede zuständig ist. Das ist Ihr Zugriffsmodell – wer welche Arbeit erledigen darf.",
      how: "Klicken Sie auf „Rollen generieren“. Sie erhalten ein Raster: Fähigkeiten an der Seite, Rollen oben, und ein Punkt dort, wo eine Rolle eine Fähigkeit ausführen darf. „Anreichern“ kann fehlende Rollen vorschlagen.",
      example: "Vertriebsmitarbeiter → Lead-Management; Installationsleiter → Installation; Finanzsachbearbeiter → Abrechnung.",
    },
    {
      n: "8",
      heading: "Abläufe – die durchgängigen Prozesse",
      why: "Abläufe sind die benannten Prozesse, die Schritt für Schritt durch Ihr ganzes Unternehmen laufen. Sie zeigen die Reise, nicht nur die einzelnen Aktionen – und Sie entscheiden, wie jeder laufen soll.",
      how: "Klicken Sie auf „Abläufe generieren“. Jeder Prozess zeigt seine Schritte als Kette; klicken Sie den Namen für die Details oder einen Schritt, um zur Aktion zu springen. Pro Prozess wählen Sie unter „Ausführen als“ einen festen Ablauf (Workflow), einen Agenten (nutzt Ermessen) oder Extern (an einen Fremddienst übergeben) – einzelne Schritte lassen sich delegieren.",
      example: "„Order to Cash“: Lead erfassen → Lead qualifizieren → Angebot erstellen → Angebot annehmen → Rechnung stellen → Zahlung erfassen.",
    },
    {
      n: "9",
      heading: "Agenten – autonome Helfer",
      why: "Agenten beschreiben, wo Software oder KI Teile des Unternehmens übernehmen könnte, jeweils mit einem klaren Ziel. Das ist vorausschauend: Es zeigt die Automatisierungschancen.",
      how: "Klicken Sie auf „Agenten generieren“. Jede Agentenkarte zeigt ihr Ziel und ist mit den Fähigkeiten verbunden, die sie ausführen würde.",
      example: "Ein „Vertriebsagent“, dessen Ziel es ist, eingehende Leads in geplante Installationen zu verwandeln.",
    },
  ],
  closing: [
    "Zurechtfinden. Über die linke Leiste bewegen Sie sich der Reihe nach durch die Ebenen. Während Sie in Dinge hineinklicken, baut sich oben ein Brotkrumen-Pfad auf – klicken Sie eine Krume an, um zurückzuspringen. Das meiste ist klickbar: ein Schritt springt zu seiner Aktion, eine Fähigkeit zu ihrem Bereich und so weiter. Das Raster-Symbol (oben links, beim Projektnamen) öffnet die Beispiel-Auswahl – ausgearbeitete Unternehmen zum Laden und Erkunden.",
    "Befunde – die App prüft Ihre Arbeit. Jede Ebene läuft durch automatische Prüfungen; Lücken oder Unstimmigkeiten erscheinen als Befunde in einem Panel oben und als kleine Zahl neben der Ebene in der Leiste. Jeder Befund ist nach Schweregrad gekennzeichnet (Wichtig vs. ein leichterer Hinweis) und sagt Ihnen, was zu tun ist. Klicken Sie einen Befund an, um direkt zur betroffenen Stelle zu springen und sie zu korrigieren; oder klicken Sie ✕ zum Ignorieren – ignorierte Befunde bleiben auch nach dem Neu-Generieren ausgeblendet, für Dinge, die Sie noch nicht beheben können.",
    "KI-Review. Über die automatischen Prüfungen hinaus lässt der Knopf „KI-Review“ (oben rechts) eine KI die aktuelle Ebene auf Qualität hin kritisieren – schwammige Namen, fehlende Teile, Überverdrahtung – und kann sie verfeinern. Das ist eine zweite Meinung, die Sie annehmen oder ablehnen.",
    "Bearbeiten & Anreichern. Alles, was die App erzeugt, ist ein Vorschlag, kein Urteil. Klicken Sie ein Kästchen an, um es zu ändern; Ihre Änderungen bleiben erhalten und werden mit ✎ markiert. „Anreichern“ (auf mehreren Ebenen) schlägt Ergänzungen vor – aus gängigen Branchenmustern oder aus Live-Webrecherche – und Sie behalten nur, was passt. Entfernen Sie, was nicht gehört, ergänzen Sie, was fehlt – Sie haben immer die Kontrolle.",
    "Code ansehen – der Lohn. Der letzte Punkt der Leiste macht aus Ihrem Modell einen technischen Bauplan über mehrere Tabs: Datentypen, eine API, die Bildschirmstruktur, Rechte, Prozesse, Agenten und Deployment. Die Werkzeugleiste bündelt zwei Dinge: Prüfen (eine KI Code-Review, Auto-Fix und Test durchführen lassen) und Exportieren (nur das Gerüst herunterladen, eine lauffähige App mit KI-geschriebener Logik oder das gesamte Full-Stack-Projekt als Zip). Ein starker Startpunkt für Entwickler – ein Gerüst, nicht die fertige Software.",
    "Projekte & Speichern. Ihre Arbeit wird automatisch im Browser gespeichert. Über das Projekt-Auswahlfeld (oben links) führen Sie mehrere Unternehmen nebeneinander, benennen um oder beginnen ein neues. Die Pfeile hoch/runter exportieren und importieren das ganze Modell als eine Datei – Ihr portabler, versionierbarer Datensatz des Unternehmens.",
    "Hinweis zu Kosten. Jede Aktion „Generieren“, „Anreichern“ oder KI-Review lässt ein KI-Modell arbeiten, was pro Klick einen kleinen Betrag kostet (als Ausgabenschätzung angezeigt). Ansehen und Bearbeiten sind kostenlos.",
  ],
};

export function Guide({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const g = i18n.language === "de" ? DE : EN;
  return (
    <div className="guide-overlay" onClick={onClose}>
      <div className="guide" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <h2>{t("guideTitle")}</h2>
          <button className="nd-close" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="guide-body">
          {g.intro.map((p, i) => (
            <p key={`i${i}`} className="guide-intro">{p}</p>
          ))}
          <ol className="guide-steps">
            {g.steps.map((s) => (
              <li key={s.n} className="guide-step">
                <h3><span className="guide-n">{s.n}</span> {s.heading}</h3>
                {s.body && <p>{s.body}</p>}
                {s.why && <p><strong>{t("guideWhy")}</strong> {s.why}</p>}
                {s.how && <p><strong>{t("guideHow")}</strong> {s.how}</p>}
                {s.example && <p className="guide-example"><strong>{t("guideExample")}</strong> {s.example}</p>}
              </li>
            ))}
          </ol>
          <div className="guide-closing">
            {g.closing.map((p, i) => (
              <p key={`c${i}`}>{p}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
