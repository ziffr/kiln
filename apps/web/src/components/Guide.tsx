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
    "Kiln turns a plain-language description of your business into a complete, structured picture of how it works — and even into a starting point for software. You do not need to be technical.",
    "Think of it as a “business compiler”: you tell the story of your business in normal words, and the app builds the model. The golden rule is simple — your words are the source of truth. Everything you see on screen (the map, the boxes, the generated code) is produced from your description. If something looks wrong, fix your description or edit the box, and the rest updates.",
    "You work top to bottom. Each step adds one more layer of detail, and each layer builds on the one before it. You can stop at any step — even the first few give you a clear map of your business.",
  ],
  steps: [
    {
      n: "1",
      heading: "Describe your business",
      why: "This is the foundation. The clearer your description, the better everything that follows. Nothing here is thrown away — the app always traces back to what you wrote.",
      how: "Use the left column. The Interview tab asks you questions like a friendly business analyst; just answer in your own words. Or use the Markdown tab to paste a written description under the given headings.",
      example: "“We are a solar installer. We find customers, design a system for their roof, order the parts, install it, and send the invoice.”",
    },
    {
      n: "2",
      heading: "Capabilities — the building blocks",
      why: "Capabilities are the major things your business does — its “blocks of work”. Everything else in the model hangs off them.",
      how: "Click “Generate with LLM”. A map of boxes appears. Click any box to read or edit it; use “+ Capability” to add one, or the trash button to remove one.",
      example: "For the solar installer you get boxes like Lead Management, Planning, Procurement, Installation, and Billing.",
    },
    {
      n: "3",
      heading: "Business Areas — grouping the blocks",
      why: "Areas group related capabilities into parts of the business — like Sales, Delivery, and Finance. They give you the big picture at a glance, and later become the modules of the software.",
      how: "Click “Generate areas”. The map colours each capability by its area, with a legend on top. Click an area to rename it or adjust which capabilities belong to it (via the Area drop-down on each capability).",
      example: "Lead & Customer & Offer Management → “Sales & Onboarding”; Planning, Procurement, Installation → “Delivery”; Billing → “Finance”.",
    },
    {
      n: "4",
      heading: "Entities — the things you keep track of",
      why: "Entities are the records your business keeps — the nouns you store information about. Each has fields (like a name, an amount, a date). This is your data, and it becomes database tables and on-screen forms.",
      how: "Click “Generate entities”. Open a capability and expand its entity to see and edit the fields. Give each field a plain type — Text, Number, Yes/No, Date, Money, or Reference — so the app knows what kind of information it holds.",
      example: "Billing owns an Invoice with fields amount (Money), due date (Date), and paid (Yes/No).",
    },
    {
      n: "5",
      heading: "Behaviour — actions and what happens",
      why: "This captures what your business actually does moment to moment: the actions people take, and the facts that result. It is the difference between a static list and a living model of operations.",
      how: "Click “Generate behaviour”. Open a capability, open an entity, and expand “What happens” to see its actions (e.g. Qualify Lead) and the events they cause (e.g. Lead Qualified). Some events happen on a timer, like “Invoice Overdue”.",
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
      how: "Click “Generate roles”. Open any capability to see which roles are allowed to operate it.",
      example: "Sales Rep → Lead Management; Installer → Installation; Finance Clerk → Billing.",
    },
    {
      n: "8",
      heading: "Workflows — the end-to-end processes",
      why: "Workflows are the named processes that run across your whole business, step by step. They show the journey, not just the individual actions.",
      how: "Click “Generate workflows”. Each workflow is an ordered sequence of the actions from step 5.",
      example: "“Order to Cash”: Qualify Lead → Create Offer → Accept Offer → Schedule Installation → Issue Invoice → Record Payment.",
    },
    {
      n: "9",
      heading: "Agents — autonomous helpers",
      why: "Agents describe where software or AI could take over parts of the business, each with a clear goal. This is forward-looking: it maps the automation opportunities.",
      how: "Click “Generate agents”. Each agent has a goal and the capabilities it would run.",
      example: "A “Sales Agent” whose goal is to convert incoming leads into scheduled installations.",
    },
  ],
  closing: [
    "Checking quality. The badge at the top of the map is your quality light. Green means no problems found. If it shows findings, the app has spotted a gap or inconsistency — click a finding to jump straight to it. The app checks your model automatically and never lets a broken one through silently.",
    "Editing. Everything the app generates is a proposal, not a verdict. Click any box to change it; your edits are kept and marked with a ✎. Remove what does not fit, add what is missing — you are always in charge.",
    "View code — the payoff. Click “View code” to see your business turned into a technical blueprint: data types, an API, on-screen structure, permissions, workflows, and more, across the tabs. This is what you hand to developers as a head start. It is scaffolding — a strong starting point, not the finished software.",
    "Projects & saving. Your work saves automatically in your browser. Use the Project drop-down at the top to keep several businesses side by side, rename them, or start a new one.",
    "A note on cost. Each “Generate” button asks an AI model to do the work, which costs a small amount per click (shown as a spend estimate). Nothing is charged for browsing or editing.",
  ],
};

