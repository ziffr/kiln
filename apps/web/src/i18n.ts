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
      generatedNote: "aus dem Narrativ generiert (Mock-Generator, ohne LLM)",
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
      generatedNote: "generated from the narrative (mock generator, no LLM)",
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
