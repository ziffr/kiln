// Human-facing remediation for each validator finding code — the "what do I do about it?" that the
// terse validator message doesn't give. Keyed by the full finding code (e.g. "CE2.command_target").
// Unknown codes fall back to a generic hint in the UI. Bilingual (DE default = the app's base locale).

type Fix = { de: string; en: string };

const FIX: Record<string, Fix> = {
  // Capabilities (V*)
  "V4.orphan": { de: "Diese Fähigkeit hängt mit keiner anderen zusammen. Die Fähigkeit öffnen (klicken) und im Detailbereich unter „Hängt ab von“ eine andere Fähigkeit auswählen – oder als eigenständig akzeptieren (ausblenden).", en: "This capability connects to no other. Open it (click) and pick another capability under “Depends on” in the detail panel — or accept it as standalone (dismiss)." },
  // Business areas (BC*)
  "BC2.unassigned": { de: "Diese Fähigkeit gehört zu keinem Geschäftsbereich. Auf dem Bereiche-Screen einem Bereich zuordnen.", en: "This capability isn't in any business area. Assign it to one on the Areas screen." },
  "BC9.cohesion": { de: "Die Fähigkeiten dieses Bereichs hängen kaum voneinander ab. Bereich ggf. zusammenlegen oder neu aufteilen.", en: "This area's capabilities barely depend on each other. Consider merging or re-splitting the area." },
  // Entities / domain (DM*)
  "DM2.owner": { de: "Die besitzende Fähigkeit dieser Entität existiert nicht. Besitzer auf dem Entitäten-Screen neu setzen.", en: "This entity's owning capability doesn't exist. Reassign the owner on the Entities screen." },
  "DM5.uncovered": { de: "Diese Fähigkeit besitzt keine Entität (nichts zu speichern). Eine Entität ergänzen – oder akzeptieren.", en: "This capability owns no entity (nothing to store). Add one — or accept it." },
  "DM6.dangling": { de: "Diese Entität verweist auf eine andere, die es nicht gibt. Referenz korrigieren.", en: "This entity references another that doesn't exist. Fix the reference." },
  // Behaviour: commands & events (CE*)
  "CE2.command_target": { de: "Das Kommando wirkt auf eine Entität, die es nicht gibt. Die Entität auf dem Entitäten-Screen anlegen – oder das Kommando auf eine bestehende Entität richten.", en: "This command acts on an entity that doesn't exist. Add that entity on the Entities screen — or point the command at an existing one." },
  "CE3.event_source": { de: "Das Ereignis gehört zu einer Entität, die es nicht gibt. Entität anlegen oder Ereignis neu zuordnen.", en: "This event belongs to an entity that doesn't exist. Add the entity or reassign the event." },
  "CE4.emit_target": { de: "Das Kommando löst ein Ereignis aus, das es nicht gibt. Ereignis anlegen oder Referenz korrigieren.", en: "This command emits an event that doesn't exist. Add the event or fix the reference." },
  "CE7.no_command": { de: "Diese Entität wird von keinem Kommando verändert – sie ist rein lesend. Auf dem Verhalten-Screen ein Kommando ergänzen – oder akzeptieren (ausblenden).", en: "No command changes this entity — it's read-only. Add a command on the Behaviour screen — or accept it (dismiss)." },
  "CE8.orphan_event": { de: "Dieses Ereignis wird von keinem Kommando ausgelöst. Ein Kommando damit verdrahten oder das Ereignis entfernen.", en: "This event is emitted by no command. Wire a command to emit it, or remove the event." },
  // Automations / policies (PL*)
  "PL2.trigger": { de: "Das auslösende Ereignis dieser Automatisierung existiert nicht. Auf ein echtes Ereignis richten.", en: "This automation's trigger event doesn't exist. Point it at a real event." },
  "PL3.reaction": { de: "Das Reaktions-Kommando dieser Automatisierung existiert nicht. Auf ein echtes Kommando richten.", en: "This automation's reaction command doesn't exist. Point it at a real command." },
  "PL6.self_loop": { de: "Die Reaktion feuert innerhalb derselben Entität – meist ist das schon der eigene Emit des Kommandos, keine separate Automatisierung. Entfernen – oder ausblenden, falls gewollt.", en: "The reaction fires within the same entity — usually that's just the command's own emit, not a separate automation. Remove it — or dismiss if intentional." },
  "PL7.cycle": { de: "Diese Automatisierungen bilden eine Schleife (A löst B löst A …), die endlos laufen kann. Eine Verbindung entfernen, um den Zyklus zu brechen.", en: "These automations form a loop (A triggers B triggers A…) that can run forever. Remove one link to break the cycle." },
  // Roles (RO*)
  "RO2.capability": { de: "Diese Rolle berechtigt eine Fähigkeit, die es nicht gibt. Referenz korrigieren.", en: "This role authorizes a capability that doesn't exist. Fix the reference." },
  "RO5.unauthorized": { de: "Diese Fähigkeit hat keine ausführende Rolle. Auf dem Rollen-Screen eine Rolle zuweisen.", en: "This capability has no role that can perform it. Assign a role on the Roles screen." },
  "RO6.empty": { de: "Diese Rolle berechtigt nichts. Ihr mindestens eine Fähigkeit geben – oder die Rolle entfernen.", en: "This role authorizes nothing. Give it at least one capability — or remove it." },
  // Workflows (WF*)
  "WF2.unknown": { de: "Dieser Ablauf-Schritt verweist auf ein Kommando, das es nicht gibt. Schritt korrigieren.", en: "This workflow step references a command that doesn't exist. Fix the step." },
  "WF5.steps": { de: "Dieser Ablauf hat weniger als zwei Schritte – als Ablauf kaum sinnvoll. Schritte ergänzen oder als Kommando behandeln.", en: "This workflow has fewer than two steps — barely a workflow. Add steps or treat it as a single command." },
  // Agents (AG*)
  "AG2.capability": { de: "Dieser Agent betreibt eine Fähigkeit, die es nicht gibt. Referenz korrigieren.", en: "This agent operates a capability that doesn't exist. Fix the reference." },
  "AG5.empty": { de: "Dieser Agent betreibt nichts. Ihm eine Fähigkeit geben – oder den Agenten entfernen.", en: "This agent operates nothing. Give it a capability — or remove the agent." },
};

export function findingFix(code: string, lang: string): string | undefined {
  const f = FIX[code];
  if (!f) return undefined;
  return lang.startsWith("de") ? f.de : f.en;
}