const DE: { intro: string[]; steps: Step[]; closing: string[] } = {
  intro: [
    "Der Kiln verwandelt eine Beschreibung Ihres Unternehmens in normaler Sprache in ein vollständiges, strukturiertes Abbild seiner Funktionsweise – und sogar in einen Startpunkt für Software. Sie müssen dafür nicht technisch sein.",
    "Stellen Sie es sich wie einen „Business-Compiler“ vor: Sie erzählen die Geschichte Ihres Unternehmens in ganz normalen Worten, und die App baut daraus das Modell. Die goldene Regel ist einfach – Ihre Worte sind die Wahrheit. Alles, was Sie auf dem Bildschirm sehen (die Karte, die Kästchen, der generierte Code), entsteht aus Ihrer Beschreibung. Wirkt etwas falsch, korrigieren Sie Ihre Beschreibung oder das Kästchen – der Rest passt sich an.",
    "Sie arbeiten von oben nach unten. Jeder Schritt fügt eine weitere Detailebene hinzu und baut auf der vorherigen auf. Sie können jederzeit aufhören – schon die ersten Schritte geben Ihnen eine klare Landkarte Ihres Unternehmens.",
  ],
  steps: [
    {
      n: "1",
      heading: "Beschreiben Sie Ihr Unternehmen",
      why: "Das ist das Fundament. Je klarer Ihre Beschreibung, desto besser alles Weitere. Nichts geht dabei verloren – die App führt alles auf das zurück, was Sie geschrieben haben.",
      how: "Nutzen Sie die linke Spalte. Der Tab „Interview“ stellt Ihnen Fragen wie ein freundlicher Unternehmensberater; antworten Sie einfach in eigenen Worten. Oder fügen Sie im Tab „Markdown“ eine Beschreibung unter den vorgegebenen Überschriften ein.",
      example: "„Wir sind ein Solarteur. Wir gewinnen Kunden, planen eine Anlage für ihr Dach, bestellen die Teile, installieren sie und stellen die Rechnung.“",
    },
    {
      n: "2",
      heading: "Fähigkeiten – die Bausteine",
      why: "Fähigkeiten sind die großen Dinge, die Ihr Unternehmen tut – seine „Arbeitsblöcke“. Alles Weitere im Modell hängt an ihnen.",
      how: "Klicken Sie auf „Mit LLM generieren“. Eine Karte aus Kästchen erscheint. Klicken Sie ein Kästchen an, um es zu lesen oder zu bearbeiten; mit „+ Fähigkeit“ fügen Sie eine hinzu.",
      example: "Beim Solarteur entstehen Kästchen wie Lead-Management, Planung, Beschaffung, Installation und Abrechnung.",
    },
    {
      n: "3",
      heading: "Geschäftsbereiche – die Bausteine gruppieren",
      why: "Bereiche fassen zusammengehörige Fähigkeiten zu Teilen des Unternehmens zusammen – etwa Vertrieb, Lieferung und Finanzen. Sie geben den Überblick und werden später zu den Modulen der Software.",
      how: "Klicken Sie auf „Bereiche generieren“. Die Karte färbt jede Fähigkeit nach ihrem Bereich, mit einer Legende oben. Klicken Sie einen Bereich an, um ihn umzubenennen oder die Zuordnung anzupassen.",
      example: "Lead-, Kunden- & Angebotsmanagement → „Vertrieb & Onboarding“; Planung, Beschaffung, Installation → „Lieferung“; Abrechnung → „Finanzen“.",
    },
    {
      n: "4",
      heading: "Entitäten – die Dinge, die Sie festhalten",
      why: "Entitäten sind die Datensätze, die Ihr Unternehmen führt – die Dinge, über die Sie Informationen speichern. Jede hat Felder (z. B. Name, Betrag, Datum). Das sind Ihre Daten und werden später zu Datenbanktabellen und Formularen.",
      how: "Klicken Sie auf „Entitäten generieren“. Öffnen Sie eine Fähigkeit und klappen Sie ihre Entität auf, um die Felder zu sehen und zu bearbeiten. Geben Sie jedem Feld einen einfachen Typ – Text, Zahl, Ja/Nein, Datum, Betrag oder Verweis.",
      example: "Die Abrechnung besitzt eine Rechnung mit den Feldern Betrag (Betrag), Fälligkeitsdatum (Datum) und bezahlt (Ja/Nein).",
    },
    {
      n: "5",
      heading: "Verhalten – Aktionen und was passiert",
      why: "Das erfasst, was Ihr Unternehmen tatsächlich tut: die Aktionen, die Menschen ausführen, und die Fakten, die daraus entstehen. Das ist der Unterschied zwischen einer statischen Liste und einem lebendigen Modell des Betriebs.",
      how: "Klicken Sie auf „Verhalten generieren“. Öffnen Sie eine Fähigkeit, dann eine Entität, und klappen Sie „Was passiert“ auf, um Aktionen (z. B. Lead qualifizieren) und die daraus folgenden Ereignisse (z. B. Lead qualifiziert) zu sehen. Manche Ereignisse sind zeitgesteuert, etwa „Rechnung überfällig“.",
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
      how: "Klicken Sie auf „Rollen generieren“. Öffnen Sie eine Fähigkeit, um zu sehen, welche Rollen sie ausführen dürfen.",
      example: "Vertriebsmitarbeiter → Lead-Management; Monteur → Installation; Finanzsachbearbeiter → Abrechnung.",
    },
    {
      n: "8",
      heading: "Abläufe – die durchgängigen Prozesse",
      why: "Abläufe sind die benannten Prozesse, die Schritt für Schritt durch Ihr ganzes Unternehmen laufen. Sie zeigen die Reise, nicht nur die einzelnen Aktionen.",
      how: "Klicken Sie auf „Abläufe generieren“. Jeder Ablauf ist eine geordnete Folge der Aktionen aus Schritt 5.",
      example: "„Order to Cash“: Lead qualifizieren → Angebot erstellen → Angebot annehmen → Installation planen → Rechnung stellen → Zahlung erfassen.",
    },
    {
      n: "9",
      heading: "Agenten – autonome Helfer",
      why: "Agenten beschreiben, wo Software oder KI Teile des Unternehmens übernehmen könnte, jeweils mit einem klaren Ziel. Das ist vorausschauend: Es zeigt die Automatisierungschancen.",
      how: "Klicken Sie auf „Agenten generieren“. Jeder Agent hat ein Ziel und die Fähigkeiten, die er ausführen würde.",
      example: "Ein „Vertriebsagent“, dessen Ziel es ist, eingehende Leads in geplante Installationen zu verwandeln.",
    },
  ],
  closing: [
    "Qualität prüfen. Das Abzeichen oben an der Karte ist Ihre Qualitätsampel. Grün heißt: keine Probleme gefunden. Zeigt es Befunde, hat die App eine Lücke oder Unstimmigkeit entdeckt – klicken Sie einen Befund an, um direkt dorthin zu springen. Die App prüft Ihr Modell automatisch und lässt niemals stillschweigend ein fehlerhaftes durch.",
    "Bearbeiten. Alles, was die App erzeugt, ist ein Vorschlag, kein Urteil. Klicken Sie ein Kästchen an, um es zu ändern; Ihre Änderungen bleiben erhalten und werden mit ✎ markiert. Entfernen Sie, was nicht passt, ergänzen Sie, was fehlt – Sie haben immer die Kontrolle.",
    "Code ansehen – der Lohn. Klicken Sie auf „Code ansehen“, um Ihr Unternehmen als technischen Bauplan zu sehen: Datentypen, eine API, die Bildschirmstruktur, Rechte, Abläufe und mehr, in den Tabs. Das übergeben Sie Entwicklern als Vorsprung. Es ist ein Gerüst – ein starker Startpunkt, nicht die fertige Software.",
    "Projekte & Speichern. Ihre Arbeit wird automatisch im Browser gespeichert. Über das Projekt-Auswahlfeld oben können Sie mehrere Unternehmen nebeneinander führen, umbenennen oder ein neues beginnen.",
    "Hinweis zu Kosten. Jeder „Generieren“-Knopf lässt ein KI-Modell arbeiten, was pro Klick einen kleinen Betrag kostet (als Ausgabenschätzung angezeigt). Für Ansehen und Bearbeiten fällt nichts an.",
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
