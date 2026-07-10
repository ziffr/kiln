import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Bilingual DE/EN from day one (ADR-003 §3). UI chrome is keyed; model/narrative CONTENT
// stays in whatever language the user authored.
const resources = {
  de: {
    translation: {
      appTitle: "VerticalBusinessDesigner",
      tagline: "Business-Modell → Capability Map → Review",
      narrative: "Business-Narrativ",
      narrativeHint: "Beschreibe das Unternehmen. Fähigkeiten entstehen daraus.",
      sections: "Abschnitte",
      outcomes: "Geschäftsergebnisse",
      activities: "Kernaktivitäten",
      customers: "Kunden",
      capabilities: "Capability Map",
      validation: "Prüfung",
      clean: "Keine Befunde",
      findingsCount: "{{count}} Befund(e)",
      items: "Einträge",
      anchor: "Anker",
      language: "Sprache",
      dependsOn: "hängt ab von",
      generatedNote: "aus dem Narrativ generiert",
      model: "Modell",
      effort: "Aufwand",
      generateBtn: "Mit LLM generieren",
      generating: "Generiere…",
      source: "Quelle",
      mockLabel: "Mock (offline, ohne LLM)",
      serviceHint: "LLM-Dienst starten: npm run dev --workspace @vbd/service",
      thisCall: "dieser Aufruf",
      thisSession: "diese Sitzung",
      tokens: "Tokens",
      creditNote: "Geschätzte Ausgaben (kein Restguthaben). Kontostand nur in der Anthropic-Konsole.",
    },
  },
  en: {
    translation: {
      appTitle: "VerticalBusinessDesigner",
      tagline: "Business model → Capability Map → review",
      narrative: "Business Narrative",
      narrativeHint: "Describe the business. Capabilities are derived from it.",
      sections: "Sections",
      outcomes: "Business Outcomes",
      activities: "Core Activities",
      customers: "Customers",
      capabilities: "Capability Map",
      validation: "Validation",
      clean: "No findings",
      findingsCount: "{{count}} finding(s)",
      items: "items",
      anchor: "anchor",
      language: "Language",
      dependsOn: "depends on",
      generatedNote: "generated from the narrative",
      model: "Model",
      effort: "Effort",
      generateBtn: "Generate with LLM",
      generating: "Generating…",
      source: "Source",
      mockLabel: "mock (offline, no LLM)",
      serviceHint: "Start the LLM service: npm run dev --workspace @vbd/service",
      thisCall: "this call",
      thisSession: "this session",
      tokens: "tokens",
      creditNote: "Estimated spend (not remaining credit). Balance lives only in the Anthropic Console.",
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: "de",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
